import type { ThemeDefinition } from "@shared/types";

export function applyThemeToDocument(theme: ThemeDefinition): void {
  const root = document.documentElement;

  root.style.setProperty("--theme-font-family", theme.fontFamily);
  root.style.setProperty("--theme-surface", theme.tokens.surface);
  root.style.setProperty("--theme-surface-alt", theme.tokens.surfaceAlt);
  root.style.setProperty("--theme-accent", theme.tokens.accent);
  root.style.setProperty("--theme-accent-soft", theme.tokens.accentSoft);
  root.style.setProperty("--theme-text", theme.tokens.text);
  root.style.setProperty("--theme-text-muted", theme.tokens.textMuted);
  root.style.setProperty("--theme-success", theme.tokens.success);
  root.style.setProperty("--theme-warning", theme.tokens.warning);
  root.style.setProperty("--theme-danger", theme.tokens.danger);
  root.style.setProperty("--theme-lane-a", theme.tokens.laneA);
  root.style.setProperty("--theme-lane-b", theme.tokens.laneB);

  // Keep DOM hooks semantic so CSS reacts to theme capabilities instead of specific theme ids.
  root.dataset.themeConnector = theme.connectorStyle;
  root.dataset.themeOrientation = theme.orientation;
  root.dataset.themeRaceGraphic = theme.raceGraphic.variant;
  root.dataset.themeSurface = theme.surfaceStyle;
  root.dataset.themeUi = theme.uiStyle;
  delete root.dataset.theme;
}
