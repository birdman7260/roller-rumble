import type { CSSProperties } from "react";
import type {
  RaceMetricsSnapshot,
  ThemeDefinition,
  ThemeSpriteAnimationDefinition
} from "@shared/types";
import { resolveThemeSpriteSheet } from "../lib/theme-sprites";

interface RaceSpriteAvatarProps {
  label: string;
  metric?: RaceMetricsSnapshot;
  theme: ThemeDefinition;
}

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

export function RaceSpriteAvatar({ label, metric, theme }: RaceSpriteAvatarProps) {
  const spriteSheet = resolveThemeSpriteSheet(theme);
  const { animation, speedState } = pickAnimation(
    metric?.currentSpeedKph ?? 0,
    spriteSheet.speedThresholdKph,
    spriteSheet.slowAnimation,
    spriteSheet.fastAnimation
  );
  const displayHeightRem = 3.25;
  const displayWidthRem = displayHeightRem * (animation.frameWidth / animation.frameHeight);

  // The sprite row changes with speed, while the keyframes only scrub across columns.
  // That keeps theme assets replaceable as long as they preserve the declared frame grid.
  const style = {
    "--race-sprite-display-height": `${displayHeightRem}rem`,
    "--race-sprite-display-width": `${displayWidthRem}rem`,
    "--race-sprite-row-offset": `-${animation.row * displayHeightRem}rem`,
    "--race-sprite-sheet-height": `${spriteSheet.rowCount * displayHeightRem}rem`,
    "--race-sprite-sheet-width": `${animation.frameCount * displayWidthRem}rem`,
    animationDuration: `${animation.durationMs}ms`,
    animationTimingFunction: `steps(${animation.frameCount})`,
    backgroundImage: `url("${spriteSheet.imageUrl}")`
  } satisfies CSSProperties & Record<`--${string}`, string>;

  return (
    <span
      aria-label={`${label} ${speedState} race avatar`}
      className="race-sprite-avatar"
      data-sprite-speed={speedState}
      role="img"
      style={style}
    />
  );
}
