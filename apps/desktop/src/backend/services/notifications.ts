import webpush from "web-push";
import type {
  NotificationConfig,
  QueueEntry,
  RacerNotificationType,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import type {
  StoredNotificationDeliveryRecord,
  StoredNotificationRecord,
  StoredPushSubscription
} from "../db/Database";

const DEFAULT_WEB_PUSH_SUBJECT = "mailto:roller-rumble@localhost.local";
const RACE_GET_READY_POSITION = 3;
type WebPushSendSubscription = Parameters<typeof webpush.sendNotification>[0];

export interface WebPushRuntimeConfig extends NotificationConfig {
  privateKey?: string | null;
  subject: string;
}

export interface NotificationPushPayload {
  notificationId: string;
  type: RacerNotificationType;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  /** Tray identity: the channel key (replace-in-place) or the notification id. */
  tag: string;
  /** Re-alert on replace. False for silent de-escalation/teardown updates (ADR-0013). */
  renotify: boolean;
  /** Suppress sound/vibration entirely. */
  silent: boolean;
  /** Keep the notification on screen until acknowledged (Android). */
  requireInteraction: boolean;
}

/**
 * Per-type notification presentation policy (ADR-0013): escalation buzzes and
 * (for "you're up") sticks; de-escalation and teardown update silently. `urgency`
 * and `ttlSeconds` are transport hints — time-sensitive pushes get a short TTL so
 * a phone that was offline never receives a stale alert late.
 */
export interface NotificationPresentation {
  renotify: boolean;
  silent: boolean;
  requireInteraction: boolean;
  urgency: "very-low" | "low" | "normal" | "high";
  ttlSeconds?: number;
}

const SILENT_UPDATE: NotificationPresentation = {
  renotify: false,
  silent: true,
  requireInteraction: false,
  urgency: "low"
};

const NOTIFICATION_PRESENTATION: Record<RacerNotificationType, NotificationPresentation> = {
  admin_message: { renotify: true, silent: false, requireInteraction: false, urgency: "normal" },
  queue_get_ready: {
    renotify: true,
    silent: false,
    requireInteraction: false,
    urgency: "high",
    ttlSeconds: 600
  },
  queue_you_are_up: {
    renotify: true,
    silent: false,
    requireInteraction: true,
    urgency: "high",
    // Longest window of the time-sensitive alerts: this is the most important
    // one, so a racer who is genuinely up but briefly off-network still gets it.
    // It's still bounded so a phone offline for the whole race never buzzes late.
    ttlSeconds: 900
  },
  queue_hang_tight: SILENT_UPDATE,
  queue_status_update: SILENT_UPDATE,
  tournament_started: {
    renotify: true,
    silent: false,
    requireInteraction: false,
    urgency: "high"
  },
  tournament_update: SILENT_UPDATE
};

export function getNotificationPresentation(type: RacerNotificationType): NotificationPresentation {
  return NOTIFICATION_PRESENTATION[type];
}

/** Types whose delivery is created pre-read so they never pop an in-app modal. */
export function isSilentNotificationType(type: RacerNotificationType): boolean {
  return getNotificationPresentation(type).silent;
}

export function getWebPushRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): WebPushRuntimeConfig {
  const publicKey = env.ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const configuredSubject = env.ROLLER_RUMBLE_WEB_PUSH_SUBJECT?.trim();
  const subject =
    configuredSubject !== undefined && configuredSubject.length > 0
      ? configuredSubject
      : DEFAULT_WEB_PUSH_SUBJECT;
  const missing = [
    publicKey ? null : "public key",
    privateKey ? null : "private key",
    subject ? null : "subject"
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missing.length === 0,
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    subject,
    message:
      missing.length === 0 ? "Web Push is ready." : `Web Push is missing ${missing.join(", ")}.`
  };
}

export function buildNotificationPushPayload(
  notification: StoredNotificationRecord
): NotificationPushPayload {
  const presentation = getNotificationPresentation(notification.type);
  return {
    notificationId: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: notification.url ?? "/racer",
    createdAt: notification.createdAt,
    tag: notification.channelKey ?? notification.id,
    renotify: presentation.renotify,
    silent: presentation.silent,
    requireInteraction: presentation.requireInteraction
  };
}

