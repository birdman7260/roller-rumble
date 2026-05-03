import { nanoid } from "nanoid";
import type {
  EventRecord,
  RaceResult,
  Racer,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentBundle,
  TournamentPreset,
  TournamentRecord,
  TournamentStage
} from "../../shared/types";
import { nowIso } from "../../shared/utils";
import { buildSeeds, createPresetBundle } from "./competition";

function resolveSeedField(
  seeds: ReturnType<typeof buildSeeds>,
  preset: TournamentPreset,
  bracketSize?: TournamentBracketSize
): {
  bracketSize?: TournamentBracketSize;
  selectedSeeds: ReturnType<typeof buildSeeds>;
} {
  if (preset !== "single-elimination" && preset !== "double-elimination") {
    return {
      selectedSeeds: seeds
    };
  }

  // A smaller chosen bracket trims the field to the top seeds, while a larger one leaves room
  // for byes so the board can match the event format the host wants to run.
  return {
    bracketSize,
    selectedSeeds: bracketSize ? seeds.slice(0, bracketSize) : seeds
  };
}

export class TournamentService {
  createTournamentBundle(input: {
    event: EventRecord;
    racers: Racer[];
    results: RaceResult[];
    name: string;
    preset: TournamentPreset;
    bracketSize?: TournamentBracketSize;
    bracketLayout?: TournamentBracketLayoutMode;
  }): TournamentBundle {
    const timestamp = nowIso();
    const tournamentId = nanoid();
    const baseStageId = `${tournamentId}-stage-1`;
    const eligibleSeeds = buildSeeds(input.racers, input.results);
    const seededField = resolveSeedField(eligibleSeeds, input.preset, input.bracketSize);
    const presetBundle = createPresetBundle(
      input.preset,
      baseStageId,
      tournamentId,
      seededField.selectedSeeds,
      {
        bracketSize: seededField.bracketSize
      }
    );

    const tournament: TournamentRecord = {
      id: tournamentId,
      eventId: input.event.id,
      name: input.name,
      preset: input.preset,
      status: "active",
      settings: {
        seedSource: "event-results",
        eligibleRacerCount: eligibleSeeds.length,
        seedCount: seededField.selectedSeeds.length,
        bracketSize: seededField.bracketSize ?? null,
        bracketLayout: input.bracketLayout ?? "auto"
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const stages: TournamentStage[] =
      input.preset === "groups-to-single-elimination"
        ? [
            {
              id: baseStageId,
              tournamentId,
              kind: "groups",
              name: "Group Stage",
              order: 1,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            },
            {
              id: `${baseStageId}-finals`,
              tournamentId,
              kind: "elimination",
              name: "Finals Bracket",
              order: 2,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        : [
            {
              id: baseStageId,
              tournamentId,
              kind: input.preset === "round-robin" ? "round-robin" : "elimination",
              name:
                input.preset === "single-elimination"
                  ? "Single Elimination"
                  : input.preset === "double-elimination"
                    ? "Double Elimination"
                    : input.preset === "round-robin"
                      ? "Standings"
                      : "Tournament",
              order: 1,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ];

    return {
      tournament,
      stages,
      bracketNodes: presetBundle.bracketNodes,
      groupMatches: presetBundle.groupMatches,
      standings: presetBundle.standings,
      seeds: seededField.selectedSeeds
    };
  }
}
