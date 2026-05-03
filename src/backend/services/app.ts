import { EventEmitter } from "node:events";
import path from "node:path";
import QRCode from "qrcode";
import { nanoid } from "nanoid";
import {
  COUNTDOWN_SECONDS,
  DEFAULT_OS2L_PORT,
  DEFAULT_PUBLIC_HOST,
  DEFAULT_SERVER_PORT
} from "../../shared/constants";
import { themes, getTheme } from "../../shared/themes";
import type {
  BracketNode,
  AdminSettings,
  AppSnapshot,
  RaceMetricsSnapshot,
  RaceRecord,
  Racer,
  RacerStats,
  RacerSummary,
  RoundRobinMatch,
  TournamentBundle,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentPreset,
  TunnelState
} from "../../shared/types";
import { nowIso } from "../../shared/utils";
import { AppDatabase } from "../db/Database";
import { ManualRaceTriggerAdapter } from "../adapters/trigger-manual";
import { Os2lRaceTriggerAdapter } from "../adapters/trigger-os2l";
import { SimulatorSensorAdapter } from "../adapters/sensor-simulator";
import {
  applyRotationSample,
  createLaneTelemetryState,
  finishLaneTelemetryState,
  type LaneTelemetryState
} from "./metrics";
import { CloudflaredTunnelManager } from "./cloudflared";
import {
  advanceDoubleElimination,
  advanceSingleElimination,
  computeRoundRobinStandings
} from "./competition";
import {
  addQueueSignup,
  findNextQueuedEntry,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "./queue";
import { TournamentService } from "./tournaments";

interface CurrentRaceRuntime {
  // High-frequency telemetry stays in memory while the DB stores UI-ready snapshots.
  raceId: string;
  targetDistanceMeters: number;
  winnerRacerId: string | null;
  finished: boolean;
  startedAtMs: number;
  laneStates: Map<string, LaneTelemetryState>;
  finalizeTimer: NodeJS.Timeout | null;
}

interface AppServiceOptions {
  dataDir: string;
  serverPort?: number;
}

function sameParticipantSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((racerId, index) => racerId === sortedRight[index]);
}

function findBracketNodeForParticipants(
  nodes: BracketNode[],
  stageId: string | null | undefined,
  participantIds: string[]
): BracketNode | null {
  return (
    nodes.find((node) => {
      if (node.stageId !== stageId || node.winnerRacerId) {
        return false;
      }

      const nodeParticipants = [node.racerAId, node.racerBId].filter((racerId): racerId is string =>
        Boolean(racerId)
      );
      return sameParticipantSet(nodeParticipants, participantIds);
    }) ?? null
  );
}

function findGroupMatchForParticipants(
  matches: RoundRobinMatch[],
  participantIds: string[]
): RoundRobinMatch | null {
  return (
    matches.find(
      (match) =>
        !match.winnerRacerId && sameParticipantSet([match.racerAId, match.racerBId], participantIds)
    ) ?? null
  );
}

export class GoldsprintsApp extends EventEmitter {
  readonly dataDir: string;
  readonly uploadsDir: string;
  readonly db: AppDatabase;

  private readonly sensorAdapter = new SimulatorSensorAdapter();
  private readonly manualTrigger = new ManualRaceTriggerAdapter();
  // Debug sessions sometimes need a second app instance; allowing the OS2L port to move keeps
  // the duplicate instance isolated without affecting the normal production default.
  private readonly os2lTrigger = new Os2lRaceTriggerAdapter(
    Number(process.env.GOLDSPRINTS_OS2L_PORT ?? DEFAULT_OS2L_PORT)
  );
  private readonly tunnelManager = new CloudflaredTunnelManager();
  private readonly tournaments = new TournamentService();
  private countdownTicker: NodeJS.Timeout | null = null;
  private currentRuntime: CurrentRaceRuntime | null = null;
  private serverPort: number;

  constructor(options: AppServiceOptions) {
    super();
    this.dataDir = options.dataDir;
    this.uploadsDir = path.join(options.dataDir, "uploads");
    this.serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
    this.db = new AppDatabase(options.dataDir);
  }

