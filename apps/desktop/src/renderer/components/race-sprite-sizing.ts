import type {
  RaceMetricsSnapshot,
  ThemeDefinition,
  ThemeSpriteAnimationDefinition
} from "@roller-rumble/shared/types";
import { resolveThemeSpriteSheet } from "../lib/theme-sprites";

function pickAnimation(
  currentSpeedKph: number,
  speedThresholdKph: number,
  slowAnimation: ThemeSpriteAnimationDefinition,
  fastAnimation: ThemeSpriteAnimationDefinition
): { animation: ThemeSpriteAnimationDefinition; speedState: "fast" | "slow" } {
  if (currentSpeedKph >= speedThresholdKph) {
    return { animation: fastAnimation, speedState: "fast" };
  }

  return { animation: slowAnimation, speedState: "slow" };
}

export function getRaceSpriteAnimation({
  metric,
  theme
}: {
  metric?: RaceMetricsSnapshot;
  theme: ThemeDefinition;
}): {
  animation: ThemeSpriteAnimationDefinition;
  speedState: "fast" | "slow";
} {
  const spriteSheet = resolveThemeSpriteSheet(theme);

  return pickAnimation(
    metric?.currentSpeedKph ?? 0,
    spriteSheet.speedThresholdKph,
    spriteSheet.slowAnimation,
    spriteSheet.fastAnimation
  );
}

export function getRaceSpriteDisplaySize({
  displayHeightRem,
  metric,
  theme
}: {
  displayHeightRem: number;
  metric?: RaceMetricsSnapshot;
  theme: ThemeDefinition;
}): { heightRem: number; widthRem: number } {
  const { animation } = getRaceSpriteAnimation({ metric, theme });

  return {
    heightRem: displayHeightRem,
    widthRem: displayHeightRem * (animation.frameWidth / animation.frameHeight)
  };
}
