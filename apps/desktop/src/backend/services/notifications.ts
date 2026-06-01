import webpush from "web-push";
import type {
  NotificationConfig,
  QueueEntry,
  RacerNotificationType,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@goldsprints/shared/types";
import type {
  StoredNotificationDeliveryRecord,
  StoredNotificationRecord,
  StoredPushSubscription
} from "../db/Database";

const DEFAULT_WEB_PUSH_SUBJECT = "mailto:goldsprints@localhost.local";
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
}

export function getWebPushRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): WebPushRuntimeConfig {
  const publicKey = env.GOLDSPRINTS_WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.GOLDSPRINTS_WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const configuredSubject = env.GOLDSPRINTS_WEB_PUSH_SUBJECT?.trim();
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
  return {
    notificationId: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: notification.url ?? "/racer",
    createdAt: notification.createdAt
  };
}

export function getThirdUpcomingQueueEntry(entries: QueueEntry[]): QueueEntry | null {
  const visibleQueue = entries
    .filter((entry) => entry.status === "queued" || entry.status === "staging")
    .sort((left, right) => left.position - right.position);
  return visibleQueue[RACE_GET_READY_POSITION - 1] ?? null;
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
        await webpush.sendNotification(toWebPushSubscription(subscription.subscription), payload);
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
