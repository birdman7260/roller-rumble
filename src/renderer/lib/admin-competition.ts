import { TOURNAMENT_BRACKET_LAYOUT_MODES, TOURNAMENT_BRACKET_SIZES } from "@shared/constants";
import { competitionPresets } from "@shared/presets";
import type {
  AppSnapshot,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentBundle,
  TournamentPreset
} from "@shared/types";

export function getPresetLabel(preset: TournamentPreset): string {
  return competitionPresets.find((entry) => entry.id === preset)?.label ?? preset;
}

export function supportsBracketSizing(preset: TournamentPreset): boolean {
  return competitionPresets.find((entry) => entry.id === preset)?.supportsBracketSizing ?? false;
}

export function getBracketSizeOptions(preset: TournamentPreset): TournamentBracketSize[] {
  const minimumSize = preset === "double-elimination" ? 4 : 2;
  return TOURNAMENT_BRACKET_SIZES.filter((size) => size >= minimumSize);
}

export function getTournamentBracketSize(bundle: TournamentBundle): number | null {
  const { bracketSize } = bundle.tournament.settings;
  return typeof bracketSize === "number" ? bracketSize : null;
}

export function supportsCenterConvergingBracketLayout(preset: TournamentPreset): boolean {
  return preset === "single-elimination" || preset === "groups-to-single-elimination";
}

export function getBracketLayoutOptions(preset: TournamentPreset): {
  id: TournamentBracketLayoutMode;
  label: string;
  description: string;
}[] {
  const baseOptions = [
    {
      id: "auto" as const,
      label: "Auto",
      description:
        preset === "double-elimination"
          ? "Uses the standard winners/losers board layout for this format."
          : "Uses the standard board for small brackets and center-converging for larger single-tree brackets."
    },
    {
      id: "standard" as const,
      label: "Standard",
      description: "Traditional left-to-right bracket columns."
    }
  ];

  if (!supportsCenterConvergingBracketLayout(preset)) {
    return baseOptions;
  }

  return [
    ...baseOptions,
    {
      id: "center-converging" as const,
      label: "Center-converging",
      description: "Splits the field to both sides and brings the finals together in the middle."
    }
  ];
}

export function getTournamentBracketLayoutMode(
  bundle: TournamentBundle
): TournamentBracketLayoutMode {
  const { bracketLayout } = bundle.tournament.settings;
  return TOURNAMENT_BRACKET_LAYOUT_MODES.includes(bracketLayout as TournamentBracketLayoutMode)
    ? (bracketLayout as TournamentBracketLayoutMode)
    : "auto";
}

export function getBracketLayoutLabel(layout: TournamentBracketLayoutMode): string {
  return (
    getBracketLayoutOptions("single-elimination").find((entry) => entry.id === layout)?.label ??
    layout
  );
}

export function getActiveTournament(snapshot: AppSnapshot): TournamentBundle | null {
  return snapshot.tournaments.find((bundle) => bundle.tournament.status === "active") ?? null;
}

export function getCompetitionLabel(snapshot: AppSnapshot): string {
  const activeTournament = getActiveTournament(snapshot);
  return activeTournament
    ? `${activeTournament.tournament.name} · ${getPresetLabel(activeTournament.tournament.preset)}`
    : "Open Time Trial";
}

export function resolveTournamentRacerName(
  snapshot: AppSnapshot,
  bundle: TournamentBundle,
  racerId?: string | null
): string {
  if (!racerId) {
    return "TBD";
  }

  return (
    snapshot.racers.find((entry) => entry.racer.id === racerId)?.racer.displayName ??
    bundle.seeds.find((seed) => seed.racerId === racerId)?.label ??
    racerId
  );
}
