import type {
  AppSnapshot,
  QueueEntry,
  RaceRecord,
  TournamentBundle
} from "@roller-rumble/shared/types";
import { AnimatePresence, m } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type BracketPresentationRequest,
  type BracketWinnerAdvance,
  EliminationBracketView
} from "../components/elimination-bracket-view";
import { RaceGraphic } from "../components/race-graphics";
import { RaceResultsOverlay } from "../components/race-results-overlay";
import { EmptyState, Panel } from "@roller-rumble/shared-ui";
import { WinnerConfetti } from "../components/winner-confetti";
import { findBracketNodeByParticipantIds } from "../components/tournament-flow-layout";
import { getActiveTournament } from "../lib/admin-competition";
import { getConfettiEffectDurationMs } from "../lib/confetti-effects";
import { useMetaQuery, useSnapshotQuery } from "../lib/query";
import { SIGNUP_PROMPT_DEFAULTS } from "../lib/signup-prompt-copy";
import { buildParticipantEntries, resolveRacerName } from "../lib/snapshot-display";

const TOURNAMENT_PRE_RACE_STATES: RaceRecord["state"][] = ["scheduled", "staging", "interrupted"];
const TOURNAMENT_LIVE_STATES: RaceRecord["state"][] = ["countdown", "active"];
const BRACKET_RETURN_FOCUS_DELAY_MS = 1050;
const WINNER_ADVANCE_ANIMATION_MS = 1200;
const BRACKET_HOLD_AFTER_ADVANCE_MS = 5000;
const BRACKET_ZOOM_OUT_MS = 950;
const LOCAL_LOGO_SOURCES = [
  "/brand/fiercely-local-logo.svg",
  "/brand/fiercely-local-logo.png",
  "/brand/fiercely-local-logo.webp",
  "/brand/fiercely-local-logo.jpg"
];

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

type RaceProjection = NonNullable<AppSnapshot["raceProjection"]>;
type RaceResultPresentation = NonNullable<RaceProjection["resultPresentation"]>;
type ProjectorParticipantEntry = ReturnType<typeof buildParticipantEntries>[number];

interface RacePageViewModel {
  bracketBundle: TournamentBundle | null;
  bracketHighlightedNodeId: string | null;
  bracketPresentation: BracketPresentationRequest | null;
  displayRace: RaceRecord | null;
  metrics: RaceRecord["metrics"];
  orientation: RaceProjection["theme"]["orientation"];
  projection: RaceProjection;
  qrCodeDataUrl?: string;
  racers: ProjectorParticipantEntry[];
  resultPresentation: RaceResultPresentation | null;
  showRacePanel: boolean;
  showSignupPrompt: boolean;
  showTournamentBracket: boolean;
  snapshot: AppSnapshot;
  tickerItems: string[];
  winnerAdvance: BracketWinnerAdvance | null;
  winnerKey: string | null;
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

