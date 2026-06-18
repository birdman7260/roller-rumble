import { useEffect } from "react";
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

export function useSnapshotStream(surface?: SnapshotStreamSurface): void {
  const client = useQueryClient();

  useEffect(() => {
    const socket = new WebSocket(createWebSocketUrl(surface));
    socket.onerror = (event) => {
      // eslint-disable-next-line no-console
      console.error("[snapshot-stream] websocket error", event);
    };
    socket.onclose = (event) => {
      if (!event.wasClean) {
        // eslint-disable-next-line no-console
        console.error("[snapshot-stream] websocket closed unexpectedly", event);
      }
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
    return () => {
      socket.close();
    };
  }, [client, surface]);
}
