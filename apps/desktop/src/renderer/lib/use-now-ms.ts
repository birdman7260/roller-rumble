import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs`, for readouts that count down to a moment the
 * snapshot doesn't change at.
 */
export function useNowMs(intervalMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timerId);
    };
  }, [intervalMs]);

  return nowMs;
}
