import type {
  AppSnapshot,
  Os2lDiagnostics,
  PhotoBoothStatus,
  RaceMetricsSnapshot,
  RaceResultPresentation,
  RacerStats,
  RacerSummary,
  RuntimeEnvInfo,
  SensorMonitor,
  StripeSetupStatus,
  TopRacersEntry,
  TunnelState
} from "@roller-rumble/shared/types";
import { getTheme, themes } from "@roller-rumble/shared/themes";
import type { AppDatabase } from "../db/Database";
import type { SensorStatus } from "../adapters/sensor";
import type { RaceCountdownTiming } from "./race-countdown";
import { findNextQueuedEntry, reindexQueue } from "./queue";
import { measureRacePace } from "./race-pace";
import { assembleSubsystemHealth } from "./subsystem-health";
import { rankTopRacers } from "./top-racers";
import { buildTournamentQueue } from "./tournament-queue";

export type SnapshotStreamSurface = "admin" | "projector" | "racer";

/**
 * The live runtime state that only `RollerRumbleApp` knows at assemble time. Everything
 * else the snapshot needs is read from the database. Passing this in keeps the assembler
 * a pure read — it owns no timers, sockets, or adapters.
 */
export interface SnapshotContext {
  resultPresentation: RaceResultPresentation | null;
  tunnel: TunnelState;
  os2l: Os2lDiagnostics;
  photoBooth: PhotoBoothStatus;
  stripe: StripeSetupStatus;
  sensor: SensorStatus;
  sensorMonitor: SensorMonitor | null;
  runtimeEnv: RuntimeEnvInfo;
  /** The live countdown timing owned by RaceCountdown (in-memory, never persisted — ADR 0017), or
   * null when no countdown is running. The projector's remaining-seconds clock derives from this. */
  countdown: RaceCountdownTiming | null;
  /** Defaults to Date.now; injected for deterministic tests. */
  now?: () => number;
}

type RaceResults = ReturnType<AppDatabase["listResults"]>;

/** A racer's top speed, average speed, power, and quickest time across `results`; null when there are none. */
function summarizePerformance(results: RaceResults) {
  if (results.length === 0) {
    return { bestFinishTimeMs: null, topSpeedKph: null, averageSpeedKph: null, maxWattage: null };
  }
  const finishTimes = results
    .map((result) => result.finishTimeMs)
    .filter((value): value is number => typeof value === "number");
  return {
    bestFinishTimeMs: finishTimes.length > 0 ? Math.min(...finishTimes) : null,
    topSpeedKph: Math.max(...results.map((result) => result.topSpeedKph)),
    averageSpeedKph: Number(
      (results.reduce((sum, result) => sum + result.avgSpeedKph, 0) / results.length).toFixed(2)
    ),
    maxWattage: Math.max(...results.map((result) => result.maxWattage))
  };
}

/**
 * Owns the full `AppSnapshot` shape end-to-end: assembling it from the database plus the
 * injected runtime context, and projecting it per streaming surface. The server no longer
 * knows the snapshot shape — it only asks for a per-surface projection.
 *
 * Pure and read-only: callers run any DB writes (e.g. queue reconciliation) before calling
 * `assemble`.
 */
export class SnapshotAssembler {
  constructor(private db: AppDatabase) {}

