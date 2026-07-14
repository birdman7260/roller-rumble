import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Racer } from "@roller-rumble/shared/types";
import { AppHttpError } from "./http-error";
import { sendNotificationPushes } from "./notifications";
import { NotificationService, type NotificationStore } from "./notifications-service";

vi.mock("./notifications", () => ({
  getWebPushRuntimeConfig: vi.fn(() => ({
    configured: true,
    publicKey: "pk-test",
    message: "Push is ready."
  })),
  sendNotificationPushes: vi.fn(async () => undefined),
  isSilentNotificationType: vi.fn(() => false)
}));

const timestamp = "2026-05-29T00:00:00.000Z";

function makeRacer(id: string): Racer {
  return {
    id,
    displayName: `Racer ${id}`,
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    identities: []
  };
}

function makeStore() {
  const racers = new Map<string, Racer>([["racer-1", makeRacer("racer-1")]]);
  const activeEvent = { id: "event-1" };
  const db = {
    getActiveEvent: vi.fn(() => activeEvent),
    ensureEventRegistration: vi.fn(),
    getRacer: vi.fn((racerId: string) => racers.get(racerId) ?? null),
    upsertPushSubscription: vi.fn(),
    revokePushSubscription: vi.fn(),
    listActivePushSubscriptionsForRacers: vi.fn(() => []),
    listNotificationsForRacer: vi.fn(() => [{ id: "notif-1" }]),
    markNotificationRead: vi.fn(),
    createNotification: vi.fn(() => ({
      notification: { id: "notif-1" },
      deliveries: [{ id: "delivery-1", racerId: "racer-1" }]
    })),
    getNotification: vi.fn(() => ({ id: "notif-1" })),
    listNotificationDeliveries: vi.fn(() => [{ id: "delivery-1", racerId: "racer-1" }]),
    updateNotificationDeliveryPushStatus: vi.fn()
  };
  return { db, racers, activeEvent };
}

type Store = ReturnType<typeof makeStore>;

function newService(store: Store, onPushDelivered = vi.fn()) {
  const service = new NotificationService(
    store.db as unknown as NotificationStore,
    onPushDelivered
  );
  return { service, onPushDelivered };
}

// Flush microtasks so the fire-and-forget dispatch chain settles before asserting.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("NotificationService", () => {
  beforeEach(() => {
    // clearAllMocks keeps the vi.mock factory implementations, only resetting call history.
    vi.clearAllMocks();
  });

  it("reports the public web-push config", () => {
    const store = makeStore();
    const { service } = newService(store);

    expect(service.getNotificationConfig()).toEqual({
      configured: true,
      publicKey: "pk-test",
      message: "Push is ready."
    });
  });

  it("registers the racer for the active event when saving a subscription", () => {
    const store = makeStore();
    const { service } = newService(store);

    const result = service.saveRacerPushSubscription(
      "racer-1",
      { endpoint: "https://push.example/abc" } as never,
      "test-agent"
    );

    expect(store.db.ensureEventRegistration).toHaveBeenCalledWith("event-1", "racer-1");
    expect(store.db.upsertPushSubscription).toHaveBeenCalledWith(
      "racer-1",
      { endpoint: "https://push.example/abc" },
      "test-agent"
    );
    expect(result).toMatchObject({ configured: true });
  });

  it("rejects revoking a subscription for an unknown racer", () => {
    const store = makeStore();
    const { service } = newService(store);

    expect(() =>
      service.revokeRacerPushSubscription("ghost", {
        endpoint: "https://push.example/abc"
      } as never)
    ).toThrow(AppHttpError);
    expect(store.db.revokePushSubscription).not.toHaveBeenCalled();
  });

  it("revokes a subscription for a known racer", () => {
    const store = makeStore();
    const { service } = newService(store);

    service.revokeRacerPushSubscription("racer-1", {
      endpoint: "https://push.example/abc"
    } as never);

    expect(store.db.revokePushSubscription).toHaveBeenCalledWith("https://push.example/abc");
  });

  it("returns the refreshed inbox after marking a notification read", () => {
    const store = makeStore();
    const { service } = newService(store);

    const result = service.markRacerNotificationRead("racer-1", "notif-1");

    expect(store.db.markNotificationRead).toHaveBeenCalledWith("racer-1", "notif-1");
    expect(result).toEqual([{ id: "notif-1" }]);
  });

  it("dispatches push deliveries and signals the coordinator", async () => {
    const store = makeStore();
    const { service, onPushDelivered } = newService(store);

    const count = service.createNotificationAndDispatch({
      type: "admin_message",
      title: "Heads up",
      body: "Race soon",
      racerIds: ["racer-1"]
    });

    expect(count).toBe(1);
    await flush();
    expect(sendNotificationPushes).toHaveBeenCalledOnce();
    expect(onPushDelivered).toHaveBeenCalledOnce();
  });

  it("returns 0 and skips dispatch when the batch is deduplicated", async () => {
    const store = makeStore();
    store.db.createNotification.mockReturnValue(null as never);
    const { service, onPushDelivered } = newService(store);

    const count = service.createNotificationAndDispatch({
      type: "queue_get_ready",
      title: "Get ready",
      body: "You are up",
      racerIds: ["racer-1"]
    });

    expect(count).toBe(0);
    await flush();
    expect(sendNotificationPushes).not.toHaveBeenCalled();
    expect(onPushDelivered).not.toHaveBeenCalled();
  });

  it("does not signal the coordinator when there are no deliveries to push", async () => {
    const store = makeStore();
    store.db.listNotificationDeliveries.mockReturnValue([]);
    const { service, onPushDelivered } = newService(store);

    service.createNotificationAndDispatch({
      type: "admin_message",
      title: "Heads up",
      body: "Race soon",
      racerIds: ["racer-1"]
    });

    await flush();
    expect(sendNotificationPushes).not.toHaveBeenCalled();
    expect(onPushDelivered).not.toHaveBeenCalled();
  });
});
