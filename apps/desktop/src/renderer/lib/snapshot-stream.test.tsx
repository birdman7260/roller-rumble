import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotQueryKey, useSnapshotStream } from "./query";

/**
 * Minimal, controllable WebSocket stand-in. jsdom does not provide a real
 * WebSocket, and we need to drive open/close events by hand to exercise the
 * reconnect loop.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { wasClean: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emitClose(wasClean: boolean): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ wasClean });
  }
}

function renderStream() {
  const client = new QueryClient();
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useSnapshotStream("racer"), { wrapper });
  return { ...view, invalidateSpy };
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error("expected a websocket to have been opened");
  }
  return socket;
}

describe("useSnapshotStream reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports connected once the socket opens", () => {
    const { result } = renderStream();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current).toBe(false);

    act(() => latestSocket().emitOpen());

    expect(result.current).toBe(true);
  });

  it("reconnects after an unexpected close and re-syncs the snapshot", () => {
    const { result, invalidateSpy } = renderStream();
    act(() => latestSocket().emitOpen());
    invalidateSpy.mockClear();

    // The connection drops (phone slept, tunnel timed out an idle socket, ...).
    act(() => latestSocket().emitClose(false));
    expect(result.current).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // After the backoff delay a fresh socket is opened without any manual refresh.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);

    act(() => latestSocket().emitOpen());
    expect(result.current).toBe(true);
    // Reopening pulls the current snapshot so a frozen page catches up immediately.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: snapshotQueryKey });
  });

  it("stops reconnecting once unmounted", () => {
    const { unmount, result } = renderStream();
    act(() => latestSocket().emitOpen());

    unmount();
    act(() => latestSocket().emitClose(false));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // No new socket is created after teardown.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current).toBe(true);
  });
});
