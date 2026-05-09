import type { LightSelection } from "./types";

export type LightLookPreview =
  | { type: "solid"; colors: readonly [string] }
  | { type: "gradient"; colors: readonly [string, string, ...string[]] }
  | { type: "chase"; colors: readonly [string, string, ...string[]] }
  | { type: "sparkle"; colors: readonly [string, string, ...string[]] };

export interface LightLookDefinition {
  id: string;
  label: string;
  isDefault?: boolean;
  preview: LightLookPreview;
  selection: LightSelection;
}

export const LIGHT_LOOKS: readonly LightLookDefinition[] = [
  {
    id: "solid-white",
    label: "Clean white",
    isDefault: true,
    preview: { type: "solid", colors: ["#fff8df"] },
    selection: {
      lookId: "solid-white",
      hue: 0,
      saturation: 0,
      brightness: 255,
      effectId: 0,
      effectSpeed: 128,
      effectIntensity: 128,
      paletteId: 0,
      label: "Clean white"
    }
  },
  {
    id: "solid-red",
    label: "Solid red",
    preview: { type: "solid", colors: ["#ff214d"] },
    selection: {
      lookId: "solid-red",
      hue: 350,
      saturation: 100,
      brightness: 255,
      effectId: 0,
      effectSpeed: 128,
      effectIntensity: 128,
      paletteId: 0,
      label: "Solid red"
    }
  },
  {
    id: "solid-blue",
    label: "Solid blue",
    preview: { type: "solid", colors: ["#2088ff"] },
    selection: {
      lookId: "solid-blue",
      hue: 214,
      saturation: 100,
      brightness: 255,
      effectId: 0,
      effectSpeed: 128,
      effectIntensity: 128,
      paletteId: 0,
      label: "Solid blue"
    }
  },
  {
    id: "kaleidoscope-rainbow",
    label: "Kaleidoscope rainbow",
    preview: {
      type: "gradient",
      colors: ["#ff214d", "#ffcc33", "#31ef72", "#2ad7ff", "#a855f7", "#ff4fb8"]
    },
    selection: {
      lookId: "kaleidoscope-rainbow",
      hue: 290,
      saturation: 100,
      brightness: 255,
      effectId: 67,
      effectSpeed: 146,
      effectIntensity: 188,
      paletteId: 11,
      label: "Kaleidoscope rainbow"
    }
  },
  {
    id: "chasing-rainbow",
    label: "Chasing rainbow",
    preview: {
      type: "chase",
      colors: ["#ff1744", "#ff9100", "#ffea00", "#00e676", "#00b0ff", "#651fff", "#ff2bd6"]
    },
    selection: {
      lookId: "chasing-rainbow",
      hue: 0,
      saturation: 100,
      brightness: 255,
      effectId: 9,
      effectSpeed: 196,
      effectIntensity: 150,
      paletteId: 11,
      label: "Chasing rainbow"
    }
  },
  {
    id: "sparkle",
    label: "Dancing sparkle",
    preview: {
      type: "sparkle",
      colors: ["#07111f", "#ffffff", "#3cf2d2", "#ffcf4f", "#ff5ca8"]
    },
    selection: {
      lookId: "sparkle",
      hue: 185,
      saturation: 82,
      brightness: 235,
      effectId: 44,
      effectSpeed: 172,
      effectIntensity: 210,
      paletteId: 0,
      label: "Dancing sparkle"
    }
  },
  {
    id: "pride",
    label: "Pride",
    preview: {
      type: "gradient",
      colors: ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"]
    },
    selection: {
      lookId: "pride",
      hue: 0,
      saturation: 100,
      brightness: 255,
      effectId: 63,
      effectSpeed: 156,
      effectIntensity: 180,
      paletteId: 0,
      label: "Pride"
    }
  }
] as const;

export const DEFAULT_LIGHT_LOOK = LIGHT_LOOKS.find((look) => look.isDefault) ?? LIGHT_LOOKS[0];
export const PHOTO_MODE_START_LOOK_ID = "solid-white";

const LIGHT_LOOKS_BY_ID = new Map(LIGHT_LOOKS.map((look) => [look.id, look]));

export function cloneLightSelection(selection: Readonly<LightSelection>): LightSelection {
  return { ...selection };
}

export function resolveLightLookSelection(lookId: unknown): LightSelection {
  if (typeof lookId !== "string" || !lookId.trim()) {
    throw new Error("Choose an LED look before applying lights.");
  }

  const look = LIGHT_LOOKS_BY_ID.get(lookId);
  if (!look) {
    throw new Error(`Unknown LED look "${lookId}".`);
  }

  return cloneLightSelection(look.selection);
}

export function resolveDefaultLightSelection(configuredLookId?: string): LightSelection {
  return configuredLookId
    ? resolveLightLookSelection(configuredLookId)
    : cloneLightSelection(DEFAULT_LIGHT_LOOK.selection);
}

export function validateLightLookManifest(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const defaultLooks = LIGHT_LOOKS.filter((look) => look.isDefault);

  if (defaultLooks.length !== 1) {
    errors.push("Exactly one LED look must be marked as the default.");
  }

  for (const look of LIGHT_LOOKS) {
    if (ids.has(look.id)) {
      errors.push(`Duplicate LED look id "${look.id}".`);
    }
    ids.add(look.id);

    if (look.selection.lookId !== look.id) {
      errors.push(`LED look "${look.id}" has a mismatched selection lookId.`);
    }

    if (!look.preview.colors.length) {
      errors.push(`LED look "${look.id}" must define preview colors.`);
    }

    if (
      !inRange(look.selection.hue, 0, 359) ||
      !inRange(look.selection.saturation, 0, 100) ||
      !inRange(look.selection.brightness, 1, 255) ||
      !inRange(look.selection.effectId, 0, 255) ||
      !inRange(look.selection.effectSpeed, 0, 255) ||
      !inRange(look.selection.effectIntensity, 0, 255) ||
      !inRange(look.selection.paletteId, 0, 255)
    ) {
      errors.push(`LED look "${look.id}" has WLED values outside supported ranges.`);
    }
  }

  return errors;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
