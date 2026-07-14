import webpush from "web-push";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueEntry, TournamentBundle } from "@roller-rumble/shared/types";
import {
  buildNotificationPushPayload,
  getNotificationPresentation,
  getThirdUpcomingQueueEntry,
  getTournamentNotificationRacerIds,
  getWebPushRuntimeConfig,
  isSilentNotificationType,
  sendNotificationPushes
} from "./notifications";

const timestamp = "2026-05-30T00:00:00.000Z";

function queueEntry(id: string, position: number, racerIds: string[]): QueueEntry {
  return {
    id,
    eventId: "event-1",
    type: racerIds.length > 1 ? "match" : "solo",
    requestedType: racerIds.length > 1 ? "auto-match" : "solo",
    lockType: "flex",
    position,
    racerIds,
    occurrenceIds: racerIds.map((racerId) => `${id}-${racerId}`),
    priorityScore: 0,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("notification helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports missing Web Push configuration without exposing private key details", () => {
    expect(getWebPushRuntimeConfig({})).toMatchObject({
      configured: false,
      publicKey: null
    });
  });

  it("reports Web Push as configured when VAPID keys are present", () => {
    expect(
      getWebPushRuntimeConfig({
        ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY: "public",
        ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY: "private",
        ROLLER_RUMBLE_WEB_PUSH_SUBJECT: "mailto:test@example.com"
      })
    ).toMatchObject({
      configured: true,
      publicKey: "public",
      subject: "mailto:test@example.com"
    });
  });

  it("selects the third visible upcoming queue entry", () => {
    const third = getThirdUpcomingQueueEntry([
      queueEntry("fourth", 4, ["racer-4"]),
      queueEntry("first", 1, ["racer-1"]),
      { ...queueEntry("removed", 2, ["removed"]), status: "removed" },
      queueEntry("second", 2, ["racer-2", "racer-3"]),
      queueEntry("third", 3, ["racer-5"])
    ]);

    expect(third?.id).toBe("third");
  });

  it("deduplicates tournament notification racer ids from seeds and matches", () => {
    const bundle = {
      seeds: [
        { racerId: "racer-1", seed: 1, score: 10, label: "1" },
        { racerId: "racer-2", seed: 2, score: 9, label: "2" }
      ],
      bracketNodes: [
        {
          id: "node-1",
          tournamentId: "tournament-1",
          stageId: "stage-1",
          roundNumber: 1,
          matchNumber: 1,
          slotLabel: "A",
          racerAId: "racer-2",
          racerBId: "racer-3",
          winnerRacerId: null,
          winnerToNodeId: null,
          loserToNodeId: null,
          state: "ready",
          meta: {},
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      groupMatches: [{ id: "group-1", racerAId: "racer-3", racerBId: "racer-4" }]
    } as TournamentBundle;

    expect(getTournamentNotificationRacerIds(bundle)).toEqual([
      "racer-1",
      "racer-2",
      "racer-3",
      "racer-4"
    ]);
  });

  it("builds a compact service-worker push payload with channel tag and presentation", () => {
    expect(
      buildNotificationPushPayload({
        id: "notification-1",
        eventId: "event-1",
        type: "queue_get_ready",
        title: "Get ready",
        body: "You are third.",
        url: "/racer",
        triggerKey: "queue-third",
        channelKey: "queue-status:event-1:racer-1",
        supersededAt: null,
        createdBy: null,
        createdAt: timestamp
      })
    ).toEqual({
      notificationId: "notification-1",
      type: "queue_get_ready",
      title: "Get ready",
      body: "You are third.",
      url: "/racer",
      createdAt: timestamp,
      tag: "queue-status:event-1:racer-1",
      renotify: true,
      silent: false,
      requireInteraction: false
    });
  });

  it("buzzes and sticks on escalation, updates silently on teardown (ADR-0013)", () => {
    // Escalation: "you're up" re-alerts and stays on screen.
    const youAreUp = getNotificationPresentation("queue_you_are_up");
    expect(youAreUp.silent).toBe(false);
    expect(youAreUp.renotify).toBe(true);
    expect(youAreUp.requireInteraction).toBe(true);
    expect(youAreUp.urgency).toBe("high");
    expect(youAreUp.ttlSeconds).toBeGreaterThan(0);

    // Teardown/de-escalation: silent replace-in-place.
    expect(isSilentNotificationType("queue_status_update")).toBe(true);
    expect(isSilentNotificationType("tournament_update")).toBe(true);
    const statusUpdate = getNotificationPresentation("queue_status_update");
    expect(statusUpdate.silent).toBe(true);
    expect(statusUpdate.renotify).toBe(false);

    // Escalation types are never created pre-read.
    expect(isSilentNotificationType("queue_you_are_up")).toBe(false);
    expect(isSilentNotificationType("admin_message")).toBe(false);
  });

  it("uses the notification id as the tag when there is no channel", () => {
    const payload = buildNotificationPushPayload({
      id: "notification-2",
      type: "admin_message",
      title: "Hello",
      body: "Host message.",
      url: "/racer",
      createdAt: timestamp
    });
    expect(payload.tag).toBe("notification-2");
  });

  it("marks silent status updates for quiet replace-in-place", () => {
    const payload = buildNotificationPushPayload({
      id: "notification-3",
      type: "queue_status_update",
      title: "Nice work!",
      body: "That's your race done.",
      url: "/racer",
      channelKey: "queue-status:event-1:racer-1",
      createdAt: timestamp
    });
    expect(payload.silent).toBe(true);
    expect(payload.renotify).toBe(false);
  });

  it("keeps inbox delivery records when Web Push is not configured", async () => {
    const markDelivery = vi.fn();

    await sendNotificationPushes({
      config: {
        configured: false,
        publicKey: null,
        privateKey: null,
        subject: "mailto:test@example.com",
        message: "Web Push is missing public key, private key."
      },
      notification: {
        id: "notification-1",
        eventId: "event-1",
        type: "admin_message",
        title: "Update",
        body: "Still visible in the inbox.",
        url: "/racer",
        triggerKey: null,
        createdBy: "admin",
        createdAt: timestamp
      },
      deliveries: [
        {
          id: "delivery-1",
          notificationId: "notification-1",
          racerId: "racer-1",
          status: "pending",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      subscriptions: [],
      markDelivery,
      revokeSubscription: vi.fn()
    });

    expect(markDelivery).toHaveBeenCalledWith("delivery-1", {
      status: "failed",
      pushError: "Web Push is missing public key, private key."
    });
  });

  it("revokes dead browser subscriptions when push providers reject them as gone", async () => {
    vi.spyOn(webpush, "setVapidDetails").mockImplementation(() => undefined);
    vi.spyOn(webpush, "sendNotification").mockRejectedValue(
      Object.assign(new Error("Gone"), { statusCode: 410 })
    );
    const markDelivery = vi.fn();
    const revokeSubscription = vi.fn();

    await sendNotificationPushes({
      config: {
        configured: true,
        publicKey: "public",
        privateKey: "private",
        subject: "mailto:test@example.com",
        message: "Web Push is ready."
      },
      notification: {
        id: "notification-1",
        eventId: "event-1",
        type: "queue_get_ready",
        title: "Get ready",
        body: "You are third.",
        url: "/racer",
        triggerKey: "queue-third",
        createdBy: null,
        createdAt: timestamp
      },
      deliveries: [
        {
          id: "delivery-1",
          notificationId: "notification-1",
          racerId: "racer-1",
          status: "pending",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      subscriptions: [
        {
          id: "subscription-1",
          racerId: "racer-1",
          endpoint: "https://push.example/subscription-1",
          subscription: {
            endpoint: "https://push.example/subscription-1",
            expirationTime: null,
            keys: {
              p256dh: "p256dh",
              auth: "auth"
            }
          },
          userAgent: "test",
          revokedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      markDelivery,
      revokeSubscription
    });

    expect(revokeSubscription).toHaveBeenCalledWith("https://push.example/subscription-1");
    expect(markDelivery).toHaveBeenCalledWith("delivery-1", {
      status: "failed",
      pushSubscriptionId: null,
      pushError: "Gone",
      sentAt: null
    });
  });
});
