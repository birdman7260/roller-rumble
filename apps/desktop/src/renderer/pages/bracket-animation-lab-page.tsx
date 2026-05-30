import type {
  AdminSettings,
  AppSnapshot,
  BracketNode,
  EventRecord,
  RaceRecord,
  Racer,
  RacerStats,
  ThemeDefinition,
  TournamentBracketLayoutMode,
  TournamentBundle,
  TournamentStage
} from "@goldsprints/shared/types";
import { useEffect, useRef, useState } from "react";
import { getTheme, themes } from "@goldsprints/shared/themes";
import {
  type BracketPresentationRequest,
  type BracketWinnerAdvance,
  EliminationBracketView
} from "../components/elimination-bracket-view";
import { AnimatePresence } from "framer-motion";
import { Button, StatPill } from "@goldsprints/shared-ui";
import { applyThemeToDocument } from "@goldsprints/shared-ui/theme";
import { getBracketLayoutLabel } from "../lib/admin-competition";
import { RaceResultsOverlay } from "../components/race-results-overlay";

type LabPhase = "overview" | "hidden" | "source" | "advance" | "hold" | "zoom-out";

interface LabScenario {
  description: string;
  id: "round-one" | "semifinal" | "final";
  label: string;
  sourceNodeId: string;
  targetNodeId: string | null;
  winnerRacerId: string;
}

const labScenarios: LabScenario[] = [
  {
    id: "round-one",
    label: "Round 1 -> Semifinal",
    description: "A first-round winner moves into a waiting semifinal slot.",
    sourceNodeId: "lab-r1m1",
    targetNodeId: "lab-r2m1",
    winnerRacerId: "lab-racer-1"
  },
  {
    id: "semifinal",
    label: "Semifinal -> Final",
    description: "A semifinal winner moves into the championship matchup.",
    sourceNodeId: "lab-r2m1",
    targetNodeId: "lab-r3m1",
    winnerRacerId: "lab-racer-1"
  },
  {
    id: "final",
    label: "Final Winner",
    description: "The final node completes without a next-stage connector.",
    sourceNodeId: "lab-r3m1",
    targetNodeId: null,
    winnerRacerId: "lab-racer-1"
  }
];

const labPhases: {
  id: LabPhase;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "hidden", label: "Hidden Beat" },
  { id: "source", label: "Return To Source" },
  { id: "advance", label: "Draw Advance" },
  { id: "hold", label: "Advanced Hold" },
  { id: "zoom-out", label: "Zoom Out" }
];

const labLayouts: TournamentBracketLayoutMode[] = ["auto", "standard", "center-converging"];
const labCreatedAt = "2026-01-01T00:00:00.000Z";
const labEventId = "lab-event";
const labTournamentId = "lab-tournament";
const labStageId = "lab-stage";
const labWinnerAdvanceMs = 1200;
const labZoomOutMs = 950;

const labRacers = ["Ada", "Ben", "Cleo", "Dax", "Etta", "Finn", "Gia", "Hank"].map((name, index) =>
  makeRacerSummary(`lab-racer-${index + 1}`, name)
);

function makeRacerSummary(id: string, displayName: string): AppSnapshot["racers"][number] {
  const stats: RacerStats = {
    averageSpeedKph: 31 + displayName.length,
    careerEventCount: 1,
    careerRaces: 3,
    eventRaces: 3,
    eventWins: 1,
    maxWattage: 680 + displayName.length * 11,
    races: 3,
    topSpeedKph: 48 + displayName.length,
    wins: 1
  };
  const racer: Racer = {
    createdAt: labCreatedAt,
    displayName,
    id,
    identities: [],
    updatedAt: labCreatedAt
  };

  return { racer, stats };
}

const labModalRacers: AppSnapshot["racers"] = [
  makeRacerSummary("lab-modal-left", "Mackenzie Thunder-Hill Sprint Captain"),
  makeRacerSummary("lab-modal-right", "Jo Rivera-Santos Long-Haul Flyer")
].map((entry, index) => ({
  ...entry,
  stats: {
    ...entry.stats,
    careerEventCount: index === 0 ? 4 : 2,
    careerRaces: index === 0 ? 22 : 11,
    eventRaces: index === 0 ? 5 : 4,
    eventWins: index === 0 ? 4 : 1
  }
}));

