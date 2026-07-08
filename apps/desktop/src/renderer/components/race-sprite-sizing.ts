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

/**
 * Rider-marker sizing on the horizontal track variant. The marker size is a
 * continuous function of the race graphic's measured height, so it scales
 * smoothly instead of jumping at fixed viewport-height breakpoints. The result
 * is published as the `--race-marker-size` CSS variable and reused for the
 * sprite and the marker's horizontal offset math — one source of truth so the
 * reserved layout space and the sprite can never disagree.
 */
export const MARKER_SIZE_MIN_REM = 3.4;
export const MARKER_SIZE_MAX_REM = 5.6;
/** Marker height as a fraction of the graphic's measured height. */
export const MARKER_SIZE_HEIGHT_RATIO = 0.11;

/**
 * Map a measured graphic height (px) to a marker size (rem), clamped to a
 * sensible range. Continuous and monotonic in `heightPx`, so the sprite grows
 * and shrinks smoothly as the window resizes.
 */
export function computeMarkerSizeRem(heightPx: number, rootFontSizePx: number): number {
  if (!Number.isFinite(heightPx) || heightPx <= 0 || rootFontSizePx <= 0) {
    return MARKER_SIZE_MAX_REM;
  }

  const rawRem = (heightPx * MARKER_SIZE_HEIGHT_RATIO) / rootFontSizePx;
  return Math.min(MARKER_SIZE_MAX_REM, Math.max(MARKER_SIZE_MIN_REM, rawRem));
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
