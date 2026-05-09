import {
  DEFAULT_THEME_ID,
  THEME_CONNECTOR_STYLES,
  THEME_CONFETTI_EFFECTS,
  THEME_RACE_GRAPHIC_VARIANTS,
  THEME_SPRITE_SHEET_IDS,
  THEME_SURFACE_STYLES,
  THEME_UI_STYLES
} from "./constants";
import type { ThemeDefinition } from "./types";

const raceAvatarSpriteDefaults = {
  speedThresholdKph: 24,
  slowAnimation: {
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    row: 0,
    durationMs: 760
  },
  fastAnimation: {
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    row: 1,
    durationMs: 360
  }
} satisfies Omit<ThemeDefinition["spriteSheet"], "id">;

export const themes: ThemeDefinition[] = [
  {
    id: DEFAULT_THEME_ID,
    label: "Neon Night",
    description: "Fast, horizontal race lanes with arcade energy.",
    orientation: "horizontal",
    surfaceStyle: "default",
    uiStyle: "rounded",
    connectorStyle: "glow",
    fontFamily: '"Space Grotesk", "Avenir Next", sans-serif',
    raceGraphic: {
      variant: "track"
    },
    confettiEffectId: "burst",
    spriteSheet: {
      id: "neon-rider",
      ...raceAvatarSpriteDefaults
    },
    tokens: {
      surface: "#08111d",
      surfaceAlt: "#112338",
      accent: "#3cf2d2",
      accentSoft: "rgba(60, 242, 210, 0.16)",
      text: "#f7fbff",
      textMuted: "#b8d6e8",
      success: "#47ff98",
      warning: "#ffca57",
      danger: "#ff6f91",
      laneA: "#38bdf8",
      laneB: "#fb7185"
    }
  },
  {
    id: "summit-sprint",
    label: "Summit Sprint",
    description: "Vertical hill-climb presentation with warm mountain tones.",
    orientation: "vertical",
    surfaceStyle: "default",
    uiStyle: "rounded",
    connectorStyle: "shadow",
    fontFamily: '"Sora", "Avenir Next", sans-serif',
    raceGraphic: {
      variant: "climb"
    },
    confettiEffectId: "burst",
    spriteSheet: {
      id: "summit-rider",
      ...raceAvatarSpriteDefaults
    },
    tokens: {
      surface: "#20140f",
      surfaceAlt: "#3a251b",
      accent: "#ffb04f",
      accentSoft: "rgba(255, 176, 79, 0.14)",
      text: "#fff7ef",
      textMuted: "#efceb2",
      success: "#71f79f",
      warning: "#ffd166",
      danger: "#ff7b54",
      laneA: "#f7b267",
      laneB: "#7bdff2"
    }
  },
  {
    id: "frontier-trail",
    label: "Frontier Trail",
    description: "Dusty wagon-route presentation with rustic frontier colors.",
    orientation: "horizontal",
    surfaceStyle: "frontier",
    uiStyle: "rounded",
    connectorStyle: "trail",
    fontFamily: '"Rockwell", "Georgia", serif',
    raceGraphic: {
      variant: "trail",
      laneLabels: {
        default: "Heading west"
      },
      markers: {
        start: "Camp",
        finish: "Fort"
      }
    },
    confettiEffectId: "burst",
    spriteSheet: {
      id: "frontier-wagon",
      ...raceAvatarSpriteDefaults
    },
    tokens: {
      surface: "#1b120d",
      surfaceAlt: "#3d281b",
      accent: "#d8a15d",
      accentSoft: "rgba(216, 161, 93, 0.16)",
      text: "#fff4de",
      textMuted: "#d9c1a4",
      success: "#8ec07c",
      warning: "#f2c572",
      danger: "#d46a4b",
      laneA: "#c97a3d",
      laneB: "#8f5a32"
    }
  },
  {
    id: "oregon-trail-90",
    label: "Oregon Trail '90",
    description:
      "DOS-era classroom trail sim styling with a mostly black screen, VGA lettering, and CGA-inspired accents.",
    orientation: "horizontal",
    surfaceStyle: "black",
    uiStyle: "pixel",
    connectorStyle: "pixel",
    // The 1990 DOS release reads like an IBM PC classroom game, so this theme uses a VGA bitmap
    // recreation instead of the later Deluxe era's more illustrated western UI treatment.
    fontFamily: '"WebPlus IBM VGA 8x16", "Courier New", monospace',
    raceGraphic: {
      variant: "ledger",
      laneLabels: {
        solo: "Lead wagon",
        laneA: "Trail party A",
        laneB: "Trail party B"
      },
      markers: {
        start: "INDEP.",
        middle: "FORT",
        finish: "OREGON"
      }
    },
    confettiEffectId: "burst",
    spriteSheet: {
      id: "oregon-wagon",
      ...raceAvatarSpriteDefaults
    },
    tokens: {
      surface: "#000000",
      surfaceAlt: "#000000",
      accent: "#d4b06a",
      accentSoft: "rgba(212, 176, 106, 0.1)",
      text: "#f3e1b7",
      textMuted: "#bba97d",
      success: "#6f9f6a",
      warning: "#d8bf67",
      danger: "#b76243",
      laneA: "#5d97a4",
      laneB: "#b77845"
    }
  }
];