function makeNode(input: {
  id: string;
  matchNumber: number;
  racerAId?: string | null;
  racerBId?: string | null;
  roundNumber: number;
  slotLabel: string;
  state: BracketNode["state"];
  winnerRacerId?: string | null;
  winnerToNodeId?: string | null;
}): BracketNode {
  return {
    createdAt: labCreatedAt,
    id: input.id,
    matchNumber: input.matchNumber,
    meta: {
      bracket: "winners"
    },
    racerAId: input.racerAId ?? null,
    racerBId: input.racerBId ?? null,
    roundNumber: input.roundNumber,
    slotLabel: input.slotLabel,
    stageId: labStageId,
    state: input.state,
    tournamentId: labTournamentId,
    updatedAt: labCreatedAt,
    winnerRacerId: input.winnerRacerId ?? null,
    winnerToNodeId: input.winnerToNodeId ?? null
  };
}

function getSourceState(
  scenario: LabScenario,
  nodeId: string,
  advanced: boolean
): BracketNode["state"] {
  if (scenario.id === "round-one" && nodeId === "lab-r1m2") {
    return "ready";
  }

  if (scenario.sourceNodeId === nodeId) {
    return advanced ? "finished" : "ready";
  }

  return "finished";
}

function getSourceWinner(
  scenario: LabScenario,
  nodeId: string,
  winnerRacerId: string,
  advanced: boolean
): string | null {
  if (scenario.id === "round-one" && nodeId === "lab-r1m2") {
    return null;
  }

  if (scenario.sourceNodeId === nodeId) {
    return advanced ? winnerRacerId : null;
  }

  return winnerRacerId;
}

function buildLabBracketNodes(scenario: LabScenario, advanced: boolean): BracketNode[] {
  const r1m1Advanced = scenario.id !== "round-one" || advanced;
  const r2m1Advanced = scenario.id === "final" || (scenario.id === "semifinal" && advanced);
  const finalAdvanced = scenario.id === "final" && advanced;

  return [
    makeNode({
      id: "lab-r1m1",
      matchNumber: 1,
      racerAId: "lab-racer-1",
      racerBId: "lab-racer-2",
      roundNumber: 1,
      slotLabel: "Match 1",
      state: r1m1Advanced ? "finished" : "ready",
      winnerRacerId: r1m1Advanced ? "lab-racer-1" : null,
      winnerToNodeId: "lab-r2m1"
    }),
    makeNode({
      id: "lab-r1m2",
      matchNumber: 2,
      racerAId: "lab-racer-3",
      racerBId: "lab-racer-4",
      roundNumber: 1,
      slotLabel: "Match 2",
      state: getSourceState(scenario, "lab-r1m2", advanced),
      winnerRacerId: getSourceWinner(scenario, "lab-r1m2", "lab-racer-3", advanced),
      winnerToNodeId: "lab-r2m1"
    }),
    makeNode({
      id: "lab-r1m3",
      matchNumber: 3,
      racerAId: "lab-racer-5",
      racerBId: "lab-racer-6",
      roundNumber: 1,
      slotLabel: "Match 3",
      state: "finished",
      winnerRacerId: "lab-racer-5",
      winnerToNodeId: "lab-r2m2"
    }),
    makeNode({
      id: "lab-r1m4",
      matchNumber: 4,
      racerAId: "lab-racer-7",
      racerBId: "lab-racer-8",
      roundNumber: 1,
      slotLabel: "Match 4",
      state: "finished",
      winnerRacerId: "lab-racer-7",
      winnerToNodeId: "lab-r2m2"
    }),
    makeNode({
      id: "lab-r2m1",
      matchNumber: 1,
      racerAId: r1m1Advanced ? "lab-racer-1" : null,
      racerBId: scenario.id === "round-one" ? null : "lab-racer-3",
      roundNumber: 2,
      slotLabel: "Semifinal 1",
      state:
        scenario.id === "round-one" && advanced
          ? "pending"
          : scenario.id === "round-one"
            ? "pending"
            : r2m1Advanced
              ? "finished"
              : "ready",
      winnerRacerId: r2m1Advanced ? "lab-racer-1" : null,
      winnerToNodeId: "lab-r3m1"
    }),
    makeNode({
      id: "lab-r2m2",
      matchNumber: 2,
      racerAId: "lab-racer-5",
      racerBId: "lab-racer-7",
      roundNumber: 2,
      slotLabel: "Semifinal 2",
      state: "finished",
      winnerRacerId: "lab-racer-5",
      winnerToNodeId: "lab-r3m1"
    }),
    makeNode({
      id: "lab-r3m1",
      matchNumber: 1,
      racerAId: scenario.id === "round-one" ? null : r2m1Advanced ? "lab-racer-1" : null,
      racerBId: scenario.id === "round-one" ? null : "lab-racer-5",
      roundNumber: 3,
      slotLabel: "Final",
      state: scenario.id === "final" ? (finalAdvanced ? "finished" : "ready") : "pending",
      winnerRacerId: finalAdvanced ? "lab-racer-1" : null
    })
  ];
}