  /** Full admin/projector shape. Assumes the caller has already reconciled queue state. */
  assemble(ctx: SnapshotContext): AppSnapshot {
    const now = ctx.now ?? Date.now;
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const allResults = this.db.listResults();
    const results = settings.includeAllRaceData
      ? allResults
      : allResults.filter((result) => result.eventId === activeEvent.id);
    // Every racer's best qualifying run this event, fastest first. It feeds both the top racers
    // board and each racer's event fastest time, and ranks the active event alone, whatever
    // `includeAllRaceData` says (ADR 0022).
    const eventBestRuns = rankTopRacers({
      eventId: activeEvent.id,
      raceDistanceMeters: settings.targetDistanceMeters,
      raceTargetDistanceById: this.db.listRaceTargetDistances(activeEvent.id),
      results: allResults,
      rows: Number.POSITIVE_INFINITY
    });
    const racers = this.buildRacerSummaries(activeEvent.id, results, allResults, eventBestRuns);
    const queue = reindexQueue(
      this.db
        .listQueueEntries(activeEvent.id)
        .filter((entry) => ["queued", "staging"].includes(entry.status))
    );
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    const topRacers = eventBestRuns.slice(0, settings.raceDisplayTopRacersRows);
    const nextQueueEntry = findNextQueuedEntry(queue);
    // Snapshot tournament state is intentionally scoped to the active event so the racer page and
    // admin surfaces do not have to untangle cross-event tournament history on the client.
    const tournamentBundles = this.db.listTournamentBundles(activeEvent.id);
    const activeTournament =
      tournamentBundles.find((bundle) => bundle.tournament.status === "active") ?? null;
    const selectedTheme = getTheme(settings.themeId);

    // Gate on the persisted lifecycle flag, but derive the remaining time from RaceCountdown's live
    // in-memory timing (ADR 0017) rather than a persisted start timestamp.
    const countdown = ctx.countdown;
    const countdownSecondsRemaining =
      currentRace?.state === "countdown" && countdown?.raceId === currentRace.id
        ? Math.max(0, Math.ceil((countdown.durationMs - (now() - countdown.startedAtMs)) / 1000))
        : null;

    const metricsByRacerId = Object.fromEntries(
      (currentRace?.metrics ?? []).map(
        (metric) => [metric.racerId, metric] satisfies [string, RaceMetricsSnapshot]
      )
    );

    return {
      generatedAt: new Date(now()).toISOString(),
      notificationRevision: this.db.getNotificationRevision(),
      settings,
      activeEvent,
      racers,
      queue,
      racePace: measureRacePace({
        finishTimes: this.db.listRaceFinishTimes(activeEvent.id),
        defaultMinutesPerRace: settings.queueMinutesPerRace
      }),
      tournaments: tournamentBundles,
      tournamentQueue: activeTournament
        ? buildTournamentQueue({ bundle: activeTournament, currentRace })
        : [],
      tunnel: ctx.tunnel,
      os2l: ctx.os2l,
      photoBooth: ctx.photoBooth,
      paymentProvider: {
        stripe: ctx.stripe
      },
      runtimeEnv: ctx.runtimeEnv,
      subsystemHealth: assembleSubsystemHealth({
        tunnel: ctx.tunnel,
        os2l: ctx.os2l,
        os2lEnabled: settings.os2lEnabled,
        stripe: ctx.stripe,
        photoBooth: ctx.photoBooth,
        runtimeEnv: ctx.runtimeEnv,
        sensor: ctx.sensor
      }),
      sensorMonitor: ctx.sensorMonitor,
      themes,
      raceProjection: {
        race: currentRace,
        countdownSecondsRemaining,
        metricsByRacerId,
        winnerRacerId: currentRace?.winnerRacerId ?? null,
        nextQueueEntry,
        resultPresentation: ctx.resultPresentation,
        topRacers,
        theme: selectedTheme
      }
    };
  }