export function getThirdUpcomingQueueEntry(entries: QueueEntry[]): QueueEntry | null {
  const visibleQueue = entries
    .filter((entry) => entry.status === "queued" || entry.status === "staging")
    .sort((left, right) => left.position - right.position);
  return visibleQueue[RACE_GET_READY_POSITION - 1] ?? null;
}

export function getFirstQueuedEntry(entries: QueueEntry[]): QueueEntry | null {
  return (
    entries
      .filter((entry) => entry.status === "queued")
      .sort((left, right) => left.position - right.position)[0] ?? null
  );
}

export function getTournamentNotificationRacerIds(bundle: TournamentBundle): string[] {
  return [
    ...new Set(
      [
        ...bundle.seeds.map((seed) => seed.racerId),
        ...bundle.bracketNodes.flatMap((node) => [node.racerAId, node.racerBId]),
        ...bundle.groupMatches.flatMap((match) => [match.racerAId, match.racerBId])
      ].filter((racerId): racerId is string => Boolean(racerId))
    )
  ];
}

function toWebPushSubscription(subscription: WebPushSubscriptionInput): WebPushSendSubscription {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    }
  };
}

export async function sendNotificationPushes(input: {
  config: WebPushRuntimeConfig;
  notification: StoredNotificationRecord;
  deliveries: StoredNotificationDeliveryRecord[];
  subscriptions: StoredPushSubscription[];
  markDelivery: (
    deliveryId: string,
    result: {
      status: "sent" | "failed" | "no_subscription";
      pushSubscriptionId?: string | null;
      pushError?: string | null;
      sentAt?: string | null;
    }
  ) => void;
  revokeSubscription: (endpoint: string) => void;
}): Promise<void> {
  const subscriptionsByRacerId = new Map<string, StoredPushSubscription[]>();
  for (const subscription of input.subscriptions) {
    const bucket = subscriptionsByRacerId.get(subscription.racerId) ?? [];
    bucket.push(subscription);
    subscriptionsByRacerId.set(subscription.racerId, bucket);
  }

  if (!input.config.configured || !input.config.publicKey || !input.config.privateKey) {
    for (const delivery of input.deliveries) {
      input.markDelivery(delivery.id, {
        status: "failed",
        pushError: input.config.message
      });
    }
    return;
  }

  webpush.setVapidDetails(input.config.subject, input.config.publicKey, input.config.privateKey);
  const payload = JSON.stringify(buildNotificationPushPayload(input.notification));
  const presentation = getNotificationPresentation(input.notification.type);
  const sendOptions: Parameters<typeof webpush.sendNotification>[2] = {
    urgency: presentation.urgency,
    ...(presentation.ttlSeconds !== undefined ? { TTL: presentation.ttlSeconds } : {})
  };

  for (const delivery of input.deliveries) {
    const racerSubscriptions = subscriptionsByRacerId.get(delivery.racerId) ?? [];
    if (racerSubscriptions.length === 0) {
      input.markDelivery(delivery.id, {
        status: "no_subscription",
        pushError: "No active push subscription for this racer."
      });
      continue;
    }

    let sentSubscriptionId: string | null = null;
    let lastError: string | null = null;
    for (const subscription of racerSubscriptions) {
      try {
        await webpush.sendNotification(
          toWebPushSubscription(subscription.subscription),
          payload,
          sendOptions
        );
        sentSubscriptionId = subscription.id;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;
        if (statusCode === 404 || statusCode === 410) {
          input.revokeSubscription(subscription.endpoint);
        }
        lastError = error instanceof Error ? error.message : "Push delivery failed.";
      }
    }

    input.markDelivery(delivery.id, {
      status: sentSubscriptionId ? "sent" : "failed",
      pushSubscriptionId: sentSubscriptionId,
      pushError: sentSubscriptionId ? null : lastError,
      sentAt: sentSubscriptionId ? new Date().toISOString() : null
    });
  }
}
