import type { ThemeConfettiEffect } from "@roller-rumble/shared/types";
import confetti from "canvas-confetti";
import { useEffect, useRef } from "react";
import { scheduleConfettiEffect } from "../lib/confetti-effects";

export function WinnerConfetti({
  winnerKey,
  effectId,
  colors
}: {
  winnerKey: string | null;
  effectId: ThemeConfettiEffect;
  colors: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<ReturnType<typeof confetti.create> | null>(null);
  const lastWinnerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const fire = confetti.create(canvasRef.current, {
      resize: true,
      useWorker: true
    });
    confettiRef.current = fire;

    return () => {
      fire.reset();
      confettiRef.current = null;
      lastWinnerKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!winnerKey || !confettiRef.current || lastWinnerKeyRef.current === winnerKey) {
      return;
    }

    // Winner snapshots are rebroadcast several times, so key the effect to a single race/winner
    // pair and only celebrate once.
    lastWinnerKeyRef.current = winnerKey;
    const fire = confettiRef.current;
    // The chosen theme decides which celebration pattern to run, even if multiple themes
    // currently share the same burst implementation.
    const timers = scheduleConfettiEffect(effectId, fire, colors);

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [colors, effectId, winnerKey]);

  return <canvas ref={canvasRef} className="winner-confetti" />;
}
