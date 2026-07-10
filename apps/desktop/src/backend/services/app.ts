import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { nanoid } from "nanoid";
import type Stripe from "stripe";
import {
  COUNTDOWN_DURATION_MS,
  DEFAULT_OS2L_PORT,
  DEFAULT_SERVER_PORT
} from "@roller-rumble/shared/constants";
import type {
  BracketNode,
  AdminSettings,
  AdminNotificationInput,
  AppSnapshot,
  AccountlessRacerSessionInput,
  AdminTournamentByeFillResponse,
  AdminTournamentRacerRemovalInput,
  AdminTournamentRacerRemovalResponse,
  ChallengeReplacementOption,
  NotificationConfig,
  PhotoBoothAdminStatus,
  PhotoBoothSession,
  PhotoBoothStatus,
  PhotoBoothTokenResponse,
  RaceRecord,
  RaceResultPresentation,
  Racer,
  RacerAuthSuccessResponse,
  RacerQueueSignupInput,
  RacerQueueSignupResponse,
  RacerNotification,
  StripeConnectionTestResult,
  PasskeyRegistrationStartInput,
  PasskeyRegistrationStartResponse,
  PasskeySignInStartResponse,
  RoundRobinMatch,
  TournamentByeFillOptionsResponse,
  TournamentRacerRemovalOptionsResponse,
  TournamentBundle,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentPreset,
  TournamentOptOutResponse,
  TunnelDiagnostics,
  TunnelState,
  UpdateEventPaymentConfigInput,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import { nowIso } from "@roller-rumble/shared/utils";
import { AppDatabase, type StoredPaymentRecord } from "../db/Database";
import { ManualRaceTriggerAdapter } from "../adapters/trigger-manual";
import { Os2lRaceTriggerAdapter } from "../adapters/trigger-os2l";
import { SimulatorSensorAdapter } from "../adapters/sensor-simulator";
import { OpenSprintsSensorAdapter } from "../adapters/opensprints-sensor";
import { readSensorBoxCountdownMs, readSensorMode } from "../adapters/sensor-config";
import type { SensorAdapter, SensorLifecycleEvent, SensorStatus } from "../adapters/sensor";
import { ActiveRace, type FinalizedRaceResult } from "./active-race";
import {
  SnapshotAssembler,
  type SnapshotContext,
  type SnapshotStreamSurface
} from "./snapshot-assembler";
import { CloudflaredTunnelManager } from "./cloudflared";
import {
  advanceDoubleElimination,
  advanceSingleElimination,
  buildSeeds,
  computeRoundRobinStandings
} from "./competition";
import {
  addQueueSignup,
  ChallengeReplacementRequiredError,
  ChallengeTargetUnavailableError,
  findNextQueuedEntry,
  InvalidChallengeReplacementError,
  projectQueueEntries,
  reindexQueue,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "./queue";
import {
  canAutomaticallyReplaceTournamentRacer,
  canFillBracketByeSlot,
  fillBracketByeSlot,
  getTournamentParticipantIds,
  getTournamentRacerIdsWithIncompleteMatches,
  getTournamentUnavailableReplacementRacerIds,
  optOutTournamentRacer,
  undoBracketNodeResult,
  undoGroupMatchResult,
  TournamentService
} from "./tournaments";
import {
  createSignedPhotoBoothToken,
  PHOTO_BOOTH_TOKEN_TTL_MS,
  verifySignedPhotoBoothToken,
  type PhotoBoothTokenPayload
} from "./photo-booth";
import { getLocalNetworkBaseUrl } from "./network";
import { getThirdUpcomingQueueEntry, getTournamentNotificationRacerIds } from "./notifications";
import { AppHttpError } from "./http-error";
import {
  applyManagedEnvValue,
  getRuntimeEnvInfo,
  reloadDotenvFiles,
  writeManagedEnvValue
} from "../env";
import { getManagedSetting, SECRET_ENV_KEYS } from "@roller-rumble/shared/managed-settings";
import { assembleDiagnosticsBundle, type DiagnosticsBundle } from "./diagnostics-bundle";
import { runTunnelHealthChecks } from "./tunnel-health-checks";
import { AuthService, type PasskeyRequestContext } from "./auth";
import { PaymentService } from "./payment";
import { NotificationService } from "./notifications-service";

export { AppHttpError } from "./http-error";

const RESULT_MODAL_DURATION_MS = 15000;

interface AppServiceOptions {
  dataDir: string;
  serverPort?: number;
  runtimeEnvFilePath?: string;
  loadedDotenvFiles?: string[];
  dotenvSearchDirs?: string[];
  appVersion?: string;
  getLogLines?: () => string[];
  logFilePath?: string;
}

interface PhotoBoothPairing {
  boothId: string;
  pairingSecret: string;
  createdAt: string;
  updatedAt: string;
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

function buildPublicUploadUrl(uploadsDir: string, filePath: string): string {
  const relativePath = path.relative(uploadsDir, filePath).split(path.sep).join("/");
  return `/uploads/${relativePath}`;
}

function getSafeImageExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

function moveFile(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "EXDEV") {
      throw error;
    }

    fs.copyFileSync(sourcePath, destinationPath);
    fs.unlinkSync(sourcePath);
  }
}

/**
 * Pick the sensor adapter from the managed `sensorMode` setting. The choice is made once at
 * construction (it reads the env that dotenv has already loaded), so switching sensors takes effect
 * on the next launch — the same restart contract as the other hardware-affecting managed settings.
 */
function createSensorAdapter(): SensorAdapter {
  const mode = readSensorMode();
  // Logged so diagnostics show whether the app is even in hardware mode — a common gotcha is the
  // runtime env resolving ROLLER_RUMBLE_SENSOR_MODE to something other than "opensprints".
  console.info(
    `[sensor] adapter mode = ${mode} (ROLLER_RUMBLE_SENSOR_MODE=${process.env.ROLLER_RUMBLE_SENSOR_MODE ?? "unset"}).`
  );
  return mode === "opensprints" ? new OpenSprintsSensorAdapter() : new SimulatorSensorAdapter();
}

export class RollerRumbleApp extends EventEmitter {
  readonly dataDir: string;
  readonly uploadsDir: string;
  readonly db: AppDatabase;

  // Set once close() runs so late async callbacks (e.g. an in-flight sensor probe resolving after
  // shutdown) don't emit a snapshot that queries the now-closed database.
  private closed = false;
  private readonly sensorAdapter: SensorAdapter = createSensorAdapter();
  private readonly manualTrigger = new ManualRaceTriggerAdapter();
  // Debug sessions sometimes need a second app instance; allowing the OS2L port to move keeps
  // the duplicate instance isolated without affecting the normal production default.
  private readonly os2lTrigger = new Os2lRaceTriggerAdapter(
    Number(process.env.ROLLER_RUMBLE_OS2L_PORT ?? DEFAULT_OS2L_PORT)
  );
  private readonly tunnelManager: CloudflaredTunnelManager;
  private readonly snapshots: SnapshotAssembler;
  private readonly auth: AuthService;
  private readonly payment: PaymentService;
  private readonly notifications: NotificationService;
  private readonly tournaments = new TournamentService();
  private countdownTicker: NodeJS.Timeout | null = null;
  private countdownStartTimer: NodeJS.Timeout | null = null;
  // The delayed-GO (pre-roll) timer for a box that runs its own silent countdown: the app holds the
  // box's `g` command until the tail of the app-owned countdown so the box's silence lands at zero
  // (ADR 0010). Torn down alongside countdownStartTimer on every countdown-exit path.
  private armGoTimer: NodeJS.Timeout | null = null;
  private countdownRuntime: { raceId: string; durationMs: number } | null = null;
  // Set while a hardware-driven countdown is in flight, so a box abort while arming is matched to
  // the race that is counting down (and stray box chatter outside a countdown is ignored).
  private hardwareCountdownRaceId: string | null = null;
  private currentActiveRace: ActiveRace | null = null;
  private resultPresentation: RaceResultPresentation | null = null;
  private resultPresentationTimer: NodeJS.Timeout | null = null;
  private autoStagePausedUntilManualStage = false;
  private serverPort: number;
  private readonly runtimeEnvFilePath: string | null;
  private loadedDotenvFiles: string[];
  private readonly dotenvSearchDirs: string[];
  private readonly appVersion: string;
  private readonly getLogLines: () => string[];
  private readonly logFilePath: string | null;

  constructor(options: AppServiceOptions) {
    super();
    this.dataDir = options.dataDir;
    this.uploadsDir = path.join(options.dataDir, "uploads");
    this.serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
    this.runtimeEnvFilePath = options.runtimeEnvFilePath ?? null;
    this.loadedDotenvFiles = options.loadedDotenvFiles ?? [];
    this.dotenvSearchDirs = options.dotenvSearchDirs ?? [];
    this.appVersion = options.appVersion ?? "unknown";
    this.getLogLines = options.getLogLines ?? (() => []);
    this.logFilePath = options.logFilePath ?? null;
    this.db = new AppDatabase(options.dataDir);
    this.snapshots = new SnapshotAssembler(this.db);
    this.auth = new AuthService(this.db);
    this.payment = new PaymentService(this.db);
    this.notifications = new NotificationService(this.db, () => this.emitSnapshot());
    this.tunnelManager = new CloudflaredTunnelManager({ dataDir: options.dataDir });
  }

  async init(): Promise<void> {
    this.db.init();
    const settings = this.db.getAdminSettings();
    this.serverPort = settings.serverPort;
    this.manualTrigger.start((source, options) => this.startCountdown(source, options));
    this.os2lTrigger.onDiagnosticsChange(() => this.emitSnapshot());
    this.os2lTrigger.start((source, options) => this.startCountdown(source, options));
    this.os2lTrigger.setEnabled(settings.os2lEnabled);
    void this.sensorAdapter.connect((event) => {
      this.currentActiveRace?.tick(event.racerId, event.timestampMs, event.deltaRotations);
      this.emitSnapshot();
    });
    this.sensorAdapter.onLifecycle?.((event) => this.handleSensorLifecycle(event));
    this.sensorAdapter.onStatusChange?.((status) => this.handleSensorStatusChange(status));
    if (!this.maybeAutoStageNextRace()) {
      this.syncOs2lArmingForCurrentRace(settings);
      this.emitSnapshot();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    void this.sensorAdapter.disconnect();
    this.manualTrigger.stop();
    this.os2lTrigger.stop();
    this.tunnelManager.stop();
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
      this.countdownTicker = null;
    }
    this.clearCountdownStartTimer();
    this.hardwareCountdownRaceId = null;
    this.currentActiveRace?.dispose();
    if (this.resultPresentationTimer) {
      clearTimeout(this.resultPresentationTimer);
      this.resultPresentationTimer = null;
    }
    this.db.close();
  }

  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void {
    this.on("snapshot", listener);
    return () => this.off("snapshot", listener);
  }

  private emitSnapshot(): void {
    // After close() the database is gone; a straggling async callback must not try to build a
    // snapshot from it (that surfaced as an "database connection is not open" crash on shutdown).
    if (this.closed) {
      return;
    }
    this.emit("snapshot", this.getSnapshot());
  }

  private clearCountdownStartTimer(): void {
    if (this.countdownStartTimer) {
      clearTimeout(this.countdownStartTimer);
      this.countdownStartTimer = null;
    }
    if (this.armGoTimer) {
      clearTimeout(this.armGoTimer);
      this.armGoTimer = null;
    }
  }

  private getCountdownDurationMs(raceId: string): number {
    return this.countdownRuntime?.raceId === raceId
      ? this.countdownRuntime.durationMs
      : COUNTDOWN_DURATION_MS;
  }

  getNotificationConfig(): NotificationConfig {
    return this.notifications.getNotificationConfig();
  }

  async testStripeConnection(): Promise<StripeConnectionTestResult> {
    return this.payment.testStripeConnection();
  }

  saveRacerPushSubscription(
    racerId: string,
    subscription: WebPushSubscriptionInput,
    userAgent?: string | null
  ): NotificationConfig {
    return this.notifications.saveRacerPushSubscription(racerId, subscription, userAgent);
  }

  revokeRacerPushSubscription(
    racerId: string,
    subscription: WebPushSubscriptionInput
  ): NotificationConfig {
    return this.notifications.revokeRacerPushSubscription(racerId, subscription);
  }

  listRacerNotifications(racerId: string): RacerNotification[] {
    return this.notifications.listRacerNotifications(racerId);
  }

  markRacerNotificationRead(racerId: string, notificationId: string): RacerNotification[] {
    return this.notifications.markRacerNotificationRead(racerId, notificationId);
  }

  private runQueueNotificationTriggers(eventId: string): void {
    const thirdEntry = getThirdUpcomingQueueEntry(reindexQueue(this.db.listQueueEntries(eventId)));
    if (!thirdEntry) {
      return;
    }

    for (const racerId of thirdEntry.racerIds) {
      const racerName = this.db.getRacer(racerId)?.displayName ?? "Racer";
      this.notifications.createNotificationAndDispatch({
        eventId,
        type: "queue_get_ready",
        title: "Head towards the bikes",
        body: `${racerName}, only ~4 minutes before you race!`,
        url: "/racer",
        triggerKey: `queue-get-ready:${eventId}:${thirdEntry.id}:${racerId}`,
        racerIds: [racerId]
      });
    }
  }

  private notifyTournamentStarted(bundle: TournamentBundle): void {
    for (const racerId of getTournamentNotificationRacerIds(bundle)) {
      const racerName = this.db.getRacer(racerId)?.displayName ?? "Racer";
      this.notifications.createNotificationAndDispatch({
        eventId: bundle.tournament.eventId,
        type: "tournament_started",
        title: "Tournament started",
        body: `${racerName}, you made the tournament!`,
        url: "/racer",
        triggerKey: `tournament-started:${bundle.tournament.id}:${racerId}`,
        racerIds: [racerId]
      });
    }
  }

  private resolveAdminNotificationTargets(input: AdminNotificationInput): string[] {
    const activeEvent = this.db.getActiveEvent()!;
    switch (input.targetType) {
      case "event":
        return this.db.listEventRacers(activeEvent.id).map((racer) => racer.id);
      case "queued":
        return [
          ...new Set(
            this.db
              .listQueueEntries(activeEvent.id)
              .filter((entry) => ["queued", "staging", "racing"].includes(entry.status))
              .flatMap((entry) => entry.racerIds)
          )
        ];
      case "tournament": {
        const activeTournament = this.getActiveTournamentBundle(activeEvent.id);
        return activeTournament ? getTournamentNotificationRacerIds(activeTournament) : [];
      }
      case "selected":
        return [...new Set(input.racerIds ?? [])];
      default:
        return [];
    }
  }

  sendAdminNotification(input: AdminNotificationInput): {
    snapshot: AppSnapshot;
    targetCount: number;
  } {
    const activeEvent = this.db.getActiveEvent()!;
    const targetRacerIds = this.resolveAdminNotificationTargets(input);
    if (targetRacerIds.length === 0) {
      throw new AppHttpError(
        "Choose at least one racer to notify.",
        400,
        "no_notification_targets"
      );
    }

    const targetCount = this.notifications.createNotificationAndDispatch({
      eventId: activeEvent.id,
      type: input.type ?? "admin_message",
      title: input.title,
      body: input.body,
      url: input.url ?? "/racer",
      createdBy: "admin",
      racerIds: targetRacerIds
    });
    this.emitSnapshot();
    return {
      snapshot: this.getSnapshot(),
      targetCount
    };
  }

  getSnapshot(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    // Reconcile is a DB write shared with non-snapshot call sites, so it stays here as a
    // pre-step; the assembler itself is a pure read.
    this.reconcileQueueRaceStatuses(activeEvent.id);
    return this.snapshots.assemble(this.snapshotContext());
  }

  /**
   * Project a full snapshot for a streaming surface. Re-exposed from the assembler so the
   * server depends only on the service, not on the snapshot module.
   */
  snapshotForSurface(snapshot: AppSnapshot, surface: SnapshotStreamSurface): AppSnapshot {
    return this.snapshots.forSurface(snapshot, surface);
  }

  private snapshotContext(): SnapshotContext {
    return {
      resultPresentation: this.resultPresentation,
      tunnel: this.tunnelManager.getState(),
      os2l: this.os2lTrigger.getDiagnostics(),
      photoBooth: this.getPhotoBoothStatus(),
      stripe: this.payment.getStripeSetupStatus(),
      sensor: this.getSensorStatus(),
      runtimeEnv: getRuntimeEnvInfo(this.runtimeEnvFilePath ?? "", this.loadedDotenvFiles),
      countdownDurationMsFor: (raceId) => this.getCountdownDurationMs(raceId)
    };
  }

  private showRaceResultPresentation(race: RaceRecord, winnerRacerId: string | null): void {
    if (!winnerRacerId) {
      return;
    }

    if (this.resultPresentationTimer) {
      clearTimeout(this.resultPresentationTimer);
    }

    this.resultPresentation = {
      race,
      winnerRacerId,
      expiresAt: new Date(Date.now() + RESULT_MODAL_DURATION_MS).toISOString()
    };
    this.resultPresentationTimer = setTimeout(() => {
      if (this.resultPresentation?.race.id !== race.id) {
        return;
      }
      this.clearRaceResultPresentation();
    }, RESULT_MODAL_DURATION_MS);
  }

  private clearRaceResultPresentation(): void {
    if (this.resultPresentationTimer) {
      clearTimeout(this.resultPresentationTimer);
      this.resultPresentationTimer = null;
    }
    if (!this.resultPresentation) {
      return;
    }
    const completedRace = this.resultPresentation.race;
    if (completedRace.queueEntryId) {
      this.db.markQueueEntryStatus(completedRace.queueEntryId, "completed");
    }
    this.reconcileQueueRaceStatuses(completedRace.eventId);
    this.resultPresentation = null;
    // Auto-stage waits until the audience result beat is finished so the projector and admin
    // workflow both move forward at the same deliberate moment.
    if (!this.maybeAutoStageNextRace()) {
      this.runQueueNotificationTriggers(completedRace.eventId);
      this.emitSnapshot();
    }
  }

  dismissRaceResultPresentation(): AppSnapshot {
    this.clearRaceResultPresentation();
    return this.getSnapshot();
  }

  private getActiveTournamentBundle(eventId: string): TournamentBundle | null {
    return (
      this.db
        .listTournamentBundles(eventId)
        .find((bundle) => bundle.tournament.status === "active") ?? null
    );
  }

  private findTournamentReplacementSeeds(bundle: TournamentBundle, removedRacerId: string) {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const results = settings.includeAllRaceData
      ? this.db.listResults()
      : this.db.listResults(activeEvent.id);
    const participantIds = new Set(getTournamentParticipantIds(bundle));
    const unavailableIds = new Set([
      ...getTournamentUnavailableReplacementRacerIds(bundle),
      removedRacerId
    ]);

    return buildSeeds(this.db.listEventRacers(activeEvent.id), results).filter(
      (seed) => !participantIds.has(seed.racerId) && !unavailableIds.has(seed.racerId)
    );
  }

  private findNextTournamentReplacementSeed(bundle: TournamentBundle, removedRacerId: string) {
    return this.findTournamentReplacementSeeds(bundle, removedRacerId)[0] ?? null;
  }

  private assertNoEditableTournamentRaceInProgress(tournamentId: string): void {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (currentRace?.tournamentId !== tournamentId) {
      return;
    }

    throw new AppHttpError(
      "Finish or unstage the current tournament race before editing tournament slots.",
      409,
      "tournament_race_in_progress"
    );
  }

  private cancelStagedTournamentRaceForOptOut(bundle: TournamentBundle, racerId: string): void {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (currentRace?.tournamentId !== bundle.tournament.id) {
      return;
    }

    const includesOptingOutRacer = currentRace.participants.some(
      (participant) => participant.racerId === racerId
    );
    if (!includesOptingOutRacer) {
      return;
    }

    if (!["scheduled", "staging"].includes(currentRace.state)) {
      throw new AppHttpError(
        "You cannot opt out while your tournament race is already starting or active.",
        409,
        "tournament_race_in_progress"
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
    this.os2lTrigger.disarmRace();
  }

  optOutOfActiveTournament(racerId: string): TournamentOptOutResponse {
    const activeEvent = this.db.getActiveEvent()!;
    const bundle = this.getActiveTournamentBundle(activeEvent.id);
    if (!bundle) {
      throw new AppHttpError("There is no active tournament to opt out of.", 404, "no_tournament");
    }

    if (!bundle.seeds.some((seed) => seed.racerId === racerId)) {
      throw new AppHttpError(
        "You are not currently seeded in the active tournament.",
        409,
        "not_in_tournament"
      );
    }

    const canUseReplacement = canAutomaticallyReplaceTournamentRacer(bundle, racerId);
    const replacementSeed = canUseReplacement
      ? this.findNextTournamentReplacementSeed(bundle, racerId)
      : null;

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: racerId,
      replacementSeed
    });
    if (!result) {
      throw new AppHttpError(
        "Could not find a remaining tournament slot to opt you out of.",
        409,
        "tournament_opt_out_unavailable"
      );
    }

    this.cancelStagedTournamentRaceForOptOut(bundle, racerId);
    const finalizedBundle = this.markTournamentCompleteIfFinished(result.bundle);
    this.db.saveTournamentBundle(finalizedBundle);
    if (finalizedBundle.tournament.status === "complete") {
      this.db.updateAdminSettings({
        mode: "open-time-trial"
      });
    }
    this.emitSnapshot();
    const replacementRacer = replacementSeed ? this.db.getRacer(replacementSeed.racerId) : null;
    const replacementName = replacementSeed
      ? (replacementRacer?.displayName ?? replacementSeed.label)
      : null;

    return {
      snapshot: this.getSnapshot(),
      tournamentId: bundle.tournament.id,
      optedOutRacerId: racerId,
      replacementType: result.replacementType,
      replacementRacerId:
        result.replacementType === "racer" ? (replacementSeed?.racerId ?? null) : null,
      replacementRacerName: result.replacementType === "racer" ? replacementName : null,
      message:
        result.replacedIn === "none"
          ? `You were removed from ${bundle.tournament.name}. Completed results were preserved.`
          : replacementName && result.replacementType === "racer"
            ? `${replacementName} replaced you in ${bundle.tournament.name}.`
            : `Your spot in ${bundle.tournament.name} was replaced with a BYE.`
    };
  }

  getTournamentRacerRemovalOptions(
    tournamentId: string,
    racerId: string
  ): TournamentRacerRemovalOptionsResponse {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (!bundle?.seeds.some((seed) => seed.racerId === racerId)) {
      throw new AppHttpError(
        "That racer is not currently seeded in this tournament.",
        404,
        "not_in_tournament"
      );
    }
    if (!getTournamentRacerIdsWithIncompleteMatches(bundle).includes(racerId)) {
      throw new AppHttpError(
        "That racer has no remaining tournament matches to complete.",
        409,
        "no_remaining_tournament_matches"
      );
    }

    return {
      tournamentId,
      racerId,
      canAutomaticallyReplace: canAutomaticallyReplaceTournamentRacer(bundle, racerId),
      candidates: this.findTournamentReplacementSeeds(bundle, racerId).map((seed) => ({
        racerId: seed.racerId,
        label: seed.label,
        score: seed.score,
        seed: seed.seed
      }))
    };
  }

  removeRacerFromTournament(
    tournamentId: string,
    racerId: string,
    input: AdminTournamentRacerRemovalInput
  ): AdminTournamentRacerRemovalResponse {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (!bundle?.seeds.some((seed) => seed.racerId === racerId)) {
      throw new AppHttpError(
        "That racer is not currently seeded in this tournament.",
        404,
        "not_in_tournament"
      );
    }
    if (!getTournamentRacerIdsWithIncompleteMatches(bundle).includes(racerId)) {
      throw new AppHttpError(
        "That racer has no remaining tournament matches to complete.",
        409,
        "no_remaining_tournament_matches"
      );
    }

    const candidates = this.findTournamentReplacementSeeds(bundle, racerId);
    const canUseAutomaticReplacement = canAutomaticallyReplaceTournamentRacer(bundle, racerId);
    const replacementSeed = (() => {
      if (input.replacementMode === "auto") {
        if (!canUseAutomaticReplacement) {
          throw new AppHttpError(
            "Choose a replacement racer or BYE before removing this racer.",
            409,
            "replacement_choice_required"
          );
        }
        return candidates[0] ?? null;
      }

      if (input.replacementMode === "bye") {
        return null;
      }

      const candidate = candidates.find((seed) => seed.racerId === input.replacementRacerId);
      if (!candidate) {
        throw new AppHttpError(
          "Choose an eligible replacement racer.",
          400,
          "invalid_replacement_racer"
        );
      }
      return candidate;
    })();

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: racerId,
      removalReason: "admin-removed",
      replacementSeed
    });
    if (!result) {
      throw new AppHttpError(
        "Could not remove that racer from the tournament.",
        409,
        "tournament_removal_unavailable"
      );
    }

    this.cancelStagedTournamentRaceForOptOut(bundle, racerId);
    const finalizedBundle = this.markTournamentCompleteIfFinished(result.bundle);
    this.db.saveTournamentBundle(finalizedBundle);
    if (finalizedBundle.tournament.status === "complete") {
      this.db.updateAdminSettings({
        mode: "open-time-trial"
      });
    }
    this.emitSnapshot();

    const replacementRacer = replacementSeed ? this.db.getRacer(replacementSeed.racerId) : null;
    const replacementName = replacementSeed
      ? (replacementRacer?.displayName ?? replacementSeed.label)
      : null;
    const removedRacer = this.db.getRacer(racerId);
    const removedName = removedRacer?.displayName ?? "Racer";

    return {
      snapshot: this.getSnapshot(),
      tournamentId,
      removedRacerId: racerId,
      replacementType: result.replacementType,
      replacementRacerId:
        result.replacementType === "racer" ? (replacementSeed?.racerId ?? null) : null,
      replacementRacerName: result.replacementType === "racer" ? replacementName : null,
      message:
        result.replacedIn === "none"
          ? `${removedName} was removed from the tournament. Completed results were preserved.`
          : replacementName && result.replacementType === "racer"
            ? `${removedName} was removed and ${replacementName} took their tournament slot.`
            : `${removedName} was removed and their future slot became a BYE.`
    };
  }

  getTournamentByeFillOptions(
    tournamentId: string,
    nodeId: string
  ): TournamentByeFillOptionsResponse {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (!bundle || !canFillBracketByeSlot(bundle, nodeId)) {
      throw new AppHttpError("That BYE slot can no longer be filled.", 409, "bye_slot_locked");
    }

    return {
      tournamentId,
      nodeId,
      candidates: this.findTournamentReplacementSeeds(bundle, "").map((seed) => ({
        racerId: seed.racerId,
        label: seed.label,
        score: seed.score,
        seed: seed.seed
      }))
    };
  }

  fillTournamentByeSlot(
    tournamentId: string,
    nodeId: string,
    replacementRacerId: string
  ): AdminTournamentByeFillResponse {
    const bundle = this.db.getTournamentBundle(tournamentId);
    if (!bundle || !canFillBracketByeSlot(bundle, nodeId)) {
      throw new AppHttpError("That BYE slot can no longer be filled.", 409, "bye_slot_locked");
    }

    this.assertNoEditableTournamentRaceInProgress(tournamentId);
    const replacementSeed = this.findTournamentReplacementSeeds(bundle, "").find(
      (seed) => seed.racerId === replacementRacerId
    );
    if (!replacementSeed) {
      throw new AppHttpError(
        "Choose an eligible racer for this BYE slot.",
        400,
        "invalid_replacement_racer"
      );
    }

    const nextBundle = fillBracketByeSlot({
      bundle,
      nodeId,
      replacementSeed
    });
    if (!nextBundle) {
      throw new AppHttpError("That BYE slot can no longer be filled.", 409, "bye_slot_locked");
    }

    this.db.saveTournamentBundle(nextBundle);
    this.db.updateAdminSettings({
      mode: nextBundle.tournament.preset
    });
    this.emitSnapshot();
    const replacementRacer = this.db.getRacer(replacementSeed.racerId);
    const replacementName = replacementRacer?.displayName ?? replacementSeed.label;

    return {
      snapshot: this.getSnapshot(),
      tournamentId,
      nodeId,
      replacementRacerId: replacementSeed.racerId,
      replacementRacerName: replacementName,
      message: `${replacementName} was added to the BYE slot. The match can now be staged.`
    };
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
    return getLocalNetworkBaseUrl(this.serverPort);
  }

  async getQrCodeDataUrl(): Promise<string> {
    return QRCode.toDataURL(this.getRacerPageUrl(), {
      margin: 1,
      width: 220
    });
  }

  getRacerPageUrl(): string {
    const tunnel = this.tunnelManager.getState();
    const activeEvent = this.db.getActiveEvent();
    const baseUrl = tunnel.publicUrl ?? `${this.getLocalBaseUrl()}/racer`;
    const url = new URL(baseUrl);

    if (!url.pathname.endsWith("/racer")) {
      url.pathname = "/racer";
    }

    if (activeEvent) {
      url.searchParams.set("eventId", activeEvent.id);
    }
    url.searchParams.set("source", "projector");

    return url.toString();
  }

  private getPhotoBoothPairing(): PhotoBoothPairing {
    const existing = this.db.getSetting<PhotoBoothPairing | null>("photoBoothPairing", null).value;
    if (existing) {
      return existing;
    }

    const timestamp = nowIso();
    const pairing: PhotoBoothPairing = {
      boothId: `booth-${nanoid(8)}`,
      pairingSecret: nanoid(48),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.db.setSetting("photoBoothPairing", pairing);
    return pairing;
  }

  getPhotoBoothStatus(): PhotoBoothStatus {
    const pairing = this.getPhotoBoothPairing();
    const stored = this.db.getSetting<Partial<PhotoBoothStatus>>("photoBoothStatus", {}).value;

    return {
      boothId: pairing.boothId,
      status: stored.status ?? "idle",
      lastSeenAt: stored.lastSeenAt ?? null,
      lastCaptureAt: stored.lastCaptureAt ?? null,
      pendingUploadCount: stored.pendingUploadCount ?? 0,
      message: stored.message ?? null,
      hardware: stored.hardware ?? {}
    };
  }

  async getPhotoBoothAdminStatus(): Promise<PhotoBoothAdminStatus> {
    const pairing = this.getPhotoBoothPairing();
    const payload = {
      type: "roller-rumble.photo-booth.pairing",
      version: 1,
      serverBaseUrl: this.getLocalBaseUrl(),
      boothId: pairing.boothId,
      pairingSecret: pairing.pairingSecret
    };

    return {
      status: this.getPhotoBoothStatus(),
      serverBaseUrl: this.getLocalBaseUrl(),
      pairingSecret: pairing.pairingSecret,
      pairingQrCodeDataUrl: await QRCode.toDataURL(JSON.stringify(payload), {
        margin: 1,
        width: 220
      })
    };
  }

  async rotatePhotoBoothPairing(): Promise<PhotoBoothAdminStatus> {
    const timestamp = nowIso();
    this.db.setSetting<PhotoBoothPairing>("photoBoothPairing", {
      boothId: `booth-${nanoid(8)}`,
      pairingSecret: nanoid(48),
      createdAt: timestamp,
      updatedAt: timestamp
    });
    this.db.setSetting<Partial<PhotoBoothStatus>>("photoBoothStatus", {
      status: "idle",
      pendingUploadCount: 0,
      message: "Photo booth pairing was rotated. Re-pair the Raspberry Pi booth."
    });
    this.emitSnapshot();
    return this.getPhotoBoothAdminStatus();
  }

  assertPhotoBoothSecret(boothId: string, pairingSecret: string | undefined): void {
    const pairing = this.getPhotoBoothPairing();
    if (boothId !== pairing.boothId || pairingSecret !== pairing.pairingSecret) {
      throw new Error("Invalid photo booth pairing.");
    }
  }

  updatePhotoBoothStatus(input: {
    boothId: string;
    status: PhotoBoothStatus["status"];
    pendingUploadCount?: number;
    lastCaptureAt?: string | null;
    message?: string | null;
    hardware?: PhotoBoothStatus["hardware"];
  }): PhotoBoothStatus {
    const current = this.getPhotoBoothStatus();
    const next: PhotoBoothStatus = {
      boothId: input.boothId,
      status: input.status,
      lastSeenAt: nowIso(),
      lastCaptureAt: input.lastCaptureAt ?? current.lastCaptureAt,
      pendingUploadCount: input.pendingUploadCount ?? current.pendingUploadCount,
      message: input.message ?? null,
      hardware: input.hardware ?? current.hardware ?? {}
    };
    this.db.setSetting("photoBoothStatus", next);
    this.emitSnapshot();
    return next;
  }

  async createPhotoBoothToken(racerId: string): Promise<PhotoBoothTokenResponse> {
    const activeEvent = this.db.getActiveEvent()!;
    const racer = this.db.getRacer(racerId);
    if (!racer) {
      throw new Error("Cannot create a photo booth QR for an unknown racer.");
    }

    this.db.ensureEventRegistration(activeEvent.id, racer.id);
    const issuedAtMs = Date.now();
    const payload: PhotoBoothTokenPayload = {
      version: 1,
      purpose: "photo-booth-avatar",
      eventId: activeEvent.id,
      eventName: activeEvent.name,
      racerId: racer.id,
      racerName: racer.displayName,
      racerAvatarUrl: racer.avatarUrl ?? null,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + PHOTO_BOOTH_TOKEN_TTL_MS).toISOString(),
      nonce: nanoid()
    };
    const token = createSignedPhotoBoothToken(payload, this.getPhotoBoothPairing().pairingSecret);
    const qrPayload = JSON.stringify({
      type: "roller-rumble.photo-booth.token",
      version: 1,
      token
    });

    return {
      token,
      expiresAt: payload.expiresAt,
      qrPayload,
      qrCodeDataUrl: await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 260
      }),
      racer: {
        id: racer.id,
        displayName: racer.displayName,
        avatarUrl: racer.avatarUrl ?? null
      },
      event: {
        id: activeEvent.id,
        name: activeEvent.name
      }
    };
  }

  resolvePhotoBoothSession(input: { token: string; boothId?: string }): PhotoBoothSession {
    const payload = verifySignedPhotoBoothToken(
      input.token,
      this.getPhotoBoothPairing().pairingSecret
    );

    if (input.boothId) {
      this.updatePhotoBoothStatus({
        boothId: input.boothId,
        status: "online",
        message: `Ready for ${payload.racerName}`
      });
    }

    return {
      eventId: payload.eventId,
      eventName: payload.eventName,
      racerId: payload.racerId,
      racerName: payload.racerName,
      racerAvatarUrl: payload.racerAvatarUrl ?? null,
      expiresAt: payload.expiresAt
    };
  }

  acceptPhotoBoothAvatarOriginal(input: {
    boothId: string;
    token: string;
    capturedAt: string;
    originalTempPath: string;
    originalFileName: string;
  }): AppSnapshot {
    const capturedAtMs = new Date(input.capturedAt).getTime();
    if (!Number.isFinite(capturedAtMs)) {
      throw new Error("Photo booth capture is missing a valid capture timestamp.");
    }

    const payload = verifySignedPhotoBoothToken(
      input.token,
      this.getPhotoBoothPairing().pairingSecret,
      capturedAtMs
    );
    const racer = this.db.getRacer(payload.racerId);
    if (!racer) {
      throw new Error("Cannot attach a photo booth capture to an unknown racer.");
    }

    const captureId = nanoid();
    const extension = getSafeImageExtension(input.originalFileName);
    const originalPath = path.join(
      this.uploadsDir,
      "avatar-originals",
      payload.eventId,
      payload.racerId,
      `${captureId}${extension}`
    );
    const avatarPath = path.join(
      this.uploadsDir,
      "avatars",
      payload.eventId,
      payload.racerId,
      `${captureId}${extension}`
    );

    moveFile(input.originalTempPath, originalPath);
    fs.mkdirSync(path.dirname(avatarPath), { recursive: true });
    // This derivative boundary lets the UI use a stable avatar asset while preserving the DSLR
    // original separately. A crop/resize processor can replace this copy without changing APIs.
    fs.copyFileSync(originalPath, avatarPath);

    const uploadedAt = nowIso();
    const avatarUrl = buildPublicUploadUrl(this.uploadsDir, avatarPath);
    this.db.createBoothCapture({
      id: captureId,
      eventId: payload.eventId,
      racerId: payload.racerId,
      boothId: input.boothId,
      originalUrl: buildPublicUploadUrl(this.uploadsDir, originalPath),
      avatarUrl,
      capturedAt: input.capturedAt,
      uploadedAt
    });
    this.db.updateRacerAvatar(payload.racerId, avatarUrl);
    this.db.setSetting<PhotoBoothStatus>("photoBoothStatus", {
      ...this.getPhotoBoothStatus(),
      boothId: input.boothId,
      status: "online",
      lastSeenAt: uploadedAt,
      lastCaptureAt: input.capturedAt,
      pendingUploadCount: 0,
      message: `Accepted avatar for ${payload.racerName}`
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  getPasskeyRequestContext(origin: string): PasskeyRequestContext {
    return this.auth.getPasskeyRequestContext(origin);
  }

  createRacerSessionToken(racerId: string): string {
    return this.auth.createRacerSessionToken(racerId);
  }

  getRacerFromSessionToken(token?: string | null): Racer | null {
    return this.auth.getRacerFromSessionToken(token);
  }

  getRacerAuthSession(token?: string | null): Racer | null {
    return this.auth.getRacerAuthSession(token);
  }

  startPasskeySignIn(
    emailInput: string,
    context: PasskeyRequestContext
  ): Promise<PasskeySignInStartResponse> {
    return this.auth.startPasskeySignIn(emailInput, context);
  }

  async finishPasskeySignIn(
    challengeId: string,
    response: unknown
  ): Promise<RacerAuthSuccessResponse> {
    const racer = await this.auth.finishPasskeySignIn(challengeId, response);
    this.emitSnapshot();
    return {
      racer,
      snapshot: this.getSnapshot()
    };
  }

  startPasskeyRegistration(
    input: PasskeyRegistrationStartInput,
    context: PasskeyRequestContext,
    sessionRacerId?: string | null
  ): Promise<PasskeyRegistrationStartResponse> {
    return this.auth.startPasskeyRegistration(input, context, sessionRacerId);
  }

  async finishPasskeyRegistration(
    challengeId: string,
    response: unknown
  ): Promise<RacerAuthSuccessResponse> {
    const racer = await this.auth.finishPasskeyRegistration(challengeId, response);
    this.emitSnapshot();
    return {
      racer,
      snapshot: this.getSnapshot()
    };
  }

  createAccountlessRacerSession(input: AccountlessRacerSessionInput): RacerAuthSuccessResponse {
    const settings = this.db.getAdminSettings();
    if (!settings.allowAccountlessRacerSignup) {
      throw new AppHttpError(
        "Accountless registration is currently disabled. Please sign in with an email.",
        403,
        "accountless_disabled"
      );
    }

    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new AppHttpError("Enter a display name to continue.", 400, "display_name_required");
    }

    const racer = this.registerRacerRecord({
      displayName,
      accountlessId: input.accountlessId
    });
    return {
      racer,
      snapshot: this.getSnapshot()
    };
  }

  createEvent(name: string): AppSnapshot {
    this.db.createEvent(name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  updateActiveEvent(input: {
    name?: string;
    description?: string | null;
    signupEyebrow?: string | null;
    signupHeading?: string | null;
  }): AppSnapshot {
    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.updateEvent(activeEvent.id, input);
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  updateActiveEventPaymentConfig(input: UpdateEventPaymentConfigInput): AppSnapshot {
    this.payment.updateActiveEventPaymentConfig(input);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  registerRacer(input: {
    displayName: string;
    email?: string;
    phone?: string;
    accountlessId?: string;
  }): AppSnapshot {
    this.registerRacerRecord(input);
    return this.getSnapshot();
  }

  registerRacerRecord(input: {
    displayName: string;
    email?: string;
    phone?: string;
    accountlessId?: string;
  }): Racer {
    if (input.accountlessId && !this.db.getAdminSettings().allowAccountlessRacerSignup) {
      throw new AppHttpError(
        "Accountless registration is currently disabled. Please sign in with an email.",
        403,
        "accountless_disabled"
      );
    }
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
    this.syncOs2lArmingForCurrentRace(next);
    if (patch.targetDistanceMeters != null) {
      this.applyRaceDistanceSetting(next.targetDistanceMeters);
    }
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  private syncOs2lArmingForCurrentRace(settings = this.db.getAdminSettings()): void {
    if (!settings.os2lEnabled) {
      this.os2lTrigger.disarmRace();
      return;
    }

    const activeEvent = this.db.getActiveEvent();
    if (!activeEvent) {
      this.os2lTrigger.disarmRace();
      return;
    }

    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (currentRace && ["scheduled", "staging", "interrupted"].includes(currentRace.state)) {
      this.os2lTrigger.armRace(currentRace.id);
      return;
    }

    this.os2lTrigger.disarmRace();
  }

  private shouldAutoStageNextRace(): boolean {
    const activeEvent = this.db.getActiveEvent();
    if (!activeEvent) {
      return false;
    }

    if (this.resultPresentation) {
      return false;
    }

    if (this.autoStagePausedUntilManualStage) {
      return false;
    }

    this.reconcileQueueRaceStatuses(activeEvent.id);

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

  private reconcileQueueRaceStatuses(eventId: string): void {
    const activeQueueEntries = this.db
      .listQueueEntries(eventId)
      .filter((entry) => entry.status === "staging" || entry.status === "racing");

    if (activeQueueEntries.length === 0) {
      return;
    }

    const activeQueueEntryIds = new Set(activeQueueEntries.map((entry) => entry.id));
    const latestRaceByQueueEntryId = new Map<string, RaceRecord>();

    for (const race of this.db.listRaces(eventId)) {
      if (!race.queueEntryId || !activeQueueEntryIds.has(race.queueEntryId)) {
        continue;
      }

      if (!latestRaceByQueueEntryId.has(race.queueEntryId)) {
        latestRaceByQueueEntryId.set(race.queueEntryId, race);
      }
    }

    for (const entry of activeQueueEntries) {
      const linkedRace = latestRaceByQueueEntryId.get(entry.id);

      if (!linkedRace) {
        this.db.markQueueEntryStatus(entry.id, "queued");
        continue;
      }

      if (linkedRace.state === "finished") {
        this.db.markQueueEntryStatus(entry.id, "completed");
        continue;
      }

      if (linkedRace.state === "cancelled") {
        this.db.markQueueEntryStatus(entry.id, "queued");
      }
    }
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
  }

  private getQueueRacerStatsById(eventId: string): Map<string, { raceCount: number }> {
    const stats = new Map<string, { raceCount: number }>();
    for (const result of this.db.listResults(eventId)) {
      const existing = stats.get(result.racerId);
      stats.set(result.racerId, {
        raceCount: (existing?.raceCount ?? 0) + 1
      });
    }
    return stats;
  }

  private saveProjectedQueue(
    eventId: string,
    occurrences: ReturnType<AppDatabase["listQueueOccurrences"]>,
    timestamp: string
  ): void {
    const projection = projectQueueEntries({
      entries: this.db.listQueueEntries(eventId),
      occurrences,
      eventId,
      timestamp,
      getEntryId: () => nanoid(),
      racerStatsById: this.getQueueRacerStatsById(eventId)
    });
    this.db.saveQueueState(eventId, projection.occurrences, projection.entries);
  }

  updateRacerPaymentStatus(
    racerId: string,
    input: {
      status: "unpaid" | "paid" | "waived";
      note?: string;
      providerReference?: string;
    }
  ): AppSnapshot {
    this.payment.updateRacerPaymentStatus(racerId, input);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private getChallengeReplacementOptions(
    eventId: string,
    racerId: string
  ): ChallengeReplacementOption[] {
    return this.db
      .listQueueEntries(eventId)
      .filter(
        (entry) =>
          entry.status === "queued" &&
          entry.lockType === "challenge" &&
          entry.racerIds.includes(racerId)
      )
      .sort((left, right) => left.position - right.position)
      .flatMap((entry) => {
        const opponentRacerId = entry.racerIds.find((candidate) => candidate !== racerId);
        if (!opponentRacerId) {
          return [];
        }

        return [
          {
            queueEntryId: entry.id,
            position: entry.position,
            opponentRacerId,
            opponentDisplayName: this.db.getRacer(opponentRacerId)?.displayName ?? "Unknown racer"
          }
        ];
      });
  }

  private resolveChallengeReplacementOccurrenceId(
    eventId: string,
    racerId: string,
    replaceQueueEntryId: string
  ): string {
    const replacementEntry = this.db
      .listQueueEntries(eventId)
      .find((entry) => entry.id === replaceQueueEntryId);
    if (
      replacementEntry?.status !== "queued" ||
      replacementEntry.lockType !== "challenge" ||
      !replacementEntry.racerIds.includes(racerId)
    ) {
      throw new AppHttpError(
        "Choose a queued challenge match to replace.",
        400,
        "invalid_challenge_replacement"
      );
    }

    const replacementOccurrence = this.db
      .listQueueOccurrences(eventId)
      .find(
        (occurrence) =>
          replacementEntry.occurrenceIds.includes(occurrence.id) && occurrence.racerId === racerId
      );
    if (!replacementOccurrence) {
      throw new AppHttpError(
        "Choose a queued challenge match to replace.",
        400,
        "invalid_challenge_replacement"
      );
    }

    return replacementOccurrence.id;
  }

  async signUpQueueForRacer(
    racerId: string,
    input: RacerQueueSignupInput
  ): Promise<RacerQueueSignupResponse> {
    const activeEvent = this.db.getActiveEvent()!;
    this.db.ensureEventRegistration(activeEvent.id, racerId);
    const racer = this.db.getRacer(racerId);
    if (!racer) {
      throw new AppHttpError("Racer not found.", 404, "racer_not_found");
    }

    if (activeEvent.paymentRequiredForQueue && input.opponentRacerId) {
      this.db.ensureEventRegistration(activeEvent.id, input.opponentRacerId);
      this.payment.assertPaidForEvent(
        activeEvent.id,
        input.opponentRacerId,
        "That racer needs to see the host to pay before they can be added to a challenge."
      );
    }

    if (activeEvent.paymentRequiredForQueue) {
      const payment = this.db.getEventRacerPayment(activeEvent.id, racerId);
      if (!["paid", "waived"].includes(payment.status)) {
        const checkout = await this.payment.createCheckoutForQueue(racer, input);
        return {
          status: "checkout_required",
          paymentId: checkout.paymentId,
          checkoutUrl: checkout.checkoutUrl,
          snapshot: this.getSnapshot()
        };
      }
    }

    try {
      return {
        status: "queued",
        snapshot: this.signUpQueue({
          racerId,
          opponentRacerId: input.opponentRacerId,
          requestedType: input.requestedType,
          replaceQueueEntryId: input.replaceQueueEntryId
        })
      };
    } catch (error) {
      if (error instanceof ChallengeReplacementRequiredError && input.opponentRacerId) {
        return {
          status: "challenge_replacement_required",
          message:
            "All of your queue spots are already locked challenge matches. Choose one challenge to replace, or cancel this request.",
          opponentRacerId: input.opponentRacerId,
          replaceableMatches: this.getChallengeReplacementOptions(activeEvent.id, racerId),
          snapshot: this.getSnapshot()
        };
      }

      throw error;
    }
  }

  private queuePaidStripePayment(payment: StoredPaymentRecord): void {
    const activeEvent = this.db.getActiveEvent();
    if (activeEvent?.id !== payment.eventId) {
      throw new Error("The paid event is no longer active.");
    }

    if (activeEvent.paymentRequiredForQueue && payment.queueIntent.opponentRacerId) {
      this.payment.assertPaidForEvent(
        activeEvent.id,
        payment.queueIntent.opponentRacerId,
        "That racer needs to see the host to pay before they can be added to a challenge."
      );
    }

    this.signUpQueue({
      racerId: payment.racerId,
      opponentRacerId: payment.queueIntent.opponentRacerId,
      requestedType: payment.queueIntent.requestedType,
      replaceQueueEntryId: payment.queueIntent.replaceQueueEntryId
    });
  }

  private completeStripeCheckoutSession(session: Stripe.Checkout.Session): void {
    const payment = this.payment.applyCheckoutCompleted(session);
    if (!payment) {
      return;
    }

    try {
      this.queuePaidStripePayment(payment);
    } catch (error) {
      this.payment.markCheckoutQueueFailed(payment.id, error);
    }
  }

  handleStripeWebhook(rawBody: Buffer, signature?: string): { received: true } {
    const event = this.payment.parseWebhookEvent(rawBody, signature);
    if (this.payment.isWebhookProcessed(event.id)) {
      return { received: true };
    }

    if (event.type === "checkout.session.completed") {
      this.completeStripeCheckoutSession(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      this.payment.applyCheckoutExpired(event.data.object);
    }

    this.payment.markWebhookProcessed(event.id, event.type);
    this.emitSnapshot();
    return { received: true };
  }

  cancelRacerCheckoutPayment(racerId: string, paymentId: string): AppSnapshot {
    if (this.payment.cancelCheckoutPayment(racerId, paymentId)) {
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  signUpQueue(input: {
    racerId: string;
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
    replaceQueueEntryId?: string;
  }): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const racerStatsById = this.getQueueRacerStatsById(activeEvent.id);
    const timestamp = nowIso();
    this.db.ensureEventRegistration(activeEvent.id, input.racerId);
    if (input.opponentRacerId) {
      this.db.ensureEventRegistration(activeEvent.id, input.opponentRacerId);
    }
    if (input.replaceQueueEntryId && !input.opponentRacerId) {
      throw new AppHttpError(
        "Challenge replacement is only available for challenge matches.",
        400,
        "invalid_challenge_replacement"
      );
    }

    const replaceOccurrenceId = input.replaceQueueEntryId
      ? this.resolveChallengeReplacementOccurrenceId(
          activeEvent.id,
          input.racerId,
          input.replaceQueueEntryId
        )
      : undefined;
    let updated: ReturnType<typeof addQueueSignup>;
    try {
      updated = addQueueSignup(this.db.listQueueOccurrences(activeEvent.id), {
        eventId: activeEvent.id,
        racerId: input.racerId,
        opponentRacerId: input.opponentRacerId,
        requestedType: input.requestedType,
        replaceOccurrenceId,
        occurrenceId: nanoid(),
        opponentOccurrenceId: input.opponentRacerId ? nanoid() : undefined,
        lockGroupId: input.opponentRacerId ? nanoid() : undefined,
        timestamp,
        signupSequence: this.db.getNextQueueSignupSequence(activeEvent.id),
        raceCountAtJoin: racerStatsById.get(input.racerId)?.raceCount ?? 0,
        opponentRaceCountAtJoin: input.opponentRacerId
          ? (racerStatsById.get(input.opponentRacerId)?.raceCount ?? 0)
          : undefined,
        maxActiveOccurrencesPerRacer: settings.maxActiveQueueEntriesPerRacer,
        racerStatsById
      });
    } catch (error) {
      if (error instanceof ChallengeReplacementRequiredError) {
        throw error;
      }
      if (error instanceof ChallengeTargetUnavailableError) {
        throw new AppHttpError(
          "That racer is already locked into challenge matches and cannot be challenged until they have room in the queue.",
          409,
          "challenge_target_unavailable"
        );
      }
      if (error instanceof InvalidChallengeReplacementError) {
        throw new AppHttpError(error.message, 400, "invalid_challenge_replacement");
      }
      if (error instanceof Error && error.message.includes("maximum of")) {
        throw new AppHttpError(error.message, 409, "max_active_queue_entries");
      }
      throw error;
    }
    this.saveProjectedQueue(activeEvent.id, updated, timestamp);
    if (!this.maybeAutoStageNextRace()) {
      this.runQueueNotificationTriggers(activeEvent.id);
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  removeRacerFromAllUpcomingRaces(racerId: string): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const timestamp = nowIso();
    const updated = removeRacerFromQueue(this.db.listQueueOccurrences(activeEvent.id), racerId);
    this.saveProjectedQueue(activeEvent.id, updated, timestamp);
    if (!this.maybeAutoStageNextRace()) {
      this.runQueueNotificationTriggers(activeEvent.id);
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  removeRacerFromQueueEntry(entryId: string, racerId: string): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const timestamp = nowIso();
    const updated = removeRacerFromSpecificQueueEntry(
      this.db.listQueueEntries(activeEvent.id),
      this.db.listQueueOccurrences(activeEvent.id),
      entryId,
      racerId
    );
    this.saveProjectedQueue(activeEvent.id, updated, timestamp);
    if (!this.maybeAutoStageNextRace()) {
      this.runQueueNotificationTriggers(activeEvent.id);
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

    this.autoStagePausedUntilManualStage = false;
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

    this.runQueueNotificationTriggers(activeEvent.id);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private clearRaceStartState(): void {
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
      this.countdownTicker = null;
    }
    this.clearCountdownStartTimer();
    this.countdownRuntime = null;
    // Drop the in-flight-countdown guard so a late box abort after an unstage/reset is a harmless
    // no-op rather than re-reverting an already-cleared race.
    this.hardwareCountdownRaceId = null;
    this.currentActiveRace?.dispose();
    this.currentActiveRace = null;
    this.sensorAdapter.endRace();
    this.os2lTrigger.disarmRace();
  }

  unstageCurrentRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (!currentRace) {
      return this.getSnapshot();
    }

    if (!["scheduled", "staging"].includes(currentRace.state)) {
      throw new Error("Races can only be unstaged before countdown starts.");
    }

    this.clearRaceStartState();
    this.db.updateRace(currentRace.id, {
      countdownStartedAt: null,
      finishedAt: null,
      metrics: [],
      startedAt: null,
      state: "cancelled",
      winnerRacerId: null
    });
    if (currentRace.queueEntryId) {
      this.db.markQueueEntryStatus(currentRace.queueEntryId, "queued");
      // Explicitly unstaging an open queue race is a host pause, not an invitation for auto-stage
      // to immediately recreate the same staged race.
      this.autoStagePausedUntilManualStage = true;
    }
    this.runQueueNotificationTriggers(activeEvent.id);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  resetCurrentRaceToStaged(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (!currentRace) {
      return this.getSnapshot();
    }

    if (!["countdown", "active"].includes(currentRace.state)) {
      return this.getSnapshot();
    }

    this.clearRaceStartState();
    this.db.updateRace(currentRace.id, {
      countdownStartedAt: null,
      finishedAt: null,
      metrics: [],
      startedAt: null,
      state: "staging",
      winnerRacerId: null
    });
    if (currentRace.queueEntryId) {
      this.db.markQueueEntryStatus(currentRace.queueEntryId, "staging");
    }
    if (this.db.getAdminSettings().os2lEnabled) {
      this.os2lTrigger.armRace(currentRace.id);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  startManualCountdown(): AppSnapshot {
    this.manualTrigger.trigger();
    return this.getSnapshot();
  }

  startCountdown(
    source: "manual" | "os2l",
    options: { countdownDurationMs?: number } = {}
  ): AppSnapshot {
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
    const countdownDurationMs =
      options.countdownDurationMs != null &&
      Number.isFinite(options.countdownDurationMs) &&
      options.countdownDurationMs >= 0
        ? Math.round(options.countdownDurationMs)
        : COUNTDOWN_DURATION_MS;
    this.countdownRuntime = {
      raceId: currentRace.id,
      durationMs: countdownDurationMs
    };
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

    this.clearCountdownStartTimer();
    // The app owns the whole visible countdown and fires GO on its own clock at N — music-locked, so
    // an OS2L cue's start lands exactly where the DJ placed it (ADR 0010). This is true for the
    // simulator and the box alike; the box's own timing never triggers activation.
    this.countdownStartTimer = setTimeout(() => {
      this.countdownStartTimer = null;
      this.hardwareCountdownRaceId = null;
      if (this.countdownTicker) {
        clearInterval(this.countdownTicker);
        this.countdownTicker = null;
      }
      this.activateRace(currentRace.id);
    }, countdownDurationMs);

    if (this.sensorAdapter.drivesCountdown) {
      // The box runs its own silent countdown after `g`. Delay `g` by the pre-roll
      // `max(0, N − BOX_COUNTDOWN_MS)` so that silence becomes the tail of the app countdown and the
      // box is streaming by the time GO fires above. When N is at or below the box countdown, the
      // pre-roll clamps to zero (send `g` now) and the box's ticks simply arrive a beat late — the
      // unavoidable hardware floor. If the box is disconnected when we arm, it emits an `abort`
      // (handleSensorLifecycle) that reverts the race to staging and tears down the GO timer above.
      this.hardwareCountdownRaceId = currentRace.id;
      const preRollMs = Math.max(0, countdownDurationMs - readSensorBoxCountdownMs());
      if (preRollMs === 0) {
        this.sensorAdapter.armCountdown?.(currentRace.participants);
      } else {
        this.armGoTimer = setTimeout(() => {
          this.armGoTimer = null;
          this.sensorAdapter.armCountdown?.(currentRace.participants);
        }, preRollMs);
      }
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  private handleSensorLifecycle(event: SensorLifecycleEvent): void {
    const raceId = this.hardwareCountdownRaceId;
    if (!raceId) {
      // No hardware-driven countdown in flight; ignore stray box chatter.
      return;
    }

    switch (event.type) {
      case "countdown": {
        // The app owns the visible countdown on its own clock (ADR 0010); the box's CD cadence no
        // longer re-stamps it. Real basic_msg boxes are silent here anyway, so this is usually a
        // no-op — kept only to swallow a talkative ss_basic box's steps.
        break;
      }
      case "go": {
        // The box's first tick / GO confirms its stream started, but the app — not the box — owns
        // GO on its own timer (music-locked). Do not activate here.
        break;
      }
      case "abort": {
        // A disconnect while arming still reverts the race to staging so the operator can retry.
        this.abortHardwareCountdown(raceId, event.reason);
        break;
      }
    }
  }

  private abortHardwareCountdown(raceId: string, reason: string): void {
    if (this.hardwareCountdownRaceId !== raceId) {
      return;
    }
    this.hardwareCountdownRaceId = null;
    this.clearCountdownStartTimer();
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
      this.countdownTicker = null;
    }
    // Silence the box and return the race to staging so the operator can retry.
    this.sensorAdapter.endRace();
    const race = this.db.getRace(raceId);
    if (race?.state === "countdown") {
      this.db.updateRace(raceId, { state: "staging", countdownStartedAt: null });
    }
    console.warn(`[race] hardware countdown aborted: ${reason}`);
    this.emitSnapshot();
  }

  /**
   * React to the sensor adapter connecting or dropping. A drop while a race is live can't be
   * cleanly resumed (the box zeroes its counters on GO — ADR 0005), so we interrupt the race and
   * let the operator restart it. Every status change re-broadcasts so the health panel stays live.
   */
  private handleSensorStatusChange(status: SensorStatus): void {
    if (!status.connected && this.currentActiveRace) {
      this.interruptCurrentRace("The race box disconnected mid-race.");
      return;
    }
    this.emitSnapshot();
  }

  private interruptCurrentRace(reason: string): void {
    if (!this.currentActiveRace) {
      return;
    }
    this.currentActiveRace.dispose();
    this.currentActiveRace = null;
    this.sensorAdapter.endRace();

    const activeEvent = this.db.getActiveEvent();
    const race = activeEvent ? this.db.getCurrentRace(activeEvent.id) : null;
    if (race?.state === "active") {
      this.db.updateRace(race.id, { state: "interrupted" });
    }
    console.warn(`[race] interrupted: ${reason}`);
    this.emitSnapshot();
  }

  /** The sensor's connection state for the health surface; simulator reports a steady ready state. */
  private getSensorStatus(): SensorStatus {
    return (
      this.sensorAdapter.getStatus?.() ?? {
        adapterId: this.sensorAdapter.id,
        label: this.sensorAdapter.label,
        connected: true,
        detail: "Using the built-in simulator (no hardware).",
        portPath: null,
        firmware: null,
        manualPortOverride: null,
        lastError: null
      }
    );
  }

  private activateRace(raceId: string): void {
    const race = this.db.getRace(raceId);
    if (race?.state !== "countdown") {
      return;
    }
    this.currentActiveRace = ActiveRace.start(race, this.db, this.sensorAdapter, (result) =>
      this.handleRaceFinalized(result)
    );
    this.runQueueNotificationTriggers(race.eventId);
    this.emitSnapshot();
  }

  private handleRaceFinalized({ race, winnerRacerId }: FinalizedRaceResult): void {
    this.currentActiveRace = null;
    this.applyTournamentRaceOutcome(race, winnerRacerId);
    this.showRaceResultPresentation(race, winnerRacerId);
    if (!this.maybeAutoStageNextRace()) {
      this.runQueueNotificationTriggers(race.eventId);
      this.emitSnapshot();
    }
  }

  finalizeCurrentRace(): AppSnapshot {
    this.currentActiveRace?.finalize();
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
    this.currentActiveRace = ActiveRace.resume(race, this.db, this.sensorAdapter, (result) =>
      this.handleRaceFinalized(result)
    );
    this.emitSnapshot();
    return this.getSnapshot();
  }

  finalizeInterruptedRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const race = this.db.getCurrentRace(activeEvent.id);
    if (race?.state !== "interrupted") {
      return this.getSnapshot();
    }
    this.currentActiveRace = ActiveRace.resume(race, this.db, this.sensorAdapter, (result) =>
      this.handleRaceFinalized(result)
    );
    this.currentActiveRace.finalize();
    return this.getSnapshot();
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

  private findFinishedTournamentRace(input: {
    eventId: string;
    tournamentId: string;
    stageId: string;
    participantIds: string[];
  }): RaceRecord | null {
    return (
      this.db.listRaces(input.eventId).find(
        (race) =>
          race.tournamentId === input.tournamentId &&
          race.stageId === input.stageId &&
          race.state === "finished" &&
          sameParticipantSet(
            race.participants.map((participant) => participant.racerId),
            input.participantIds
          )
      ) ?? null
    );
  }

  private reopenTournamentRaceForUndo(race: RaceRecord): void {
    const currentRace = this.db.getCurrentRace(race.eventId);
    if (currentRace && currentRace.id !== race.id) {
      throw new AppHttpError(
        "Finish or unstage the current race before undoing a tournament result.",
        409,
        "race_in_progress"
      );
    }

    if (this.resultPresentation?.race.id === race.id) {
      if (this.resultPresentationTimer) {
        clearTimeout(this.resultPresentationTimer);
        this.resultPresentationTimer = null;
      }
      this.resultPresentation = null;
    }

    this.db.deleteResultsForRace(race.id);
    this.db.updateRace(race.id, {
      countdownStartedAt: null,
      finishedAt: null,
      metrics: [],
      startedAt: null,
      state: "staging",
      winnerRacerId: null
    });

    if (this.db.getAdminSettings().os2lEnabled) {
      this.os2lTrigger.armRace(race.id);
    }
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

  unstageCurrentTournamentRace(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const currentRace = this.db.getCurrentRace(activeEvent.id);
    if (!currentRace) {
      return this.getSnapshot();
    }

    if (currentRace.tournamentId == null) {
      throw new Error("Only staged tournament races can be unstaged from tournament controls.");
    }

    if (!["scheduled", "staging"].includes(currentRace.state)) {
      throw new Error("Tournament races can only be unstaged before countdown starts.");
    }

    this.db.updateRace(currentRace.id, {
      countdownStartedAt: null,
      finishedAt: null,
      metrics: [],
      startedAt: null,
      state: "cancelled",
      winnerRacerId: null
    });
    this.os2lTrigger.disarmRace();
    this.emitSnapshot();
    return this.getSnapshot();
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
    this.notifyTournamentStarted(bundle);
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

  undoTournamentBracketMatch(tournamentId: string, nodeId: string): AppSnapshot {
    const bundle = this.db.getTournamentBundle(tournamentId);
    const activeEvent = this.db.getActiveEvent()!;
    const node = bundle?.bracketNodes.find((candidate) => candidate.id === nodeId);
    if (!bundle || !node?.winnerRacerId || !node.racerAId || !node.racerBId) {
      return this.getSnapshot();
    }

    const race = this.findFinishedTournamentRace({
      eventId: activeEvent.id,
      tournamentId,
      stageId: node.stageId,
      participantIds: [node.racerAId, node.racerBId]
    });
    if (!race) {
      throw new AppHttpError(
        "Could not find the completed race for that bracket match.",
        404,
        "race_not_found"
      );
    }

    const nextBundle = undoBracketNodeResult({ bundle, nodeId });
    if (!nextBundle) {
      throw new AppHttpError(
        "That match can no longer be safely undone because later tournament results depend on it.",
        409,
        "tournament_result_locked"
      );
    }

    this.reopenTournamentRaceForUndo(race);
    this.db.saveTournamentBundle(nextBundle);
    this.db.updateAdminSettings({
      mode: nextBundle.tournament.preset
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  undoTournamentGroupMatch(tournamentId: string, matchId: string): AppSnapshot {
    const bundle = this.db.getTournamentBundle(tournamentId);
    const activeEvent = this.db.getActiveEvent()!;
    const match = bundle?.groupMatches.find((candidate) => candidate.id === matchId);
    const stage =
      bundle?.stages.find(
        (candidate) => candidate.kind === "groups" || candidate.kind === "round-robin"
      ) ?? bundle?.stages[0];
    if (!bundle || !match?.winnerRacerId || !stage) {
      return this.getSnapshot();
    }

    const race = this.findFinishedTournamentRace({
      eventId: activeEvent.id,
      tournamentId,
      stageId: stage.id,
      participantIds: [match.racerAId, match.racerBId]
    });
    if (!race) {
      throw new AppHttpError(
        "Could not find the completed race for that tournament match.",
        404,
        "race_not_found"
      );
    }

    const nextBundle = undoGroupMatchResult({ bundle, matchId });
    if (!nextBundle) {
      throw new AppHttpError(
        "That match can no longer be safely undone because later tournament results depend on it.",
        409,
        "tournament_result_locked"
      );
    }

    this.reopenTournamentRaceForUndo(race);
    this.db.saveTournamentBundle(this.syncGroupsToFinals(nextBundle));
    this.db.updateAdminSettings({
      mode: nextBundle.tournament.preset
    });
    this.emitSnapshot();
    return this.getSnapshot();
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
      this.runQueueNotificationTriggers(bundle.tournament.eventId);
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  startTunnel(): AppSnapshot {
    // Starting is itself an explicit action, so always start from the current env-derived config.
    // This also covers the case where an operator declined the post-save restart and later starts
    // the tunnel by hand — without this the cached (stale) config would be used.
    this.tunnelManager.reloadConfig();
    this.tunnelManager.start(this.serverPort, () => this.emitSnapshot());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  stopTunnel(): AppSnapshot {
    this.tunnelManager.stop(() => this.emitSnapshot());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  /**
   * Stop the tunnel, pick up the latest tunnel config from the environment, then start again.
   * Used after a tunnel-key managed-setting change, and only when the operator has confirmed the
   * restart (it drops every racer's connection while it reconnects).
   */
  restartTunnel(): AppSnapshot {
    this.tunnelManager.stop(() => this.emitSnapshot());
    this.tunnelManager.reloadConfig();
    this.tunnelManager.start(this.serverPort, () => this.emitSnapshot());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  /**
   * Persist one managed setting to the runtime env file, apply it to `process.env`, and re-apply
   * the affected subsystem (ADR 0004's two-tier model). Most subsystems derive config from
   * `process.env` per call, so they pick the change up automatically. The tunnel is the exception:
   * if it is running, the caller is told a restart is needed and must confirm it (we never restart
   * silently mid-event); if it is idle, its cached config is refreshed here.
   */
  saveManagedSetting(
    id: string,
    value: string
  ): { snapshot: AppSnapshot; needsTunnelRestart: boolean } {
    const definition = getManagedSetting(id);
    if (!definition) {
      throw new AppHttpError(`Unknown managed setting: ${id}`, 400, "unknown_managed_setting");
    }
    if (!this.runtimeEnvFilePath) {
      throw new AppHttpError(
        "Runtime settings file is not available.",
        500,
        "runtime_env_unavailable"
      );
    }

    const trimmed = value.trim();
    if (
      definition.kind === "select" &&
      trimmed.length > 0 &&
      !definition.options?.some((option) => option.value === trimmed)
    ) {
      throw new AppHttpError(
        `Invalid value for ${definition.label}.`,
        400,
        "invalid_managed_value"
      );
    }

    writeManagedEnvValue(this.runtimeEnvFilePath, definition.envKey, trimmed);
    applyManagedEnvValue(definition.envKey, trimmed);

    const tunnelRunning = this.tunnelManager.isRunning();
    if (definition.requiresTunnelRestart && !tunnelRunning) {
      this.tunnelManager.reloadConfig();
    }

    this.emitSnapshot();
    return {
      snapshot: this.getSnapshot(),
      needsTunnelRestart: Boolean(definition.requiresTunnelRestart) && tunnelRunning
    };
  }

  /**
   * Re-read the runtime env files from disk so hand-edited advanced settings take effect without a
   * full restart. The reload overrides previously file-loaded values while preserving genuine
   * shell overrides (key provenance in env.ts).
   */
  reloadSettings(): AppSnapshot {
    const dirs = new Set<string>(this.dotenvSearchDirs);
    for (const file of this.loadedDotenvFiles) {
      dirs.add(path.dirname(file));
    }
    if (this.runtimeEnvFilePath) {
      dirs.add(path.dirname(this.runtimeEnvFilePath));
    }
    this.loadedDotenvFiles = reloadDotenvFiles({ searchDirs: [...dirs] });
    if (!this.tunnelManager.isRunning()) {
      this.tunnelManager.reloadConfig();
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  /**
   * Assemble the redacted diagnostics bundle: app/platform info, loaded env files, managed-key
   * set/unset state, per-subsystem status, tunnel diagnostics with the separate reachability
   * checks, and recent logs. Secrets are passed only to the redactor and never emitted.
   */
  async getDiagnosticsBundle(): Promise<DiagnosticsBundle> {
    const diagnostics = this.tunnelManager.getDiagnostics();
    const publicUrl = diagnostics.publicUrl ?? this.tunnelManager.getState().publicUrl ?? null;
    const tunnelChecks = await runTunnelHealthChecks(publicUrl);
    const snapshot = this.getSnapshot();
    const secretValues = SECRET_ENV_KEYS.map((key) => process.env[key]?.trim()).filter(
      (value): value is string => Boolean(value)
    );

    return assembleDiagnosticsBundle({
      appVersion: this.appVersion,
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      generatedAt: new Date().toISOString(),
      runtimeEnv: snapshot.runtimeEnv,
      subsystemHealth: snapshot.subsystemHealth,
      tunnel: snapshot.tunnel,
      tunnelDiagnostics: diagnostics,
      tunnelChecks,
      logs: this.logFilePath ? this.getLogLines() : [],
      secretValues
    });
  }

  getTunnelState(): TunnelState {
    return this.tunnelManager.getState();
  }

  getTunnelDiagnostics(): TunnelDiagnostics {
    const diagnostics = this.tunnelManager.getDiagnostics();
    this.emitSnapshot();
    return diagnostics;
  }

  async installCloudflared(): Promise<TunnelDiagnostics> {
    try {
      return await this.tunnelManager.installCloudflared();
    } finally {
      this.emitSnapshot();
    }
  }

  setServerPort(port: number): void {
    this.serverPort = port;
    this.db.updateAdminSettings({
      ...this.db.getAdminSettings(),
      serverPort: port
    });
  }
}