  async init(): Promise<void> {
    this.db.init();
    const settings = this.db.getAdminSettings();
    this.serverPort = settings.serverPort;
    this.manualTrigger.start(() => this.startCountdown("manual"));
    this.os2lTrigger.start(() => this.startCountdown("os2l"));
    this.os2lTrigger.setEnabled(settings.os2lEnabled);
    this.sensorAdapter.connect((event) =>
      this.handleRotation(event.racerId, event.timestampMs, event.deltaRotations)
    );
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
  }

  async close(): Promise<void> {
    this.sensorAdapter.disconnect();
    this.manualTrigger.stop();
    this.os2lTrigger.stop();
    this.tunnelManager.stop();
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
      this.countdownTicker = null;
    }
    if (this.currentRuntime?.finalizeTimer) {
      clearTimeout(this.currentRuntime.finalizeTimer);
    }
    this.db.close();
  }

  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void {
    this.on("snapshot", listener);
    return () => this.off("snapshot", listener);
  }

  private emitSnapshot(): void {
    this.emit("snapshot", this.getSnapshot());
  }

  getSnapshot(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const results = settings.includeAllRaceData
      ? this.db.listResults()
      : this.db.listResults(activeEvent.id);
    const racers = this.buildRacerSummaries(activeEvent.id, results);
    const queue = this.db
      .listQueueEntries(activeEvent.id)
      .filter((entry) => ["queued", "staging", "racing"].includes(entry.status));
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    const nextQueueEntry = findNextQueuedEntry(queue);
    // Snapshot tournament state is intentionally scoped to the active event so the racer page and
    // admin surfaces do not have to untangle cross-event tournament history on the client.
    const tournamentBundles = this.db.listTournamentBundles(activeEvent.id);
    const selectedTheme = getTheme(settings.themeId);

    const countdownSecondsRemaining =
      currentRace?.state === "countdown" && currentRace.countdownStartedAt
        ? Math.max(
            0,
            Math.ceil(
              COUNTDOWN_SECONDS -
                (Date.now() - new Date(currentRace.countdownStartedAt).getTime()) / 1000
            )
          )
        : null;

    const metricsByRacerId = Object.fromEntries(
      (currentRace?.metrics ?? []).map(
        (metric) => [metric.racerId, metric] satisfies [string, RaceMetricsSnapshot]
      )
    );

    const tunnel = this.tunnelManager.getState();

    return {
      generatedAt: nowIso(),
      settings,
      activeEvent,
      racers,
      queue,
      tournaments: tournamentBundles,
      tunnel,
      themes,
      raceProjection: {
        race: currentRace,
        countdownSecondsRemaining,
        metricsByRacerId,
        winnerRacerId: currentRace?.winnerRacerId ?? null,
        nextQueueEntry,
        theme: selectedTheme
      }
    };
  }

  private buildRacerSummaries(
    eventId: string,
    results: ReturnType<AppDatabase["listResults"]>
  ): RacerSummary[] {
    const racers = this.db.listEventRacers(eventId);

    return racers.map((racer) => {
      const racerResults = results.filter((result) => result.racerId === racer.id);
      const stats: RacerStats = {
        races: racerResults.length,
        wins: racerResults.filter((result) => result.placement === 1).length,
        bestFinishTimeMs:
          racerResults
            .map((result) => result.finishTimeMs)
            .filter((value): value is number => typeof value === "number")
            .sort((left, right) => left - right)[0] ?? null,
        topSpeedKph: racerResults.reduce((max, result) => Math.max(max, result.topSpeedKph), 0),
        averageSpeedKph:
          racerResults.length === 0
            ? 0
            : Number(
                (
                  racerResults.reduce((sum, result) => sum + result.avgSpeedKph, 0) /
                  racerResults.length
                ).toFixed(2)
              ),
        maxWattage: racerResults.reduce((max, result) => Math.max(max, result.maxWattage), 0)
      };
      return {
        racer,
        stats
      };
    });
  }

  private getActiveTournamentBundle(eventId: string): TournamentBundle | null {
    return (
      this.db
        .listTournamentBundles(eventId)
        .find((bundle) => bundle.tournament.status === "active") ?? null
    );
  }

  private syncGroupsToFinals(bundle: TournamentBundle): TournamentBundle {
    if (
      bundle.tournament.preset !== "groups-to-single-elimination" ||
      bundle.bracketNodes.length === 0
    ) {
      return bundle;
    }

    const actualRacerIds = new Set(bundle.seeds.map((seed) => seed.racerId));
    const groupLabels = [
      ...new Set(bundle.groupMatches.map((match) => match.scoreLabel).filter(Boolean))
    ]
      .filter((label): label is string => Boolean(label))
      .sort((left, right) => left.localeCompare(right));
    const finalists = new Map<string, string>();

    for (const groupLabel of groupLabels) {
      const matches = bundle.groupMatches.filter((match) => match.scoreLabel === groupLabel);
      const racerIds = [...new Set(matches.flatMap((match) => [match.racerAId, match.racerBId]))];
      const seeds = bundle.seeds.filter((seed) => racerIds.includes(seed.racerId));
      const standings = computeRoundRobinStandings(seeds, matches);

      if (standings[0]) {
        finalists.set(`${groupLabel}-1`, standings[0].racerId);
      }
      if (standings[1]) {
        finalists.set(`${groupLabel}-2`, standings[1].racerId);
      }
    }

    return {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((node) => {
        if (node.winnerRacerId) {
          return node;
        }

        const racerAId =
          node.racerAId == null
            ? null
            : actualRacerIds.has(node.racerAId)
              ? node.racerAId
              : (finalists.get(node.racerAId) ?? null);
        const racerBId =
          node.racerBId == null
            ? null
            : actualRacerIds.has(node.racerBId)
              ? node.racerBId
              : (finalists.get(node.racerBId) ?? null);

        return {
          ...node,
          racerAId,
          racerBId,
          state: racerAId && racerBId ? ("ready" as const) : ("pending" as const),
          updatedAt: nowIso()
        };
      })
    };
  }

  private markTournamentCompleteIfFinished(bundle: TournamentBundle): TournamentBundle {
    const unfinishedGroupMatch = bundle.groupMatches.some((match) => !match.winnerRacerId);
    const unfinishedBracketNode = bundle.bracketNodes.some(
      (node) =>
        Boolean(node.racerAId ?? node.racerBId) && !node.winnerRacerId && node.state !== "bye"
    );

    if (unfinishedGroupMatch || unfinishedBracketNode || bundle.tournament.status === "complete") {
      return bundle;
    }

    return {
      ...bundle,
      tournament: {
        ...bundle.tournament,
        status: "complete",
        updatedAt: nowIso()
      }
    };
  }

  private applyTournamentRaceOutcome(race: RaceRecord, winnerRacerId: string | null): void {
    if (!race.tournamentId || !winnerRacerId) {
      return;
    }

    const bundle = this.db.getTournamentBundle(race.tournamentId);
    if (!bundle) {
      return;
    }

    const participantIds = race.participants.map((participant) => participant.racerId);

    const sourceBracketNode = findBracketNodeForParticipants(
      bundle.bracketNodes,
      race.stageId,
      participantIds
    );

    const nextBundle = sourceBracketNode
      ? {
          ...bundle,
          bracketNodes:
            bundle.tournament.preset === "double-elimination"
              ? advanceDoubleElimination(bundle.bracketNodes, sourceBracketNode.id, winnerRacerId)
              : advanceSingleElimination(bundle.bracketNodes, sourceBracketNode.id, winnerRacerId)
        }
      : (() => {
          const sourceGroupMatch = findGroupMatchForParticipants(
            bundle.groupMatches,
            participantIds
          );
          if (!sourceGroupMatch) {
            return null;
          }

          return this.syncGroupsToFinals({
            ...bundle,
            groupMatches: bundle.groupMatches.map((match) =>
              match.id === sourceGroupMatch.id ? { ...match, winnerRacerId } : match
            )
          });
        })();

    if (!nextBundle) {
      return;
    }

    const finalizedBundle = this.markTournamentCompleteIfFinished(nextBundle);
    this.db.saveTournamentBundle(finalizedBundle);
    if (finalizedBundle.tournament.status === "complete") {
      this.db.updateAdminSettings({
        mode: "open-time-trial"
      });
    }
  }

  getLocalBaseUrl(): string {
    return `http://${DEFAULT_PUBLIC_HOST}:${this.serverPort}`;
  }

  async getQrCodeDataUrl(): Promise<string> {
    const tunnel = this.tunnelManager.getState();
    const url = tunnel.publicUrl ?? `${this.getLocalBaseUrl()}/racer`;
    return QRCode.toDataURL(url, {
      margin: 1,
      width: 220
    });
  }

  createEvent(name: string): AppSnapshot {
    this.db.createEvent(name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  registerRacer(input: {
    displayName: string;
    email?: string;
    phone?: string;
    anonymousId?: string;
  }): AppSnapshot {
    this.registerRacerRecord(input);
    return this.getSnapshot();
  }

  registerRacerRecord(input: {
    displayName: string;
    email?: string;
    phone?: string;
    anonymousId?: string;
  }): Racer {
    const activeEvent = this.db.getActiveEvent()!;
    const racer = this.db.createOrUpdateRacer(input);
    this.db.ensureEventRegistration(activeEvent.id, racer.id);
    this.emitSnapshot();
    return racer;
  }

  setRacerAvatar(racerId: string, avatarUrl: string): AppSnapshot {
    this.db.updateRacerAvatar(racerId, avatarUrl);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  updateSettings(patch: Partial<AdminSettings>): AppSnapshot {
    const next = this.db.updateAdminSettings({
      ...patch,
      serverPort: this.serverPort
    });
    this.os2lTrigger.setEnabled(next.os2lEnabled);
    if (patch.targetDistanceMeters != null) {
      this.applyRaceDistanceSetting(next.targetDistanceMeters);
    }
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  private shouldAutoStageNextRace(): boolean {
    const activeEvent = this.db.getActiveEvent();
    if (!activeEvent) {
      return false;
    }

    const settings = this.db.getAdminSettings();
    // Auto-stage is only for the open queue flow; tournament match staging stays explicit.
    if (!settings.autoStageNextRace || settings.mode !== "open-time-trial") {
      return false;
    }

    if (this.db.getCurrentRace(activeEvent.id)) {
      return false;
    }

    return Boolean(findNextQueuedEntry(this.db.listQueueEntries(activeEvent.id)));
  }

  private maybeAutoStageNextRace(): boolean {
    if (!this.shouldAutoStageNextRace()) {
      return false;
    }

    this.stageNextRace();
    return true;
  }

  private applyRaceDistanceSetting(targetDistanceMeters: number): void {
    const activeEvent = this.db.getActiveEvent();
    if (!activeEvent) {
      return;
    }

    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (!currentRace) {
      return;
    }

    // Once a race is live, it keeps the distance it started with so admin tweaks only affect later runs.
    if (currentRace.state === "active") {
      return;
    }

    this.db.updateRace(currentRace.id, {
      targetDistanceMeters
    });

    const runtime = this.currentRuntime;
    if (runtime?.raceId !== currentRace.id) {
      return;
    }

    runtime.targetDistanceMeters = targetDistanceMeters;
    // Lowering the target can instantly end a live race, so re-evaluate against current telemetry.
    this.reconcileRuntimeTargetDistance(Date.now());
  }

  signUpQueue(input: {
    racerId: string;
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
  }): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    this.db.ensureEventRegistration(activeEvent.id, input.racerId);
    if (input.opponentRacerId) {
      this.db.ensureEventRegistration(activeEvent.id, input.opponentRacerId);
    }
    const updated = addQueueSignup(this.db.listQueueEntries(activeEvent.id), {
      eventId: activeEvent.id,
      racerId: input.racerId,
      opponentRacerId: input.opponentRacerId,
      requestedType: input.requestedType,
      entryId: nanoid(),
      timestamp: nowIso()
    });
    this.db.replaceQueueEntries(activeEvent.id, updated);
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  removeRacerFromAllUpcomingRaces(racerId: string): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const updated = removeRacerFromQueue(this.db.listQueueEntries(activeEvent.id), racerId).map(
      (entry) => ({
        ...entry,
        updatedAt: nowIso()
      })
    );
    this.db.replaceQueueEntries(activeEvent.id, updated);
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  removeRacerFromQueueEntry(entryId: string, racerId: string): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const updated = removeRacerFromSpecificQueueEntry(
      this.db.listQueueEntries(activeEvent.id),
      entryId,
      racerId
    ).map((entry) => ({
      ...entry,
      updatedAt: nowIso()
    }));
    this.db.replaceQueueEntries(activeEvent.id, updated);
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  stageNextRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (currentRace && ["staging", "countdown", "active"].includes(currentRace.state)) {
      return this.getSnapshot();
    }

    const nextEntry = findNextQueuedEntry(this.db.listQueueEntries(activeEvent.id));
    if (!nextEntry) {
      return this.getSnapshot();
    }

    this.db.markQueueEntryStatus(nextEntry.id, "staging");
    // Solo races use a dedicated "solo" lane so themes can render a centered single-rider layout.
    const participants =
      nextEntry.racerIds.length === 1
        ? [{ racerId: nextEntry.racerIds[0], lane: "solo" as const }]
        : [
            { racerId: nextEntry.racerIds[0], lane: "left" as const },
            { racerId: nextEntry.racerIds[1], lane: "right" as const }
          ];

    const race = this.db.createRace({
      eventId: activeEvent.id,
      queueEntryId: nextEntry.id,
      mode: settings.mode,
      format: nextEntry.type,
      themeId: settings.themeId,
      targetDistanceMeters: settings.targetDistanceMeters,
      participants
    });

    this.db.updateRace(race.id, {
      state: "staging"
    });

    if (settings.os2lEnabled) {
      this.os2lTrigger.armRace(race.id);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  startManualCountdown(): AppSnapshot {
    this.manualTrigger.trigger();
    return this.getSnapshot();
  }

  startCountdown(source: "manual" | "os2l"): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    const settings = this.db.getAdminSettings();
    if (!currentRace) {
      // Countdown should only ever start an already staged race; staging is a separate admin action.
      return this.getSnapshot();
    }

    if (source === "os2l" && !settings.os2lEnabled) {
      return this.getSnapshot();
    }

    if (!["scheduled", "staging", "interrupted"].includes(currentRace.state)) {
      return this.getSnapshot();
    }

    const countdownStartedAt = nowIso();
    this.db.updateRace(currentRace.id, {
      state: "countdown",
      countdownStartedAt
    });

    this.os2lTrigger.disarmRace();
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
    }
    // Countdown time is derived from the stored start timestamp, so we just re-broadcast snapshots.
    this.countdownTicker = setInterval(() => {
      this.emitSnapshot();
    }, 250);

    setTimeout(() => {
      if (this.countdownTicker) {
        clearInterval(this.countdownTicker);
        this.countdownTicker = null;
      }
      this.activateRace(currentRace.id);
    }, COUNTDOWN_SECONDS * 1000);

    this.emitSnapshot();
    return this.getSnapshot();
  }

  private activateRace(raceId: string): void {
    const race = this.db.getRace(raceId);
    if (!race) {
      return;
    }

    const startedAt = nowIso();
    const startedAtMs = new Date(startedAt).getTime();
    const activeRace = this.db.updateRace(race.id, {
      state: "active",
      startedAt
    });

    const laneStates = new Map<string, LaneTelemetryState>();
    for (const participant of activeRace.participants) {
      laneStates.set(participant.racerId, createLaneTelemetryState(participant, startedAtMs));
    }

    // Runtime-only state keeps sensor ingestion cheap while the persisted race record remains recoverable.
    this.currentRuntime = {
      raceId: activeRace.id,
      targetDistanceMeters: activeRace.targetDistanceMeters,
      winnerRacerId: null,
      finished: false,
      startedAtMs,
      laneStates,
      finalizeTimer: null
    };

    this.db.markQueueEntryStatus(activeRace.queueEntryId ?? "", "racing");
    this.sensorAdapter.beginRace(activeRace.participants);
    this.emitSnapshot();
  }

  private handleRotation(racerId: string, timestampMs: number, deltaRotations: number): void {
    const runtime = this.currentRuntime;
    if (!runtime || runtime.finished) {
      return;
    }

    const laneState = runtime.laneStates.get(racerId);
    if (!laneState) {
      return;
    }

    const next = applyRotationSample(laneState, {
      timestampMs,
      deltaRotations
    });
    runtime.laneStates.set(racerId, next);

    const metrics = [...runtime.laneStates.values()].map((state) => state.snapshot);
    this.db.updateRace(runtime.raceId, {
      metrics
    });

    const justFinished =
      next.snapshot.finishedAtMs == null &&
      next.snapshot.distanceMeters >= runtime.targetDistanceMeters;

    if (justFinished) {
      const finishedState = finishLaneTelemetryState(next, timestampMs);
      runtime.laneStates.set(racerId, finishedState);
      runtime.winnerRacerId ??= racerId;
      // Allow a short grace period so the other lane can contribute one last sample before final ordering.
      runtime.finalizeTimer ??= setTimeout(() => this.finalizeCurrentRace(), 1500);
    }

    this.db.updateRace(runtime.raceId, {
      metrics: [...runtime.laneStates.values()].map((state) => state.snapshot),
      winnerRacerId: runtime.winnerRacerId
    });
    this.emitSnapshot();
  }

  private reconcileRuntimeTargetDistance(timestampMs: number): void {
    const runtime = this.currentRuntime;
    if (!runtime || runtime.finished) {
      return;
    }

    let reachedTarget = false;
    for (const [racerId, laneState] of runtime.laneStates.entries()) {
      if (
        laneState.snapshot.finishedAtMs == null &&
        laneState.snapshot.distanceMeters >= runtime.targetDistanceMeters
      ) {
        runtime.laneStates.set(racerId, finishLaneTelemetryState(laneState, timestampMs));
        reachedTarget = true;
      }
    }

    const snapshots = [...runtime.laneStates.values()].map((state) => state.snapshot);
    if (reachedTarget) {
      const leader = [...snapshots].sort((left, right) => {
        if (right.distanceMeters !== left.distanceMeters) {
          return right.distanceMeters - left.distanceMeters;
        }
        return left.elapsedMs - right.elapsedMs;
      })[0];

      runtime.winnerRacerId ??= leader.racerId;
      runtime.finalizeTimer ??= setTimeout(() => this.finalizeCurrentRace(), 500);
    }

    this.db.updateRace(runtime.raceId, {
      targetDistanceMeters: runtime.targetDistanceMeters,
      metrics: snapshots,
      winnerRacerId: runtime.winnerRacerId
    });
  }

  finalizeCurrentRace(): AppSnapshot {
    const runtime = this.currentRuntime;
    if (!runtime || runtime.finished) {
      return this.getSnapshot();
    }

    runtime.finished = true;
    if (runtime.finalizeTimer) {
      clearTimeout(runtime.finalizeTimer);
      runtime.finalizeTimer = null;
    }

    this.sensorAdapter.endRace();
    const race = this.db.getRace(runtime.raceId);
    if (!race) {
      this.currentRuntime = null;
      return this.getSnapshot();
    }

    const finalizedMetrics = [...runtime.laneStates.values()].map((state) => {
      if (state.snapshot.finishedAtMs != null) {
        return state.snapshot;
      }
      return finishLaneTelemetryState(state, Date.now()).snapshot;
    });

    // Ranking falls back to furthest distance when a racer never fully crossed the line.
    const ordered = [...finalizedMetrics].sort((left, right) => {
      const leftTime = left.finishedAtMs ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.finishedAtMs ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return right.distanceMeters - left.distanceMeters;
    });

    const winnerRacerId = runtime.winnerRacerId ?? (ordered.length > 0 ? ordered[0].racerId : null);
    this.db.updateRace(runtime.raceId, {
      state: "finished",
      metrics: finalizedMetrics,
      winnerRacerId,
      finishedAt: nowIso()
    });

    if (race.queueEntryId) {
      this.db.markQueueEntryStatus(race.queueEntryId, "completed");
    }

    this.db.createResults(
      ordered.map((metric, index) => ({
        eventId: race.eventId,
        raceId: race.id,
        racerId: metric.racerId,
        lane: metric.lane,
        placement: index + 1,
        finishTimeMs: metric.finishedAtMs ?? metric.elapsedMs,
        distanceMeters: metric.distanceMeters,
        avgSpeedKph: metric.averageSpeedKph,
        topSpeedKph: metric.topSpeedKph,
        maxWattage: metric.maxWattage
      }))
    );

    this.applyTournamentRaceOutcome(race, winnerRacerId);

    this.currentRuntime = null;
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  restartInterruptedRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const race = this.db.getCurrentRace(activeEvent.id);
    if (race?.state !== "interrupted") {
      return this.getSnapshot();
    }

    // Restart discards partial telemetry but preserves the same queue entry and racer pairing.
    this.db.updateRace(race.id, {
      state: "staging",
      metrics: [],
      winnerRacerId: null,
      countdownStartedAt: null,
      startedAt: null,
      finishedAt: null
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  resumeInterruptedRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const race = this.db.getCurrentRace(activeEvent.id);
    if (race?.state !== "interrupted") {
      return this.getSnapshot();
    }

    const startedAtMs = race.startedAt ? new Date(race.startedAt).getTime() : Date.now();
    const laneStates = new Map<string, LaneTelemetryState>();
    for (const participant of race.participants) {
      // Resume rehydrates each lane from the persisted metric snapshot instead of starting over.
      const snapshot =
        race.metrics.find((metric) => metric.racerId === participant.racerId) ??
        createLaneTelemetryState(participant, startedAtMs).snapshot;

      laneStates.set(participant.racerId, {
        participant,
        startedAtMs,
        lastSampleAtMs: Date.now(),
        snapshot
      });
    }

    this.currentRuntime = {
      raceId: race.id,
      targetDistanceMeters: race.targetDistanceMeters,
      winnerRacerId: race.winnerRacerId ?? null,
      finished: false,
      startedAtMs,
      laneStates,
      finalizeTimer: null
    };

    this.db.updateRace(race.id, {
      state: "active",
      startedAt: race.startedAt ?? nowIso()
    });
    this.sensorAdapter.beginRace(race.participants);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  finalizeInterruptedRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const race = this.db.getCurrentRace(activeEvent.id);
    if (race?.state !== "interrupted") {
      return this.getSnapshot();
    }

    this.currentRuntime = {
      raceId: race.id,
      targetDistanceMeters: race.targetDistanceMeters,
      winnerRacerId:
        race.winnerRacerId ??
        (race.metrics.length > 0
          ? race.metrics.sort((left, right) => right.distanceMeters - left.distanceMeters)[0]
              .racerId
          : null) ??
        null,
      finished: false,
      startedAtMs: race.startedAt ? new Date(race.startedAt).getTime() : Date.now(),
      laneStates: new Map(
        race.participants.map((participant) => [
          participant.racerId,
          {
            participant,
            startedAtMs: race.startedAt ? new Date(race.startedAt).getTime() : Date.now(),
            lastSampleAtMs: Date.now(),
            snapshot:
              race.metrics.find((metric) => metric.racerId === participant.racerId) ??
              createLaneTelemetryState(participant, Date.now()).snapshot
          }
        ])
      ),
      finalizeTimer: null
    };
    return this.finalizeCurrentRace();
  }

  private stageTournamentRace(input: {
    tournamentId: string;
    stageId: string;
    preset: TournamentPreset;
    racerIds: [string, string];
  }): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (currentRace && ["staging", "countdown", "active"].includes(currentRace.state)) {
      return this.getSnapshot();
    }

    const settings = this.db.getAdminSettings();
    const race = this.db.createRace({
      eventId: activeEvent.id,
      tournamentId: input.tournamentId,
      stageId: input.stageId,
      mode: input.preset,
      format: "match",
      themeId: settings.themeId,
      targetDistanceMeters: settings.targetDistanceMeters,
      participants: [
        { racerId: input.racerIds[0], lane: "left" as const },
        { racerId: input.racerIds[1], lane: "right" as const }
      ]
    });

    this.db.updateRace(race.id, {
      state: "staging"
    });

    if (settings.os2lEnabled) {
      this.os2lTrigger.armRace(race.id);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  private unstageOpenTimeTrialRaceForTournament(eventId: string): void {
    const currentRace = this.db.getCurrentRace(eventId);
    if (!currentRace) {
      return;
    }

    const queueEntryId = currentRace.queueEntryId;
    if (currentRace.tournamentId != null || queueEntryId == null) {
      throw new Error(
        "Finish the currently staged tournament race before starting another tournament."
      );
    }

    if (!["scheduled", "staging"].includes(currentRace.state)) {
      throw new Error(
        "Finish or recover the current open time trial race before starting a tournament."
      );
    }

    this.db.updateRace(currentRace.id, {
      countdownStartedAt: null,
      finishedAt: null,
      metrics: [],
      startedAt: null,
      state: "cancelled",
      winnerRacerId: null
    });
    this.db.markQueueEntryStatus(queueEntryId, "queued");
    this.os2lTrigger.disarmRace();
  }

  createTournament(input: {
    name: string;
    preset: AdminSettings["mode"];
    bracketSize?: TournamentBracketSize;
    bracketLayout?: TournamentBracketLayoutMode;
  }): AppSnapshot {
    if (input.preset === "open-time-trial") {
      throw new Error("Choose a tournament format to start a tournament.");
    }

    if (input.preset === "double-elimination" && input.bracketSize === 2) {
      throw new Error("Double elimination brackets must be at least 4 riders.");
    }

    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    if (this.getActiveTournamentBundle(activeEvent.id)) {
      throw new Error("Finish the active tournament before starting another one.");
    }

    this.unstageOpenTimeTrialRaceForTournament(activeEvent.id);

    const racers = this.db.listEventRacers(activeEvent.id);
    const results = settings.includeAllRaceData
      ? this.db.listResults()
      : this.db.listResults(activeEvent.id);
    const bundle = this.tournaments.createTournamentBundle({
      event: activeEvent,
      racers,
      results,
      name: input.name,
      preset: input.preset,
      bracketSize: input.bracketSize,
      bracketLayout: input.bracketLayout
    });
    this.db.createTournamentBundle(bundle);
    this.db.updateAdminSettings({
      mode: input.preset
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  stageTournamentBracketMatch(tournamentId: string, nodeId: string): AppSnapshot {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (bundle?.tournament.status !== "active") {
      return this.getSnapshot();
    }

    const node = bundle.bracketNodes.find((candidate) => candidate.id === nodeId);
    if (node?.state !== "ready" || !node.racerAId || !node.racerBId) {
      return this.getSnapshot();
    }

    return this.stageTournamentRace({
      tournamentId,
      stageId: node.stageId,
      preset: bundle.tournament.preset,
      racerIds: [node.racerAId, node.racerBId]
    });
  }

  stageTournamentGroupMatch(tournamentId: string, matchId: string): AppSnapshot {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (bundle?.tournament.status !== "active") {
      return this.getSnapshot();
    }

    const match = bundle.groupMatches.find((candidate) => candidate.id === matchId);
    const stage =
      bundle.stages.find(
        (candidate) => candidate.kind === "groups" || candidate.kind === "round-robin"
      ) ?? bundle.stages[0];
    if (!match || match.winnerRacerId) {
      return this.getSnapshot();
    }

    return this.stageTournamentRace({
      tournamentId,
      stageId: stage.id,
      preset: bundle.tournament.preset,
      racerIds: [match.racerAId, match.racerBId]
    });
  }

  endTournamentEarly(tournamentId: string): AppSnapshot {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (bundle?.tournament.status !== "active") {
      return this.getSnapshot();
    }

    this.db.saveTournamentBundle({
      ...bundle,
      tournament: {
        ...bundle.tournament,
        status: "complete",
        updatedAt: nowIso()
      }
    });
    this.db.updateAdminSettings({
      mode: "open-time-trial"
    });
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  startTunnel(): AppSnapshot {
    this.tunnelManager.start(this.serverPort, () => this.emitSnapshot());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  stopTunnel(): AppSnapshot {
    this.tunnelManager.stop(() => this.emitSnapshot());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  getTunnelState(): TunnelState {
    return this.tunnelManager.getState();
  }

  setServerPort(port: number): void {
    this.serverPort = port;
    this.db.updateAdminSettings({
      ...this.db.getAdminSettings(),
      serverPort: port
    });
  }
}