function buildLabBundle(input: {
  advanced: boolean;
  layout: TournamentBracketLayoutMode;
  scenario: LabScenario;
}): TournamentBundle {
  const stage: TournamentStage = {
    createdAt: labCreatedAt,
    id: labStageId,
    kind: "elimination",
    name: "Animation Lab Bracket",
    order: 1,
    settings: {},
    tournamentId: labTournamentId,
    updatedAt: labCreatedAt
  };

  return {
    bracketNodes: buildLabBracketNodes(input.scenario, input.advanced),
    groupMatches: [],
    seeds: labRacers.map((entry, index) => ({
      label: entry.racer.displayName,
      racerId: entry.racer.id,
      score: 100 - index,
      seed: index + 1
    })),
    stages: [stage],
    standings: [],
    tournament: {
      createdAt: labCreatedAt,
      eventId: labEventId,
      id: labTournamentId,
      name: "Bracket Animation Lab",
      preset: "single-elimination",
      settings: {
        bracketLayout: input.layout,
        bracketSize: 8
      },
      status: "active",
      updatedAt: labCreatedAt
    }
  };
}

function markLabSourceWinner(bundle: TournamentBundle, scenario: LabScenario): TournamentBundle {
  return {
    ...bundle,
    bracketNodes: bundle.bracketNodes.map((node) => {
      if (node.id !== scenario.sourceNodeId) {
        return node;
      }

      return {
        ...node,
        state: "finished",
        winnerRacerId: scenario.winnerRacerId
      };
    })
  };
}

function buildLabSnapshot(theme: ThemeDefinition, bundle: TournamentBundle): AppSnapshot {
  const activeEvent: EventRecord = {
    active: true,
    createdAt: labCreatedAt,
    id: labEventId,
    includeAllRaceData: false,
    name: "Animation Lab Event",
    updatedAt: labCreatedAt
  };
  const settings: AdminSettings = {
    autoStageNextRace: false,
    includeAllRaceData: false,
    mode: "single-elimination",
    os2lEnabled: false,
    raceDisplayShowEventName: true,
    raceDisplayTickerMessages: [],
    raceDisplayTickerSpeed: 72,
    maxActiveQueueEntriesPerRacer: 3,
    serverPort: 3187,
    targetDistanceMeters: 250,
    themeId: theme.id
  };

  return {
    activeEvent,
    generatedAt: labCreatedAt,
    queue: [],
    raceProjection: {
      countdownSecondsRemaining: null,
      metricsByRacerId: {},
      nextQueueEntry: null,
      race: null,
      resultPresentation: null,
      theme
    },
    racers: labRacers,
    settings,
    themes,
    tournaments: [bundle],
    photoBooth: {
      boothId: "lab-booth",
      status: "idle",
      lastSeenAt: null,
      lastCaptureAt: null,
      pendingUploadCount: 0,
      message: null
    },
    tunnel: {
      status: "idle"
    }
  };
}

function getPresentationRequest(input: {
  phase: LabPhase;
  runKey: number;
  scenario: LabScenario;
}): BracketPresentationRequest | null {
  const requestKey = `${input.scenario.id}:${input.phase}:${input.runKey}`;

  switch (input.phase) {
    case "overview":
      return {
        key: requestKey,
        padding: 0.18,
        type: "fit-board"
      };
    case "source":
      return {
        key: requestKey,
        nodeIds: [input.scenario.sourceNodeId],
        padding: 0.95,
        type: "focus-node"
      };
    case "advance":
      return {
        durationMs: labWinnerAdvanceMs,
        key: requestKey,
        nodeIds: input.scenario.targetNodeId
          ? [input.scenario.sourceNodeId, input.scenario.targetNodeId]
          : [input.scenario.sourceNodeId],
        padding: input.scenario.targetNodeId ? 0.65 : 0.95,
        type: input.scenario.targetNodeId ? "focus-nodes" : "focus-node"
      };
    case "hold":
      return {
        key: requestKey,
        nodeIds: [input.scenario.targetNodeId ?? input.scenario.sourceNodeId],
        padding: 0.88,
        type: "focus-node"
      };
    case "zoom-out":
      return {
        durationMs: labZoomOutMs,
        key: requestKey,
        padding: 0.18,
        type: "fit-board"
      };
    case "hidden":
      return null;
  }
}

