import type { CSSProperties } from "react";
import type { RaceMetricsSnapshot, ThemeDefinition } from "@roller-rumble/shared/types";
import type { BikeColor } from "../lib/bike-colors";
import { getSkeletonRiderCycleMs, getSkeletonRiderSheetUrl } from "../lib/skeleton-riders";
import { resolveThemeSpriteSheet } from "../lib/theme-sprites";
import { getRaceSpriteAnimation, getRaceSpriteDisplaySize } from "./race-sprite-sizing";

interface RaceSpriteAvatarProps {
  /** The bike the rider is on, which picks the skeleton sheet's colour. */
  bikeColor: BikeColor;
  displayHeightRem?: number;
  label: string;
  metric?: RaceMetricsSnapshot;
  /** Swap the themed rider sprite for the skeleton rider (the admin "skeleton riders" toggle). */
  skeletonRiders?: boolean;
  theme: ThemeDefinition;
}

export function RaceSpriteAvatar({
  bikeColor,
  displayHeightRem = 3.25,
  label,
  metric,
  skeletonRiders = false,
  theme
}: RaceSpriteAvatarProps) {
  const spriteSheet = resolveThemeSpriteSheet(theme);
  const { animation, speedState } = getRaceSpriteAnimation({ metric, theme });
  const displayWidthRem = getRaceSpriteDisplaySize({ displayHeightRem, metric, theme }).widthRem;

  // The themed sprite row changes with speed, while the keyframes only scrub across columns.
  // That keeps theme assets replaceable as long as they preserve the declared frame grid.
  // The skeleton sheet is a 3 × 3 grid whose keyframes move in both axes, so it needs no row
  // offset or column count from the theme; it only takes the speed state's pace.
  const themedSheetVariables: Record<`--${string}`, string> = skeletonRiders
    ? {}
    : {
        "--race-sprite-row-offset": `-${animation.row * displayHeightRem}rem`,
        "--race-sprite-sheet-height": `${spriteSheet.rowCount * displayHeightRem}rem`,
        "--race-sprite-sheet-width": `${animation.frameCount * displayWidthRem}rem`
      };
  const style: CSSProperties & Record<`--${string}`, string> = {
    "--race-sprite-display-height": `${displayHeightRem}rem`,
    "--race-sprite-display-width": `${displayWidthRem}rem`,
    ...themedSheetVariables,
    animationDuration: skeletonRiders
      ? `${getSkeletonRiderCycleMs(animation)}ms`
      : `${animation.durationMs}ms`,
    animationTimingFunction: skeletonRiders ? "step-end" : `steps(${animation.frameCount})`,
    backgroundImage: `url("${skeletonRiders ? getSkeletonRiderSheetUrl(bikeColor) : spriteSheet.imageUrl}")`
  };

  return (
    <div
      aria-label={`${label} ${speedState} race avatar`}
      className={
        skeletonRiders ? "race-sprite-avatar race-sprite-avatar--skeleton" : "race-sprite-avatar"
      }
      data-sprite-speed={speedState}
      role="img" // eslint-disable-line react-doctor/prefer-tag-over-role -- sprite is CSS background-image; background-image does not render on replaced elements like <img>
      style={style}
    />
  );
}
