import { useEffect, useState } from "react";
import { queryOptions, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSnapshot } from "@roller-rumble/shared/types";
import {
  createWebSocketUrl,
  type SnapshotStreamSurface,
  fetchRuntimeEnvInfo,
  fetchMeta,
  fetchNotificationConfig,
  fetchPhotoBoothStatus,
  fetchRacerNotifications,
  fetchSnapshot
} from "./api";

export const snapshotQueryKey = ["snapshot"];
export const metaQueryKey = ["meta"];
export const runtimeEnvQueryKey = ["runtime-env"];
export const photoBoothStatusQueryKey = ["photo-booth-status"];
export const notificationConfigQueryKey = ["notification-config"];
export const racerNotificationsQueryKey = ["racer-notifications"];
const snapshotQueryOptions = queryOptions({
  queryKey: snapshotQueryKey,
  queryFn: fetchSnapshot
});
const metaQueryOptions = queryOptions({
  queryKey: metaQueryKey,
  queryFn: fetchMeta
});
const runtimeEnvQueryOptions = queryOptions({
  queryKey: runtimeEnvQueryKey,
  queryFn: fetchRuntimeEnvInfo
});
const photoBoothStatusQueryOptions = queryOptions({
  queryKey: photoBoothStatusQueryKey,
  queryFn: fetchPhotoBoothStatus
});
const notificationConfigQueryOptions = queryOptions({
  queryKey: notificationConfigQueryKey,
  queryFn: fetchNotificationConfig
});
const racerNotificationsQueryOptions = (enabled: boolean) =>
  queryOptions({
    queryKey: racerNotificationsQueryKey,
    queryFn: fetchRacerNotifications,
    enabled
  });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false
    }
  }
});

export function useSnapshotQuery() {
  return useQuery(snapshotQueryOptions);
}

export function useMetaQuery() {
  return useQuery(metaQueryOptions);
}

export function useRuntimeEnvQuery() {
  return useQuery(runtimeEnvQueryOptions);
}

export function usePhotoBoothStatusQuery() {
  return useQuery(photoBoothStatusQueryOptions);
}

export function useNotificationConfigQuery() {
  return useQuery(notificationConfigQueryOptions);
}

export function useRacerNotificationsQuery(enabled: boolean) {
  return useQuery(racerNotificationsQueryOptions(enabled));
}

export function hasNotificationRevisionChanged(
  previousSnapshot: Pick<AppSnapshot, "notificationRevision"> | null | undefined,
  nextSnapshot: Pick<AppSnapshot, "notificationRevision">
): boolean {
  return previousSnapshot?.notificationRevision !== nextSnapshot.notificationRevision;
}

function isSnapshotMessage(value: unknown): value is {
  type: string;
  payload: AppSnapshot;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "payload" in value
  );
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15000;

/**
 * Subscribes to the snapshot WebSocket stream for the given surface and keeps
 * the connection alive across drops. Phones served over LAN or the Cloudflare
 * tunnel routinely lose the socket when the tab is backgrounded, the screen
 * sleeps, or the tunnel times out an idle connection, so we reconnect with
 * exponential backoff and re-sync the snapshot on every (re)connect instead of
 * relying on a manual refresh.
 *
 * Returns `true` while the socket is open so surfaces can show a stale/offline
 * indicator when live updates have stopped.
 */
export function useSnapshotStream(surface?: SnapshotStreamSurface): boolean {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (disposed) {
        return;
      }
      socket = new WebSocket(createWebSocketUrl(surface));
      socket.onopen = () => {
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        setConnected(true);
        // We may have missed broadcasts while disconnected, so pull the current
        // snapshot immediately rather than waiting for the next server push.
        void client.invalidateQueries({ queryKey: snapshotQueryKey });
      };
      socket.onerror = (event) => {
        // eslint-disable-next-line no-console
        console.error("[snapshot-stream] websocket error", event);
      };
      socket.onclose = (event) => {
        if (!disposed) {
          setConnected(false);
        }
        if (!event.wasClean) {
          // eslint-disable-next-line no-console
          console.error("[snapshot-stream] websocket closed unexpectedly", event);
        }
        scheduleReconnect();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        const message = JSON.parse(event.data) as unknown;
        if (!isSnapshotMessage(message)) {
          return;
        }
        if (message.type === "snapshot") {
          const previousSnapshot = client.getQueryData<AppSnapshot>(snapshotQueryKey);
          const tunnelChanged =
            previousSnapshot?.tunnel.publicUrl !== message.payload.tunnel.publicUrl ||
            previousSnapshot?.tunnel.status !== message.payload.tunnel.status;
          const notificationsChanged = hasNotificationRevisionChanged(
            previousSnapshot,
            message.payload
          );

          client.setQueryData(snapshotQueryKey, message.payload);
          if (tunnelChanged) {
            void client.invalidateQueries({ queryKey: metaQueryKey });
          }
          void client.invalidateQueries({ queryKey: photoBoothStatusQueryKey });
          if (notificationsChanged) {
            void client.invalidateQueries({ queryKey: racerNotificationsQueryKey });
          }
        }
      };
    };

    // When the phone wakes or the network returns, don't wait out the backoff —
    // drop any stale socket and reconnect right away.
    const forceReconnect = () => {
      if (disposed) {
        return;
      }
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      connect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        forceReconnect();
      }
    };

    window.addEventListener("online", forceReconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", forceReconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [client, surface]);

  return connected;
}