  const ranked = race.metrics.toSorted((left, right) => {
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

function getQueueEntryLabel(snapshot: AppSnapshot, entry: QueueEntry, index: number): string {
  const racers = entry.racerIds.map((racerId) => resolveRacerName(snapshot, racerId)).join(" vs ");
  const prefix = ["Up next", "After that", "Later"][index] ?? "Later";
  return `${prefix}: ${racers}`;
}

function buildTickerItems(snapshot: AppSnapshot): string[] {
  const upcomingRaces = snapshot.queue
    .filter((entry) => entry.status === "queued" || entry.status === "staging")
    .slice(0, 3)
    .map((entry, index) => getQueueEntryLabel(snapshot, entry, index));
  const messages = snapshot.settings.raceDisplayTickerMessages;

  if (upcomingRaces.length === 0) {
    return ["Sign up to race!", ...messages];
  }

  const items: string[] = [];
  const itemCount = Math.max(upcomingRaces.length, messages.length);

  for (let index = 0; index < itemCount; index += 1) {
    if (upcomingRaces[index]) {
      items.push(upcomingRaces[index]);
    }

    if (messages[index]) {
      items.push(messages[index]);
    }
  }

  return items;
}

function getDisplayRace({
  postRaceSequence,
  race,
  resultPresentation
}: {
  postRaceSequence: PostRaceSequence | null;
  race: RaceRecord | null;
  resultPresentation: RaceResultPresentation | null;
}): RaceRecord | null {
  return (
    resultPresentation?.race ??
    race ??
    (postRaceSequence?.phase === "confetti" ? postRaceSequence.finishedRace : null) ??
    null
  );
}

function getBracketBundle({
  activeTournament,
  currentTournamentBundle,
  currentTournamentRace,
  postRaceSequence
}: {
  activeTournament: TournamentBundle | null;
  currentTournamentBundle: TournamentBundle | null;
  currentTournamentRace: RaceRecord | null;
  postRaceSequence: PostRaceSequence | null;
}): TournamentBundle | null {
  if (postRaceSequence == null) {
    return currentTournamentRace && TOURNAMENT_PRE_RACE_STATES.includes(currentTournamentRace.state)
      ? currentTournamentBundle
      : activeTournament;
  }

  if (postRaceSequence.phase === "source" || postRaceSequence.phase === "advance") {
    return markSourceWinnerInBundle(postRaceSequence);
  }

  return postRaceSequence.afterBundle;
}

function getBracketHighlightedNodeId({
  currentTournamentNodeId,
  postRaceSequence
}: {
  currentTournamentNodeId: string | null;
  postRaceSequence: PostRaceSequence | null;
}): string | null {
  if (postRaceSequence == null) {
    return currentTournamentNodeId;
  }

  if (postRaceSequence.phase === "source") {
    return postRaceSequence.sourceNodeId;
  }

  return postRaceSequence.targetNodeId ?? postRaceSequence.sourceNodeId;
}

function getBracketPresentation({
  bracketBundle,
  currentTournamentNodeId,
  currentTournamentRace,
  postRaceSequence
}: {
  bracketBundle: TournamentBundle | null;
  currentTournamentNodeId: string | null;
  currentTournamentRace: RaceRecord | null;
  postRaceSequence: PostRaceSequence | null;
}): BracketPresentationRequest | null {
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

  if (currentTournamentNodeId && currentTournamentRace) {
    return {
      key: `${currentTournamentRace.id}:staged`,
      nodeIds: [currentTournamentNodeId],
      padding: 0.95,
      type: "focus-node"
    };
  }

  return {
    key: `${bracketBundle.tournament.id}:overview`,
    padding: 0.18,
    type: "fit-board"
  };
}

function getWinnerAdvance(postRaceSequence: PostRaceSequence | null): BracketWinnerAdvance | null {
  if (postRaceSequence?.phase !== "advance" || postRaceSequence.targetNodeId == null) {
    return null;
  }

  return {
    durationMs: WINNER_ADVANCE_ANIMATION_MS,
    fromNodeId: postRaceSequence.sourceNodeId,
    key: `${postRaceSequence.raceId}:winner-advance`,
    toNodeId: postRaceSequence.targetNodeId
  };
}

function ProjectorBrand({
  eventName,
  showEventName
}: {
  eventName: string;
  showEventName: boolean;
}) {
  return (
    <header className="race-page__brand">
      <h1>Roller Rumble</h1>
      {showEventName ? <p>{eventName}</p> : null}
    </header>
  );
}

function LocalMark({ variant }: { variant: "footer" | "corner" }) {
  return (
    <div className={`race-page__local-mark race-page__local-mark--${variant}`}>
      {variant === "footer" ? (
        <>
          <span>Fiercely</span>
          <LocalLogo />
          <span>Local</span>
        </>
      ) : (
        <>
          <span>Fiercely Local</span>
          <LocalLogo />
        </>
      )}
    </div>
  );
}

function LocalLogo() {
  const [assetIndex, setAssetIndex] = useState(0);
  const hasLogoCandidate = assetIndex < LOCAL_LOGO_SOURCES.length;
  const src = hasLogoCandidate ? LOCAL_LOGO_SOURCES[assetIndex] : null;

  return (
    <span
      className={`race-page__local-logo ${src == null ? "race-page__local-logo--missing" : ""}`}
    >
      {src ? (
        <img
          src={src}
          alt="Fiercely Local"
          draggable={false}
          onError={() => {
            setAssetIndex((current) => current + 1);
          }}
        />
      ) : (
        <span className="race-page__local-logo-fallback" aria-hidden="true" />
      )}
    </span>
  );
}

function RaceTicker({
  items,
  speedPixelsPerSecond
}: {
  items: string[];
  speedPixelsPerSecond: number;
}) {
  const safeItems = items.length > 0 ? items : ["Sign up to race!"];
  const repeatedGroup = Array.from(
    { length: Math.max(4, Math.ceil(10 / safeItems.length)) },
    () => safeItems
  ).flat();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const segmentRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const itemSignature = safeItems.join("\u001f");

  useLayoutEffect(() => {
    const track = trackRef.current;
    const segment = segmentRef.current;
    if (!track || !segment) {
      return;
    }

    const trackElement = track;
    const segmentElement = segment;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pixelsPerSecond = Math.max(24, Math.min(180, speedPixelsPerSecond));
    let segmentWidth = segmentElement.getBoundingClientRect().width;

    function measureSegment(): void {
      segmentWidth = segmentElement.getBoundingClientRect().width;
      if (segmentWidth <= 0) {
        return;
      }

      offsetRef.current %= segmentWidth;
      trackElement.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
    }

    function animate(timestamp: number): void {
      if (reducedMotionQuery.matches) {
        trackElement.style.transform = "translate3d(0, 0, 0)";
        lastTimestampRef.current = timestamp;
        frameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      const lastTimestamp = lastTimestampRef.current ?? timestamp;
      lastTimestampRef.current = timestamp;
      const elapsedSeconds = (timestamp - lastTimestamp) / 1000;

      if (segmentWidth > 0) {
        // Wrap by subtracting one measured segment width instead of resetting a CSS animation. The
        // duplicate segment is already in the same visual position, so the loop stays invisible.
        offsetRef.current = (offsetRef.current + elapsedSeconds * pixelsPerSecond) % segmentWidth;
        trackElement.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      frameRef.current = window.requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(measureSegment);
    resizeObserver.observe(segmentElement);
    measureSegment();
    lastTimestampRef.current = null;
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      resizeObserver.disconnect();
      frameRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [itemSignature, speedPixelsPerSecond]);

  return (
    <div className="race-page__ticker" aria-label="Upcoming races and announcements">
      <div ref={trackRef} className="race-page__ticker-track">
        {[0, 1, 2].map((groupIndex) => (
          <div
            key={`ticker-group:${groupIndex}`}
            ref={groupIndex === 0 ? segmentRef : undefined}
            className="race-page__ticker-group"
            aria-hidden={groupIndex > 0}
          >
            {repeatedGroup.map((item, index) => (
              <span key={`${groupIndex}:${item}:${index}`} className="race-page__ticker-item">
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RacerSignupPrompt({
  qrCodeDataUrl,
  eyebrow,
  heading,
  description
}: {
  qrCodeDataUrl?: string;
  eyebrow?: string | null;
  heading?: string | null;
  description?: string | null;
}) {
  return (
    <Panel className="panel--glass race-page__signup-prompt">
      <div className="race-page__signup-copy">
        <span>{eyebrow ?? SIGNUP_PROMPT_DEFAULTS.eyebrow}</span>
        <strong>{heading ?? SIGNUP_PROMPT_DEFAULTS.heading}</strong>
        <p className="race-page__signup-desc">{description ?? SIGNUP_PROMPT_DEFAULTS.body}</p>
      </div>
      <div className="race-page__signup-qr-wrap">
        {qrCodeDataUrl ? (
          <img className="race-page__signup-qr" src={qrCodeDataUrl} alt="QR code for racer page" />
        ) : (
          <div className="race-page__signup-qr race-page__signup-qr--loading">Preparing QR</div>
        )}
      </div>
    </Panel>
  );
}

function TournamentBracketLayer({ model }: { model: RacePageViewModel }) {
  if (!model.bracketBundle) {
    return null;
  }

  return (
    <m.div
      className="race-page__bracket-layer"
      initial={false}
      animate={{
        opacity: model.showTournamentBracket ? 1 : 0,
        x: model.showTournamentBracket ? "0%" : "-14%"
      }}
      transition={{
        duration: model.showTournamentBracket ? 0.55 : 0.4,
        ease: model.showTournamentBracket ? [0.22, 0.84, 0.2, 1] : [0.4, 0, 1, 1]
      }}
    >
      <div className="race-page__bracket-stage">
        <EliminationBracketView
          snapshot={model.snapshot}
          bundle={model.bracketBundle}
          interactive={false}
          expandMode="container"
          expanded
          highlightedNodeId={model.bracketHighlightedNodeId}
          presentationRequest={model.bracketPresentation}
          showViewportControls={false}
          winnerAdvance={model.winnerAdvance}
        />
      </div>
    </m.div>
  );
}

function RaceLayer({ model }: { model: RacePageViewModel }) {
  return (
    <m.div
      className={`race-page__race-layer ${
        model.showSignupPrompt ? "race-page__race-layer--signup-prompt" : ""
      }`}
      initial={false}
      animate={{
        opacity: model.showRacePanel ? 1 : model.bracketBundle ? 0 : 1,
        x: model.showRacePanel || model.showSignupPrompt ? "0%" : "12%"
      }}
      transition={{
        duration: model.showRacePanel ? 0.42 : 0.32,
        ease: model.showRacePanel ? [0.22, 0.84, 0.2, 1] : [0.4, 0, 1, 1]
      }}
    >
      {model.displayRace ? (
        <RaceGraphic
          theme={model.projection.theme}
          racers={model.racers}
          metrics={model.metrics}
          targetDistanceMeters={model.displayRace.targetDistanceMeters}
          raceState={model.displayRace.state}
          startedAt={model.displayRace.startedAt}
          laneColorsFlipped={model.snapshot.settings.raceDisplayLaneColorsFlipped}
          glowMode={model.snapshot.settings.raceDisplayGlowMode}
        />
      ) : model.showSignupPrompt ? (
        <RacerSignupPrompt
          qrCodeDataUrl={model.qrCodeDataUrl}
          eyebrow={model.snapshot.activeEvent.signupEyebrow}
          heading={model.snapshot.activeEvent.signupHeading}
          description={model.snapshot.activeEvent.description}
        />
      ) : !model.bracketBundle ? (
        <Panel className="panel--glass">
          <EmptyState
            title="Projector Ready"
            body="Stage the next race from the admin screen or arm VirtualDJ to kick off the countdown."
          />
        </Panel>
      ) : null}
    </m.div>
  );
}

function RaceStage({ model }: { model: RacePageViewModel }) {
  return (
    <div className="race-page__stage">
      <TournamentBracketLayer model={model} />
      <RaceLayer model={model} />
    </div>
  );
}

function RaceResultsLayer({ model }: { model: RacePageViewModel }) {
  return (
    <AnimatePresence>
      {model.resultPresentation ? (
        <RaceResultsOverlay
          laneColorsFlipped={model.snapshot.settings.raceDisplayLaneColorsFlipped}
          race={model.resultPresentation.race}
          racers={model.snapshot.racers}
          winnerRacerId={model.resultPresentation.winnerRacerId}
        />
      ) : null}
    </AnimatePresence>
  );
}

function RacePageView({ model }: { model: RacePageViewModel }) {
  return (
    <div
      className={`race-page race-page--${model.orientation} ${
        model.showSignupPrompt ? "race-page--signup-prompt" : ""
      }`}
    >
      <WinnerConfetti
        winnerKey={model.winnerKey}
        effectId={model.projection.theme.confettiEffectId}
        colors={[
          model.projection.theme.tokens.accent,
          model.projection.theme.tokens.warning,
          model.projection.theme.tokens.success,
          model.projection.theme.tokens.laneA,
          model.projection.theme.tokens.laneB
        ]}
      />
      <ProjectorBrand
        eventName={model.snapshot.activeEvent.name}
        showEventName={model.snapshot.settings.raceDisplayShowEventName}
      />
      <LocalMark variant={model.orientation === "horizontal" ? "footer" : "corner"} />

      {model.projection.countdownSecondsRemaining ? (
        <div className="countdown-overlay">
          {model.projection.countdownSecondsRemaining > 0
            ? model.projection.countdownSecondsRemaining
            : "GO!"}
        </div>
      ) : null}

      <RaceStage model={model} />
      <RaceResultsLayer model={model} />
      <RaceTicker
        items={model.tickerItems}
        speedPixelsPerSecond={model.snapshot.settings.raceDisplayTickerSpeed}
      />
    </div>
  );
}

function useRacePageViewModel(): RacePageViewModel | null {
  const snapshotQuery = useSnapshotQuery();
  const metaQuery = useMetaQuery();
  const snapshot = snapshotQuery.data ?? null;
  const meta = metaQuery.data ?? null;
  const [postRaceSequence, setPostRaceSequence] = useState<PostRaceSequence | null>(null);
  const [handledFinishedRaceIds] = useState(() => new Set<string>());
  const previousTournamentRaceRef = useRef<RaceRecord | null>(null);
  const previousTournamentBundleRef = useRef<TournamentBundle | null>(null);
  const latestTournamentWinnerIdRef = useRef<string | null>(null);

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
  const resultPresentation = projection?.resultPresentation ?? null;

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
    if (snapshot == null || currentTournamentRace || postRaceSequence || resultPresentation) {
      return;
    }

    const previousRace = previousTournamentRaceRef.current;
    const previousBundle = previousTournamentBundleRef.current;
    const winnerRacerId = latestTournamentWinnerIdRef.current;

    if (
      previousRace == null ||
      previousBundle == null ||
      winnerRacerId == null ||
      handledFinishedRaceIds.has(previousRace.id)
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

    handledFinishedRaceIds.add(previousRace.id);

    setPostRaceSequence({
      afterBundle,
      beforeBundle: previousBundle,
      finishedRace: previousRace,
      phase: "source",
      raceId: previousRace.id,
      sourceNodeId: sourceNode.id,
      targetNodeId: sourceNode.winnerToNodeId ?? null,
      winnerRacerId
    });
  }, [
    currentTournamentRace,
    handledFinishedRaceIds,
    postRaceSequence,
    resultPresentation,
    snapshot
  ]);

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
    return null;
  }

  const displayRace = getDisplayRace({ postRaceSequence, race, resultPresentation });
  const winnerKey = resultPresentation
    ? `${resultPresentation.race.id}:${resultPresentation.winnerRacerId}`
    : null;
  const currentTournamentNodeId = currentTournamentNode?.id ?? null;
  const bracketBundle = getBracketBundle({
    activeTournament,
    currentTournamentBundle,
    currentTournamentRace,
    postRaceSequence
  });
  const bracketHighlightedNodeId = getBracketHighlightedNodeId({
    currentTournamentNodeId,
    postRaceSequence
  });
  const bracketPresentation = getBracketPresentation({
    bracketBundle,
    currentTournamentNodeId,
    currentTournamentRace,
    postRaceSequence
  });
  const winnerAdvance = getWinnerAdvance(postRaceSequence);

  const showTournamentBracket =
    bracketBundle != null &&
    resultPresentation == null &&
    !(currentTournamentRace && TOURNAMENT_LIVE_STATES.includes(currentTournamentRace.state)) &&
    postRaceSequence?.phase !== "confetti";
  const showRacePanel =
    resultPresentation != null ||
    (race != null && (race.tournamentId == null || TOURNAMENT_LIVE_STATES.includes(race.state))) ||
    (postRaceSequence?.phase === "confetti" && displayRace != null);
  const racers = buildParticipantEntries(snapshot, displayRace);
  const metrics = displayRace?.metrics ?? [];
  const orientation = projection.theme.orientation;
  const tickerItems = buildTickerItems(snapshot);
  // The no-staged-race prompt is an audience call-to-action, so it should use a full-width
  // projector layout instead of inheriting the current theme's horizontal/vertical race-track
  // geometry. The bottom ticker still communicates any queued upcoming races.
  const showSignupPrompt = !bracketBundle && displayRace == null;

  return {
    bracketBundle,
    bracketHighlightedNodeId,
    bracketPresentation,
    displayRace,
    metrics,
    orientation,
    projection,
    qrCodeDataUrl: meta?.qrCodeDataUrl,
    racers,
    resultPresentation,
    showRacePanel,
    showSignupPrompt,
    showTournamentBracket,
    snapshot,
    tickerItems,
    winnerAdvance,
    winnerKey
  };
}

export function RacePage() {
  const model = useRacePageViewModel();

  return model ? <RacePageView model={model} /> : <p>Loading race display…</p>;
}
