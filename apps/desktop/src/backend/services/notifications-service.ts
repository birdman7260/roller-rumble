import type {
  NotificationConfig,
  RacerNotification,
  RacerNotificationType,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import type { AppDatabase } from "../db/Database";
import { AppHttpError } from "./http-error";
import {
  getWebPushRuntimeConfig,
  isSilentNotificationType,
  sendNotificationPushes
} from "./notifications";

/**
 * Narrow database port for racer push subscriptions and notification delivery.
 * Expressed as a `Pick<AppDatabase, …>` so it tracks the real signatures at
 * compile time and documents exactly which tables this leaf service touches.
 */
export type NotificationStore = Pick<
  AppDatabase,
  | "getActiveEvent"
  | "ensureEventRegistration"
  | "getRacer"
  | "upsertPushSubscription"
  | "revokePushSubscription"
  | "listActivePushSubscriptionsForRacers"
  | "listNotificationsForRacer"
  | "markNotificationRead"
  | "createNotification"
  | "getNotification"
  | "listNotificationDeliveries"
  | "updateNotificationDeliveryPushStatus"
>;

/**
 * Leaf module owning racer push-subscription bookkeeping, the racer-facing
 * notification inbox, and Web Push dispatch. It never emits snapshots and never
 * knows the `AppSnapshot` shape: when an async push dispatch updates delivery
 * state, it calls the injected `onPushDelivered` hook so the coordinator
 * (`RollerRumbleApp`) decides when to broadcast — mirroring the sensor/OS2L
 * adapter callbacks.
 *
 * Cross-domain notification triggers (who to notify on a queue/tournament
 * event) stay in the app and call {@link createNotificationAndDispatch}.
 */
export class NotificationService {
  constructor(
    private readonly db: NotificationStore,
    private readonly onPushDelivered: () => void
  ) {}

  getNotificationConfig(): NotificationConfig {
    const { configured, publicKey, message } = getWebPushRuntimeConfig();
    return {
      configured,
      publicKey,
      message
    };
  }

  saveRacerPushSubscription(
    racerId: string,
    subscription: WebPushSubscriptionInput,
    userAgent?: string | null
  ): NotificationConfig {
    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racerId);
    }
    this.db.upsertPushSubscription(racerId, subscription, userAgent);
    return this.getNotificationConfig();
  }

  revokeRacerPushSubscription(
    racerId: string,
    subscription: WebPushSubscriptionInput
  ): NotificationConfig {
    const racer = this.db.getRacer(racerId);
    if (!racer) {
      throw new AppHttpError("Racer not found.", 404, "racer_not_found");
    }
    this.db.revokePushSubscription(subscription.endpoint);
    return this.getNotificationConfig();
  }

  listRacerNotifications(racerId: string): RacerNotification[] {
    return this.db.listNotificationsForRacer(racerId);
  }

  markRacerNotificationRead(racerId: string, notificationId: string): RacerNotification[] {
    this.db.markNotificationRead(racerId, notificationId);
    return this.listRacerNotifications(racerId);
  }

  /**
   * Persists a notification batch for the given racers and fires push delivery
   * in the background. Returns the number of deliveries created (0 when the
   * batch was deduplicated away). Callers own the snapshot broadcast for the
   * record write; the async push delivery signals back via `onPushDelivered`.
   */
  createNotificationAndDispatch(input: {
    eventId?: string | null;
    type: RacerNotificationType;
    title: string;
    body: string;
    url?: string | null;
    triggerKey?: string | null;
    channelKey?: string | null;
    createdBy?: string | null;
    racerIds: string[];
  }): number {
    const batch = this.db.createNotification({
      ...input,
      silent: isSilentNotificationType(input.type)
    });
    if (!batch) {
      return 0;
    }

    void this.dispatchNotificationPushes(batch.notification.id).catch((error: unknown) => {
      console.warn("[notifications] push dispatch failed", error);
    });
    return batch.deliveries.length;
  }

  private async dispatchNotificationPushes(notificationId: string): Promise<void> {
    const deliveries = this.db.listNotificationDeliveries(notificationId);
    if (deliveries.length === 0) {
      return;
    }

    const notificationRecord = this.db.getNotification(notificationId);
    if (!notificationRecord) {
      return;
    }

    const racerIds = deliveries.map((delivery) => delivery.racerId);
    await sendNotificationPushes({
      config: getWebPushRuntimeConfig(),
      notification: notificationRecord,
      deliveries,
      subscriptions: this.db.listActivePushSubscriptionsForRacers(racerIds),
      markDelivery: (deliveryId, result) => {
        this.db.updateNotificationDeliveryPushStatus(deliveryId, result);
      },
      revokeSubscription: (endpoint) => {
        this.db.revokePushSubscription(endpoint);
      }
    });
    this.onPushDelivered();
  }
}