  /**
   * Project a full snapshot for a streaming surface. `admin` and `projector` receive the
   * full shape today; `racer` receives a public-safe payload with operator-only state, racers'
   * contact details, and live metrics stripped.
   */
  forSurface(snapshot: AppSnapshot, surface: SnapshotStreamSurface): AppSnapshot {
    if (surface !== "racer") {
      return snapshot;
    }

    const race = snapshot.raceProjection.race
      ? {
          ...snapshot.raceProjection.race,
          metrics: []
        }
      : null;

    return {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        raceDisplayTickerMessages: []
      },
      // `contact details` are operator-only (ADR-0024); no racer phone gets anyone's.
      racers: snapshot.racers.map((entry) => ({
        ...entry,
        racer: { ...entry.racer, realName: null, email: null, phone: null }
      })),
      raceProjection: {
        ...snapshot.raceProjection,
        race,
        metricsByRacerId: {},
        resultPresentation: null
      },
      themes: [],
      tunnel: {
        status: snapshot.tunnel.status,
        publicUrl: snapshot.tunnel.publicUrl ?? null
      },
      os2l: {
        enabled: snapshot.os2l.enabled,
        listening: false,
        advertising: false,
        port: snapshot.os2l.port,
        serviceName: snapshot.os2l.serviceName,
        armedRaceId: snapshot.os2l.armedRaceId,
        acceptedMessageCount: 0,
        ignoredMessageCount: 0,
        beatMessageCount: 0,
        lastBeatAt: null,
        lastRawMessage: null,
        lastRawMessageAt: null,
        lastAcceptedMessage: null,
        lastAcceptedAt: null,
        lastIgnoredMessage: null,
        lastIgnoredAt: null,
        lastIgnoredReason: null,
        lastError: null
      },
      photoBooth: {
        enabled: snapshot.photoBooth.enabled,
        boothId: snapshot.photoBooth.boothId,
        status: snapshot.photoBooth.status,
        lastSeenAt: null,
        lastCaptureAt: null,
        pendingUploadCount: 0,
        message: null
      },
      paymentProvider: {
        stripe: {
          configured: snapshot.paymentProvider.stripe.configured,
          hasSecretKey: false,
          hasWebhookSecret: false,
          hasExtraCaCertFile: false,
          publicRacerUrl: null,
          message: ""
        }
      },
      // Operator-only setup/diagnostics state never reaches racer phones.
      runtimeEnv: {
        path: "",
        exists: false,
        loadedFiles: [],
        managedSettings: []
      },
      subsystemHealth: [],
      sensorMonitor: null
    };
  }

  private buildRacerSummaries(
    eventId: string,
    results: RaceResults,
    allResults: RaceResults,
    eventBestRuns: TopRacersEntry[]
  ): RacerSummary[] {
    const racers = this.db.listEventRacers(eventId);
    const eventBestTimeByRacerId = new Map(
      eventBestRuns.map((run) => [run.racerId, run.finishTimeMs])
    );

    return racers.map((racer) => {
      const racerResults = results.filter((result) => result.racerId === racer.id);
      const eventResults = allResults.filter(
        (result) => result.racerId === racer.id && result.eventId === eventId
      );
      const careerResults = allResults.filter((result) => result.racerId === racer.id);
      const performance = summarizePerformance(racerResults);
      const eventPerformance = summarizePerformance(eventResults);
      const stats: RacerStats = {
        races: racerResults.length,
        wins: racerResults.filter((result) => result.placement === 1).length,
        eventRaces: eventResults.length,
        eventWins: eventResults.filter((result) => result.placement === 1).length,
        careerRaces: careerResults.length,
        careerEventCount: new Set(careerResults.map((result) => result.eventId)).size,
        bestFinishTimeMs: performance.bestFinishTimeMs,
        topSpeedKph: performance.topSpeedKph ?? 0,
        averageSpeedKph: performance.averageSpeedKph ?? 0,
        maxWattage: performance.maxWattage ?? 0,
        // Only a qualifying run counts, so this matches the racer's top racers board time.
        eventBestFinishTimeMs: eventBestTimeByRacerId.get(racer.id) ?? null,
        eventTopSpeedKph: eventPerformance.topSpeedKph,
        eventAverageSpeedKph: eventPerformance.averageSpeedKph,
        eventMaxWattage: eventPerformance.maxWattage
      };
      return {
        racer,
        stats,
        payment: this.db.getEventRacerPayment(eventId, racer.id)
      };
    });
  }
}