function buildLabWinnerRace(themeId: string): RaceRecord {
  return {
    createdAt: labCreatedAt,
    eventId: labEventId,
    finishedAt: labCreatedAt,
    format: "match",
    id: "lab-winner-modal-race",
    metrics: [
      {
        averageSpeedKph: 36.8,
        currentSpeedKph: 0,
        distanceMeters: 250,
        elapsedMs: 24320,
        finishedAtMs: 24320,
        lane: "left",
        maxWattage: 742,
        racerId: "lab-modal-left",
        rotationCount: 119,
        topSpeedKph: 54.7,
        wattage: 0
      },
      {
        averageSpeedKph: 34.9,
        currentSpeedKph: 0,
        distanceMeters: 242.4,
        elapsedMs: 24320,
        finishedAtMs: null,
        lane: "right",
        maxWattage: 691,
        racerId: "lab-modal-right",
        rotationCount: 115,
        topSpeedKph: 51.2,
        wattage: 0
      }
    ],
    mode: "single-elimination",
    participants: [
      {
        lane: "left",
        racerId: "lab-modal-left"
      },
      {
        lane: "right",
        racerId: "lab-modal-right"
      }
    ],
    queueEntryId: null,
    stageId: labStageId,
    startedAt: labCreatedAt,
    state: "finished",
    targetDistanceMeters: 250,
    themeId,
    tournamentId: labTournamentId,
    updatedAt: labCreatedAt,
    winnerRacerId: "lab-modal-left"
  };
}

