import type { ThemeDefinition, ThemeSpriteSheetDefinition } from "@shared/types";

import frontierWagonUrl from "../assets/sprites/frontier-wagon.svg";
import neonRiderUrl from "../assets/sprites/neon-rider.svg";
import oregonWagonUrl from "../assets/sprites/oregon-wagon.svg";
import summitRiderUrl from "../assets/sprites/summit-rider.svg";

const spriteSheetUrls = {
  "frontier-wagon": frontierWagonUrl,
  "neon-rider": neonRiderUrl,
  "oregon-wagon": oregonWagonUrl,
  "summit-rider": summitRiderUrl
} satisfies Record<ThemeSpriteSheetDefinition["id"], string>;

export interface ResolvedThemeSpriteSheet extends ThemeSpriteSheetDefinition {
  imageUrl: string;
  rowCount: number;
}

export function resolveThemeSpriteSheet(theme: ThemeDefinition): ResolvedThemeSpriteSheet {
  const { spriteSheet } = theme;
  const rowCount = Math.max(spriteSheet.slowAnimation.row, spriteSheet.fastAnimation.row) + 1;

  return {
    ...spriteSheet,
    imageUrl: spriteSheetUrls[spriteSheet.id],
    rowCount
  };
}
