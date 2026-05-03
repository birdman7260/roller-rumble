import type { CompetitionPresetDefinition } from "./types";

export const competitionPresets: CompetitionPresetDefinition[] = [
  {
    id: "open-time-trial",
    label: "Open Time Trial",
    description: "Rolling queue of solo runs and rider-chosen head-to-head races.",
    createsBracket: false,
    supportsBracketSizing: false,
    supportsSeeding: false
  },
  {
    id: "single-elimination",
    label: "Single Elimination",
    description: "Standard winner-advances bracket seeded from event results.",
    createsBracket: true,
    supportsBracketSizing: true,
    supportsSeeding: true
  },
  {
    id: "double-elimination",
    label: "Double Elimination",
    description: "Two-life format with linked winners and losers brackets.",
    createsBracket: true,
    supportsBracketSizing: true,
    supportsSeeding: true
  },
  {
    id: "round-robin",
    label: "Round Robin",
    description: "Every rider in the pool races the others and earns a standings rank.",
    createsBracket: false,
    supportsBracketSizing: false,
    supportsSeeding: false
  },
  {
    id: "groups-to-single-elimination",
    label: "Groups to Single Elimination",
    description: "Round-robin groups feed a seeded single-elimination finals bracket.",
    createsBracket: true,
    supportsBracketSizing: false,
    supportsSeeding: true
  }
];