export function BracketAnimationLabPage() {
  const [themeId, setThemeId] = useState(themes[0].id);
  const [layout, setLayout] = useState<TournamentBracketLayoutMode>("center-converging");
  const [scenarioId, setScenarioId] = useState<LabScenario["id"]>("round-one");
  const [phase, setPhase] = useState<LabPhase>("overview");
  const [runKey, setRunKey] = useState(0);
  const [showDummyWinnerModal, setShowDummyWinnerModal] = useState(false);
  const timersRef = useRef<number[]>([]);
  const selectedTheme = getTheme(themeId);
  const scenario = labScenarios.find((candidate) => candidate.id === scenarioId) ?? labScenarios[0];
  const usesAdvancedBundle = phase === "hold" || phase === "zoom-out";
  const beforeBundle = buildLabBundle({ advanced: false, layout, scenario });
  const afterBundle = buildLabBundle({ advanced: true, layout, scenario });
  const sourceMarkedBundle = markLabSourceWinner(beforeBundle, scenario);
  const displayBundle =
    phase === "source" || phase === "advance"
      ? sourceMarkedBundle
      : usesAdvancedBundle
        ? afterBundle
        : beforeBundle;
  const snapshot = buildLabSnapshot(selectedTheme, displayBundle);
  const highlightedNodeId =
    phase === "hold" || phase === "zoom-out"
      ? (scenario.targetNodeId ?? scenario.sourceNodeId)
      : scenario.sourceNodeId;
  const presentationRequest = getPresentationRequest({ phase, runKey, scenario });
  const winnerAdvance: BracketWinnerAdvance | null =
    phase === "advance" && scenario.targetNodeId
      ? {
          durationMs: labWinnerAdvanceMs,
          fromNodeId: scenario.sourceNodeId,
          key: `${scenario.id}:winner-advance:${runKey}`,
          toNodeId: scenario.targetNodeId
        }
      : null;
  const dummyWinnerRace = buildLabWinnerRace(selectedTheme.id);

  useEffect(() => {
    applyThemeToDocument(selectedTheme);
  }, [selectedTheme]);

  useEffect(() => {
    document.body.classList.add("route-bracket-lab");
    return () => {
      document.body.classList.remove("route-bracket-lab");
    };
  }, []);

  useEffect(
    () => () => {
      for (const timerId of timersRef.current) {
        window.clearTimeout(timerId);
      }
    },
    []
  );

  function clearSequenceTimers(): void {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }

  function setManualPhase(nextPhase: LabPhase): void {
    clearSequenceTimers();
    setRunKey((current) => current + 1);
    setPhase(nextPhase);
  }

  function resetBoardView(): void {
    clearSequenceTimers();
    setPhase("overview");
    setRunKey((current) => current + 1);
  }

  function playSequence(): void {
    clearSequenceTimers();
    setRunKey((current) => current + 1);
    setPhase("hidden");

    // Mirrors the projector handoff: stay hidden, return to source, draw the path, hold, zoom out.
    const sequence: {
      delayMs: number;
      phase: LabPhase;
    }[] = [
      { delayMs: 900, phase: "source" },
      { delayMs: 1950, phase: "advance" },
      { delayMs: 3150, phase: "hold" },
      { delayMs: 5150, phase: "zoom-out" },
      { delayMs: 6200, phase: "overview" }
    ];

    timersRef.current = sequence.map((step) =>
      window.setTimeout(() => {
        setPhase(step.phase);
      }, step.delayMs)
    );
  }

  return (
    <div className="bracket-lab">
      <section className="bracket-lab__hero panel panel--glass">
        <div>
          <p className="eyebrow">Developer Test Page</p>
          <h1>Bracket Animation Lab</h1>
          <p>
            Replay the same tournament bracket camera and connector handoff animations used by the
            projector without mutating live event data.
          </p>
        </div>
        <div className="stat-grid">
          <StatPill label="Theme" value={selectedTheme.label} />
          <StatPill label="Layout" value={getBracketLayoutLabel(layout)} />
          <StatPill label="Phase" value={phase} />
        </div>
      </section>

      <section className="bracket-lab__toolbar panel">
        <label>
          Theme
          <select
            value={themeId}
            onChange={(event) => {
              setThemeId(event.target.value);
            }}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Layout
          <select
            value={layout}
            onChange={(event) => {
              setLayout(event.target.value as TournamentBracketLayoutMode);
              resetBoardView();
            }}
          >
            {labLayouts.map((candidate) => (
              <option key={candidate} value={candidate}>
                {getBracketLayoutLabel(candidate)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Scenario
          <select
            value={scenarioId}
            onChange={(event) => {
              setScenarioId(event.target.value as LabScenario["id"]);
              resetBoardView();
            }}
          >
            {labScenarios.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>

        <Button variant="accent" onClick={playSequence}>
          Play Full Handoff
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            setShowDummyWinnerModal((current) => !current);
          }}
        >
          {showDummyWinnerModal ? "Hide Dummy Winner Modal" : "Show Dummy Winner Modal"}
        </Button>
      </section>

      <section className="bracket-lab__phase-panel panel">
        <div>
          <strong>{scenario.label}</strong>
          <p>{scenario.description}</p>
        </div>
        <div className="bracket-lab__phase-buttons">
          {labPhases.map((candidate) => (
            <Button
              key={candidate.id}
              className={phase === candidate.id ? "bracket-lab__phase-button--active" : undefined}
              variant="ghost"
              onClick={() => {
                setManualPhase(candidate.id);
              }}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="bracket-lab__stage">
        {phase === "hidden" ? (
          <div className="bracket-lab__hidden-card panel panel--glass">
            <p className="eyebrow">Hidden Beat</p>
            <h2>Bracket hidden during confetti</h2>
            <p>This mirrors the projector state that prevents the updated bracket from flashing.</p>
          </div>
        ) : null}
        <div
          className={`bracket-lab__bracket${phase === "hidden" ? " bracket-lab__bracket--hidden" : ""}`}
        >
          <EliminationBracketView
            snapshot={snapshot}
            bundle={displayBundle}
            interactive={false}
            expandMode="container"
            expanded
            highlightedNodeId={highlightedNodeId}
            presentationRequest={presentationRequest}
            showViewportControls
            winnerAdvance={winnerAdvance}
          />
        </div>
        <AnimatePresence>
          {showDummyWinnerModal ? (
            <RaceResultsOverlay
              race={dummyWinnerRace}
              racers={labModalRacers}
              winnerRacerId="lab-modal-left"
            />
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
