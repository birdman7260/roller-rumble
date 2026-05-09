import type { AppSnapshot, RaceRecord, TournamentBundle } from "@shared/types";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type BracketPresentationRequest,
  type BracketWinnerAdvance,
  EliminationBracketView
} from "../components/elimination-bracket-view";
import { RaceGraphic } from "../components/race-graphics";
import { EmptyState, Panel, StatPill } from "../components/ui";
import { WinnerConfetti } from "../components/winner-confetti";
import { findBracketNodeByParticipantIds } from "../components/tournament-flow-layout";
import { getActiveTournament, getPresetLabel } from "../lib/admin-competition";
import { getConfettiEffectDurationMs } from "../lib/confetti-effects";
import { useSnapshotQuery } from "../lib/query";
import { buildParticipantEntries, resolveRacerName } from "../lib/snapshot-display";

const TOURNAMENT_PRE_RACE_STATES: RaceRecord["state"][] = ["scheduled", "staging", "interrupted"];
const TOURNAMENT_LIVE_STATES: RaceRecord["state"][] = ["countdown", "active"];
const BRACKET_RETURN_FOCUS_DELAY_MS = 1050;
const WINNER_ADVANCE_ANIMATION_MS = 1200;
const BRACKET_HOLD_AFTER_ADVANCE_MS = 5000;
const BRACKET_ZOOM_OUT_MS = 950;

type PostRaceSequencePhase = "confetti" | "source" | "advance" | "hold" | "zoom-out";

interface PostRaceSequence {
  afterBundle: TournamentBundle;
  beforeBundle: TournamentBundle;
  finishedRace: RaceRecord;
  phase: PostRaceSequencePhase;
  raceId: string;
  sourceNodeId: string;
  targetNodeId?: string | null;
  winnerRacerId: string;
}

function markSourceWinnerInBundle(sequence: PostRaceSequence): TournamentBundle {
  const afterSourceNode =
    sequence.afterBundle.bracketNodes.find((node) => node.id === sequence.sourceNodeId) ?? null;

  return {
    ...sequence.beforeBundle,
    bracketNodes: sequence.beforeBundle.bracketNodes.map((node) => {
      if (node.id !== sequence.sourceNodeId) {
        return node;
      }

      return {
        ...node,
        state: afterSourceNode?.state === "bye" ? "bye" : "finished",
        updatedAt: afterSourceNode?.updatedAt ?? node.updatedAt,
        winnerRacerId: sequence.winnerRacerId
      };
    })
  };
}

function deriveRaceWinnerId(race: RaceRecord, preferredWinnerId?: string | null): string | null {
  if (preferredWinnerId) {
    return preferredWinnerId;
  }

  if (race.winnerRacerId) {
    return race.winnerRacerId;
  }

  const ranked = [...race.metrics].sort((left, right) => {
    const leftTime = left.finishedAtMs ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.finishedAtMs ?? Number.MAX_SAFE_INTEGER;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return right.distanceMeters - left.distanceMeters;
  });

  return ranked[0]?.racerId ?? null;
}

function getTournamentRaceBundle(
  snapshot: AppSnapshot | null,
  race: RaceRecord | null
): TournamentBundle | null {
  if (!snapshot || !race?.tournamentId) {
    return null;
  }

  return snapshot.tournaments.find((bundle) => bundle.tournament.id === race.tournamentId) ?? null;
}

function getRaceDisplayHeaderTitle(input: {
  bracketBundle: TournamentBundle | null;
  displayRace: RaceRecord | null;
  winnerName: string | null;
}): string {
  if (input.winnerName) {
    return `${input.winnerName} wins!`;
  }

  if (input.displayRace) {
    return "Race in Progress";
  }

  if (input.bracketBundle) {
    return input.bracketBundle.tournament.name;
  }

  return "Stand By";
}

function getRaceDisplayEyebrow(input: {
  bracketBundle: TournamentBundle | null;
  displayRace: RaceRecord | null;
}): string {
  if (input.displayRace?.tournamentId && input.bracketBundle) {
    return `${getPresetLabel(input.bracketBundle.tournament.preset)} Bracket`;
  }

  if (input.bracketBundle) {
    return "Tournament Bracket";
  }

  return "Live Race";
}