export function getTheme(themeId: string): ThemeDefinition {
  return themes.find((theme) => theme.id === themeId) ?? themes[0];
}

export function validateThemes(definitions: ThemeDefinition[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const theme of definitions) {
    if (ids.has(theme.id)) {
      problems.push(`Duplicate theme id: ${theme.id}`);
    }
    ids.add(theme.id);

    if (!THEME_SURFACE_STYLES.includes(theme.surfaceStyle)) {
      problems.push(`Theme ${theme.id} has an unsupported surface style`);
    }

    if (!THEME_UI_STYLES.includes(theme.uiStyle)) {
      problems.push(`Theme ${theme.id} has an unsupported UI style`);
    }

    if (!THEME_CONNECTOR_STYLES.includes(theme.connectorStyle)) {
      problems.push(`Theme ${theme.id} has an unsupported connector style`);
    }

    if (!THEME_RACE_GRAPHIC_VARIANTS.includes(theme.raceGraphic.variant)) {
      problems.push(`Theme ${theme.id} has an unsupported race graphic variant`);
    }

    if (theme.orientation === "vertical" && theme.raceGraphic.variant !== "climb") {
      problems.push(`Theme ${theme.id} must use the climb variant for vertical race graphics`);
    }

    if (theme.orientation === "horizontal" && theme.raceGraphic.variant === "climb") {
      problems.push(`Theme ${theme.id} cannot use the climb variant for horizontal race graphics`);
    }

    if (!THEME_CONFETTI_EFFECTS.includes(theme.confettiEffectId)) {
      problems.push(`Theme ${theme.id} has an unsupported confetti effect id`);
    }

    if (!THEME_SPRITE_SHEET_IDS.includes(theme.spriteSheet.id)) {
      problems.push(`Theme ${theme.id} has an unsupported sprite sheet id`);
    }

    if (
      !Number.isFinite(theme.spriteSheet.speedThresholdKph) ||
      theme.spriteSheet.speedThresholdKph <= 0
    ) {
      problems.push(`Theme ${theme.id} has an invalid sprite speed threshold`);
    }

    for (const [state, animation] of [
      ["slow", theme.spriteSheet.slowAnimation],
      ["fast", theme.spriteSheet.fastAnimation]
    ] as const) {
      if (!Number.isInteger(animation.frameWidth) || animation.frameWidth <= 0) {
        problems.push(`Theme ${theme.id} has an invalid ${state} sprite frame width`);
      }

      if (!Number.isInteger(animation.frameHeight) || animation.frameHeight <= 0) {
        problems.push(`Theme ${theme.id} has an invalid ${state} sprite frame height`);
      }

      if (!Number.isInteger(animation.frameCount) || animation.frameCount <= 0) {
        problems.push(`Theme ${theme.id} has an invalid ${state} sprite frame count`);
      }

      if (!Number.isInteger(animation.row) || animation.row < 0) {
        problems.push(`Theme ${theme.id} has an invalid ${state} sprite row`);
      }

      if (!Number.isFinite(animation.durationMs) || animation.durationMs <= 0) {
        problems.push(`Theme ${theme.id} has an invalid ${state} sprite duration`);
      }
    }

    if (theme.spriteSheet.slowAnimation.row === theme.spriteSheet.fastAnimation.row) {
      problems.push(`Theme ${theme.id} must use separate sprite rows for slow and fast states`);
    }

    if (!theme.fontFamily) {
      problems.push(`Theme ${theme.id} is missing a font family`);
    }

    const tokenValues = Object.entries(theme.tokens);
    for (const [token, value] of tokenValues) {
      if (!value) {
        problems.push(`Theme ${theme.id} is missing token ${token}`);
      }
    }
  }

  return problems;
}
