import type { ThemeConfettiEffect } from "@shared/types";
import type confetti from "canvas-confetti";

const confettiEffects: Record<
  ThemeConfettiEffect,
  {
    durationMs: number;
    run: (fire: ReturnType<typeof confetti.create>, colors: string[]) => number[];
  }
> = {
  burst: {
    // The longest delayed burst lands at 420ms and the particle decay keeps it visible for a bit
    // longer, so projector bracket choreography waits roughly this long before returning.
    durationMs: 2200,
    run: (fire, colors) => [
      window.setTimeout(() => {
        void fire({
          particleCount: 140,
          spread: 100,
          startVelocity: 42,
          scalar: 1.05,
          colors,
          origin: { x: 0.5, y: 0.62 }
        });
      }, 0),
      window.setTimeout(() => {
        void fire({
          particleCount: 90,
          angle: 60,
          spread: 70,
          startVelocity: 36,
          scalar: 0.95,
          colors,
          origin: { x: 0.04, y: 0.62 }
        });
      }, 160),
      window.setTimeout(() => {
        void fire({
          particleCount: 90,
          angle: 120,
          spread: 70,
          startVelocity: 36,
          scalar: 0.95,
          colors,
          origin: { x: 0.96, y: 0.62 }
        });
      }, 160),
      window.setTimeout(() => {
        void fire({
          particleCount: 120,
          spread: 120,
          startVelocity: 30,
          decay: 0.92,
          scalar: 0.9,
          colors,
          origin: { x: 0.5, y: 0.5 }
        });
      }, 420)
    ]
  }
};

export function scheduleConfettiEffect(
  effectId: ThemeConfettiEffect,
  fire: ReturnType<typeof confetti.create>,
  colors: string[]
): number[] {
  return confettiEffects[effectId].run(fire, colors);
}

export function getConfettiEffectDurationMs(effectId: ThemeConfettiEffect): number {
  return confettiEffects[effectId].durationMs;
}