export function RacePage() {
  const snapshotQuery = useSnapshotQuery();
  const snapshot = snapshotQuery.data ?? null;
  const [postRaceSequence, setPostRaceSequence] = useState<PostRaceSequence | null>(null);
  const previousTournamentRaceRef = useRef<RaceRecord | null>(null);
  const previousTournamentBundleRef = useRef<TournamentBundle | null>(null);
  const latestTournamentWinnerIdRef = useRef<string | null>(null);
  const handledFinishedRaceIdsRef = useRef(new Set<string>());

  useEffect(() => {
    document.body.classList.add("route-race");
    return () => {
      document.body.classList.remove("route-race");
    };
  }, []);

  const projection = snapshot?.raceProjection ?? null;
  const race = projection?.race ?? null;
  const activeTournament = snapshot ? getActiveTournament(snapshot) : null;
  const currentTournamentBundle = getTournamentRaceBundle(snapshot, race);
  const currentTournamentRace = race && currentTournamentBundle ? race : null;
  const currentTournamentNode =
    currentTournamentRace && currentTournamentBundle
      ? findBracketNodeByParticipantIds(
          currentTournamentBundle,
          currentTournamentRace.participants.map((participant) => participant.racerId),
          { includeFinished: true }
        )
      : null;

  useEffect(() => {
    if (!currentTournamentRace || !currentTournamentBundle) {
      return;
    }

    previousTournamentRaceRef.current = currentTournamentRace;
    previousTournamentBundleRef.current = currentTournamentBundle;
    latestTournamentWinnerIdRef.current = deriveRaceWinnerId(
      currentTournamentRace,
      projection?.winnerRacerId ?? null
    );
  }, [currentTournamentBundle, currentTournamentRace, projection?.winnerRacerId]);

  useEffect(() => {
    if (!currentTournamentRace || postRaceSequence == null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setPostRaceSequence((current) =>
        current && current.raceId !== currentTournamentRace.id ? null : current
      );
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [currentTournamentRace, postRaceSequence]);

  useLayoutEffect(() => {
    if (snapshot == null || currentTournamentRace || postRaceSequence) {
      return;
    }

    const previousRace = previousTournamentRaceRef.current;
    const previousBundle = previousTournamentBundleRef.current;
    const winnerRacerId = latestTournamentWinnerIdRef.current;

    if (
      previousRace == null ||
      previousBundle == null ||
      winnerRacerId == null ||
      handledFinishedRaceIdsRef.current.has(previousRace.id)
    ) {
      return;
    }

    const afterBundle =
      snapshot.tournaments.find((bundle) => bundle.tournament.id === previousRace.tournamentId) ??
      null;
    const sourceNode = findBracketNodeByParticipantIds(
      previousBundle,
      previousRace.participants.map((participant) => participant.racerId),
      { includeFinished: true }
    );

    if (!afterBundle || !sourceNode) {
      return;
    }

    handledFinishedRaceIdsRef.current.add(previousRace.id);

    setPostRaceSequence({
      afterBundle,
      beforeBundle: previousBundle,
      finishedRace: previousRace,
      phase: "confetti",
      raceId: previousRace.id,
      sourceNodeId: sourceNode.id,
      targetNodeId: sourceNode.winnerToNodeId ?? null,
      winnerRacerId
    });
  }, [currentTournamentRace, postRaceSequence, snapshot]);

  useEffect(() => {
    if (!postRaceSequence || projection == null) {
      return;
    }

    let timerId = 0;

    switch (postRaceSequence.phase) {
      case "confetti":
        timerId = window.setTimeout(
          () => {
            setPostRaceSequence((current) =>
              current?.raceId === postRaceSequence.raceId
                ? { ...current, phase: "source" }
                : current
            );
          },
          getConfettiEffectDurationMs(projection.theme.confettiEffectId) + 120
        );
        break;
      case "source":
        timerId = window.setTimeout(() => {
          setPostRaceSequence((current) =>
            current?.raceId === postRaceSequence.raceId ? { ...current, phase: "advance" } : current
          );
        }, BRACKET_RETURN_FOCUS_DELAY_MS);
        break;
      case "advance":
        timerId = window.setTimeout(() => {
          setPostRaceSequence((current) =>
            current?.raceId === postRaceSequence.raceId ? { ...current, phase: "hold" } : current
          );
        }, WINNER_ADVANCE_ANIMATION_MS);
        break;
      case "hold":
        timerId = window.setTimeout(() => {
          setPostRaceSequence((current) =>
            current?.raceId === postRaceSequence.raceId
              ? { ...current, phase: "zoom-out" }
              : current
          );
        }, BRACKET_HOLD_AFTER_ADVANCE_MS);
        break;
      case "zoom-out":
        timerId = window.setTimeout(() => {
          setPostRaceSequence((current) =>
            current?.raceId === postRaceSequence.raceId ? null : current
          );
        }, BRACKET_ZOOM_OUT_MS);
        break;
    }

    return () => {
      window.clearTimeout(timerId);
    };
  }, [postRaceSequence, projection]);

  if (snapshot == null || projection == null) {
    return <p>Loading race display…</p>;
  }

  const displayRace =
    race ?? (postRaceSequence?.phase === "confetti" ? postRaceSequence.finishedRace : null) ?? null;
  const displayWinnerId = projection.winnerRacerId ?? postRaceSequence?.winnerRacerId ?? null;
  const displayWinner =
    displayWinnerId == null
      ? null
      : (snapshot.racers.find((entry) => entry.racer.id === displayWinnerId) ?? null);
  const winnerKey =
    displayRace && displayWinner ? `${displayRace.id}:${displayWinner.racer.id}` : null;

  const sourceMarkedBundle = postRaceSequence ? markSourceWinnerInBundle(postRaceSequence) : null;
  const bracketBundle =
    postRaceSequence == null
      ? currentTournamentRace && TOURNAMENT_PRE_RACE_STATES.includes(currentTournamentRace.state)
        ? currentTournamentBundle
        : activeTournament
      : postRaceSequence.phase === "source" || postRaceSequence.phase === "advance"
        ? sourceMarkedBundle
        : postRaceSequence.afterBundle;
  const bracketHighlightedNodeId =
    postRaceSequence == null
      ? (currentTournamentNode?.id ?? null)
      : postRaceSequence.phase === "source"
        ? postRaceSequence.sourceNodeId
        : (postRaceSequence.targetNodeId ?? postRaceSequence.sourceNodeId);

  const bracketPresentation: BracketPresentationRequest | null = (() => {
    if (!bracketBundle) {
      return null;
    }

    if (postRaceSequence) {
      switch (postRaceSequence.phase) {
        case "source":
          return {
            key: `${postRaceSequence.raceId}:source`,
            nodeIds: [postRaceSequence.sourceNodeId],
            padding: 0.95,
            type: "focus-node"
          };
        case "advance":
          return {
            durationMs: WINNER_ADVANCE_ANIMATION_MS,
            key: `${postRaceSequence.raceId}:advance`,
            nodeIds: postRaceSequence.targetNodeId
              ? [postRaceSequence.sourceNodeId, postRaceSequence.targetNodeId]
              : [postRaceSequence.sourceNodeId],
            padding: postRaceSequence.targetNodeId ? 0.65 : 0.95,
            type: postRaceSequence.targetNodeId ? "focus-nodes" : "focus-node"
          };
        case "hold":
          return {
            key: `${postRaceSequence.raceId}:hold`,
            nodeIds: [postRaceSequence.targetNodeId ?? postRaceSequence.sourceNodeId],
            padding: 0.88,
            type: "focus-node"
          };
        case "zoom-out":
          return {
            durationMs: BRACKET_ZOOM_OUT_MS,
            key: `${postRaceSequence.raceId}:zoom-out`,
            padding: 0.18,
            type: "fit-board"
          };
        case "confetti":
          return null;
      }
    }

    if (currentTournamentNode && currentTournamentRace) {
      return {
        key: `${currentTournamentRace.id}:staged`,
        nodeIds: [currentTournamentNode.id],
        padding: 0.95,
        type: "focus-node"
      };
    }

    return {
      key: `${bracketBundle.tournament.id}:overview`,
      padding: 0.18,
      type: "fit-board"
    };
  })();

  const winnerAdvance: BracketWinnerAdvance | null = (() => {
    if (postRaceSequence?.phase !== "advance" || postRaceSequence.targetNodeId == null) {
      return null;
    }

    return {
      durationMs: WINNER_ADVANCE_ANIMATION_MS,
      fromNodeId: postRaceSequence.sourceNodeId,
      key: `${postRaceSequence.raceId}:winner-advance`,
      toNodeId: postRaceSequence.targetNodeId
    };
  })();

  const showTournamentBracket =
    bracketBundle != null &&
    !(currentTournamentRace && TOURNAMENT_LIVE_STATES.includes(currentTournamentRace.state)) &&
    postRaceSequence?.phase !== "confetti";
  const showRacePanel =
    (race != null && (race.tournamentId == null || TOURNAMENT_LIVE_STATES.includes(race.state))) ||
    (postRaceSequence?.phase === "confetti" && displayRace != null);
  const racers = buildParticipantEntries(snapshot, displayRace);
  const metrics = displayRace?.metrics ?? [];
  const nextUp = projection.nextQueueEntry
    ? projection.nextQueueEntry.racerIds
        .map((racerId) => resolveRacerName(snapshot, racerId))
        .join(" vs ")
    : "Queue clear";
  const headerTitle = getRaceDisplayHeaderTitle({
    bracketBundle,
    displayRace,
    winnerName: displayWinner?.racer.displayName ?? null
  });
  const eyebrow = getRaceDisplayEyebrow({
    bracketBundle,
    displayRace
  });

  return (
    <div className="race-page">
      <WinnerConfetti
        winnerKey={winnerKey}
        effectId={projection.theme.confettiEffectId}
        colors={[
          projection.theme.tokens.accent,
          projection.theme.tokens.warning,
          projection.theme.tokens.success,
          projection.theme.tokens.laneA,
          projection.theme.tokens.laneB
        ]}
      />
      <div className="race-page__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{headerTitle}</h1>
        </div>
        <div className="stack-sm align-end">
          <span>Next up</span>
          <strong>{nextUp}</strong>
        </div>
      </div>

      {displayRace ? (
        <div className="race-page__summary stat-grid">
          <StatPill
            label="Race Distance"
            value={`${displayRace.targetDistanceMeters.toFixed(0)} m`}
          />
          <StatPill
            label="Lead Distance"
            value={`${Math.max(...metrics.map((metric) => metric.distanceMeters), 0).toFixed(0)} m`}
          />
        </div>
      ) : bracketBundle ? (
        <div className="race-page__summary stat-grid">
          <StatPill label="Tournament" value={bracketBundle.tournament.name} />
          <StatPill label="Format" value={getPresetLabel(bracketBundle.tournament.preset)} />
        </div>
      ) : null}

      {projection.countdownSecondsRemaining ? (
        <div className="countdown-overlay">
          {projection.countdownSecondsRemaining > 0 ? projection.countdownSecondsRemaining : "GO!"}
        </div>
      ) : null}

      <div className="race-page__stage">
        {bracketBundle ? (
          <motion.div
            className="race-page__bracket-layer"
            initial={false}
            animate={{
              opacity: showTournamentBracket ? 1 : 0,
              x: showTournamentBracket ? "0%" : "-14%"
            }}
            transition={{
              duration: showTournamentBracket ? 0.55 : 0.4,
              ease: showTournamentBracket ? [0.22, 0.84, 0.2, 1] : [0.4, 0, 1, 1]
            }}
          >
            <div className="race-page__bracket-stage">
              <EliminationBracketView
                snapshot={snapshot}
                bundle={bracketBundle}
                interactive={false}
                expandMode="container"
                expanded
                highlightedNodeId={bracketHighlightedNodeId}
                presentationRequest={bracketPresentation}
                showViewportControls={false}
                winnerAdvance={winnerAdvance}
              />
            </div>
          </motion.div>
        ) : null}

        <motion.div
          className="race-page__race-layer"
          initial={false}
          animate={{
            opacity: showRacePanel ? 1 : bracketBundle ? 0 : 1,
            x: showRacePanel ? "0%" : "12%"
          }}
          transition={{
            duration: showRacePanel ? 0.42 : 0.32,
            ease: showRacePanel ? [0.22, 0.84, 0.2, 1] : [0.4, 0, 1, 1]
          }}
        >
          {displayRace ? (
            <RaceGraphic
              theme={projection.theme}
              racers={racers}
              metrics={metrics}
              targetDistanceMeters={displayRace.targetDistanceMeters}
            />
          ) : !bracketBundle ? (
            <Panel className="panel--glass">
              <EmptyState
                title="Projector ready"
                body="Stage the next race from the admin screen or arm VirtualDJ to kick off the countdown."
              />
            </Panel>
          ) : null}
        </motion.div>
      </div>

      {showRacePanel && displayRace ? (
        <AnimatePresence initial={false}>
          <motion.div
            key={`metrics:${displayRace.id}`}
            className="race-metrics-grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {racers.map((entry) => {
              const metric = metrics.find((candidate) => candidate.racerId === entry.racer.id);
              return (
                <Panel key={entry.racer.id} className="panel--glass">
                  <div className="race-metric-card">
                    <div className="race-metric-card__header">
                      {entry.racer.avatarUrl ? (
                        <img
                          className="racer-avatar"
                          src={entry.racer.avatarUrl}
                          alt={entry.racer.displayName}
                        />
                      ) : (
                        <span className="racer-avatar">{entry.racer.displayName[0]}</span>
                      )}
                      <div>
                        <strong>{entry.racer.displayName}</strong>
                        <p>{metric?.distanceMeters.toFixed(0) ?? 0}m traveled</p>
                      </div>
                    </div>
                    <div className="stat-grid">
                      <StatPill
                        label="Speed"
                        value={`${metric?.currentSpeedKph.toFixed(1) ?? "0.0"} km/h`}
                      />
                      <StatPill
                        label="Top"
                        value={`${metric?.topSpeedKph.toFixed(1) ?? "0.0"} km/h`}
                      />
                      <StatPill
                        label="Average"
                        value={`${metric?.averageSpeedKph.toFixed(1) ?? "0.0"} km/h`}
                      />
                      <StatPill
                        label="Distance"
                        value={`${metric?.distanceMeters.toFixed(0) ?? "0"} / ${displayRace.targetDistanceMeters.toFixed(0)} m`}
                      />
                      <StatPill label="Watts" value={`${metric?.maxWattage.toFixed(0) ?? "0"} W`} />
                    </div>
                  </div>
                </Panel>
              );
            })}
          </motion.div>
        </AnimatePresence>
      ) : null}
    </div>
  );
}
