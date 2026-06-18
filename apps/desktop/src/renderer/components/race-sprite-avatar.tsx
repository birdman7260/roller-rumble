import type { CSSProperties } from "react";
import type { RaceMetricsSnapshot, ThemeDefinition } from "@roller-rumble/shared/types";
import { resolveThemeSpriteSheet } from "../lib/theme-sprites";
import { getRaceSpriteAnimation, getRaceSpriteDisplaySize } from "./race-sprite-sizing";

interface RaceSpriteAvatarProps {
  displayHeightRem?: number;
  label: string;
  metric?: RaceMetricsSnapshot;
  theme: ThemeDefinition;
}

export function RaceSpriteAvatar({
  displayHeightRem = 3.25,
  label,
  metric,
  theme
}: RaceSpriteAvatarProps) {
  const spriteSheet = resolveThemeSpriteSheet(theme);
  const { animation, speedState } = getRaceSpriteAnimation({ metric, theme });
  const displayWidthRem = getRaceSpriteDisplaySize({ displayHeightRem, metric, theme }).widthRem;

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
    <img
      alt={`${label} ${speedState} race avatar`}
      className="race-sprite-avatar"
      data-sprite-speed={speedState}
      src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
      style={style}
    />
  );
}
