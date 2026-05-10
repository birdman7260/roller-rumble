import { useEffect } from "react";
import { queryOptions, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSnapshot } from "@goldsprints/shared/types";
import { createWebSocketUrl, fetchMeta, fetchPhotoBoothStatus, fetchSnapshot } from "./api";

export const snapshotQueryKey = ["snapshot"];
export const metaQueryKey = ["meta"];
export const photoBoothStatusQueryKey = ["photo-booth-status"];
const snapshotQueryOptions = queryOptions({
  queryKey: snapshotQueryKey,
  queryFn: fetchSnapshot
});
const metaQueryOptions = queryOptions({
  queryKey: metaQueryKey,
  queryFn: fetchMeta
});
const photoBoothStatusQueryOptions = queryOptions({
  queryKey: photoBoothStatusQueryKey,
  queryFn: fetchPhotoBoothStatus
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

export function usePhotoBoothStatusQuery() {
  return useQuery(photoBoothStatusQueryOptions);
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

export function useSnapshotStream(): void {
  const client = useQueryClient();

  useEffect(() => {
    const socket = new WebSocket(createWebSocketUrl());
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

        client.setQueryData(snapshotQueryKey, message.payload);
        if (tunnelChanged) {
          void client.invalidateQueries({ queryKey: metaQueryKey });
        }
        void client.invalidateQueries({ queryKey: photoBoothStatusQueryKey });
      }
    };
    return () => {
      socket.close();
    };
  }, [client]);
}
