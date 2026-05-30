import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { nanoid } from "nanoid";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential
} from "@simplewebauthn/server";
import {
  COUNTDOWN_SECONDS,
  DEFAULT_OS2L_PORT,
  DEFAULT_SERVER_PORT
} from "@goldsprints/shared/constants";
import { themes, getTheme } from "@goldsprints/shared/themes";
import type {
  BracketNode,
  AdminSettings,
  AppSnapshot,
  AccountlessRacerSessionInput,
  PhotoBoothAdminStatus,
  PhotoBoothSession,
  PhotoBoothStatus,
  PhotoBoothTokenResponse,
  RaceMetricsSnapshot,
  RaceRecord,
  RaceResultPresentation,
  Racer,
  RacerAuthSuccessResponse,
  RacerQueueSignupInput,
  RacerStats,
  RacerSummary,
  PasskeyRegistrationStartInput,
  PasskeyRegistrationStartResponse,
  PasskeySignInStartResponse,
  RoundRobinMatch,
  TournamentBundle,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentPreset,
  TunnelDiagnostics,
  TunnelState
} from "@goldsprints/shared/types";
import { nowIso } from "@goldsprints/shared/utils";
import { AppDatabase, type StoredPasskeyCredential } from "../db/Database";
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
  projectQueueEntries,
  reindexQueue,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "./queue";
import { TournamentService } from "./tournaments";
import {
  createSignedPhotoBoothToken,
  PHOTO_BOOTH_TOKEN_TTL_MS,
  verifySignedPhotoBoothToken,
  type PhotoBoothTokenPayload
} from "./photo-booth";
import { getLocalNetworkBaseUrl } from "./network";

const RESULT_MODAL_DURATION_MS = 15000;
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RACER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RACER_SESSION_SECRET_SETTING_KEY = "racerSessionSecret";

export class AppHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string
  ) {
    super(message);
  }
}

interface PasskeyRequestContext {
  origin: string;
  rpId: string;
}

interface PasskeyChallenge {
  id: string;
  kind: "sign-in" | "registration";
  challenge: string;
  email: string;
  origin: string;
  rpId: string;
  expiresAt: number;
  racerId?: string;
  displayName?: string;
  phone?: string;
}

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function toWebAuthnCredential(credential: StoredPasskeyCredential): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: Buffer.from(credential.publicKey, "base64url"),
    counter: credential.counter,
    transports: credential.transports as AuthenticatorTransportFuture[]
  };
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
  private readonly tunnelManager: CloudflaredTunnelManager;
  private readonly tournaments = new TournamentService();
  private countdownTicker: NodeJS.Timeout | null = null;
  private currentRuntime: CurrentRaceRuntime | null = null;
  private resultPresentation: RaceResultPresentation | null = null;
  private resultPresentationTimer: NodeJS.Timeout | null = null;
  private readonly passkeyChallenges = new Map<string, PasskeyChallenge>();
  private serverPort: number;

  constructor(options: AppServiceOptions) {
    super();
    this.dataDir = options.dataDir;
    this.uploadsDir = path.join(options.dataDir, "uploads");
    this.serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
    this.db = new AppDatabase(options.dataDir);
    this.tunnelManager = new CloudflaredTunnelManager({ dataDir: options.dataDir });
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
    this.emit("snapshot", this.getSnapshot());
  }

  getSnapshot(): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    this.reconcileQueueRaceStatuses(activeEvent.id);
    const allResults = this.db.listResults();
    const results = settings.includeAllRaceData
      ? allResults
      : allResults.filter((result) => result.eventId === activeEvent.id);
    const racers = this.buildRacerSummaries(activeEvent.id, results, allResults);
    const queue = reindexQueue(
      this.db
        .listQueueEntries(activeEvent.id)
        .filter((entry) => ["queued", "staging"].includes(entry.status))
    );
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
      photoBooth: this.getPhotoBoothStatus(),
      themes,
      raceProjection: {
        race: currentRace,
        countdownSecondsRemaining,
        metricsByRacerId,
        winnerRacerId: currentRace?.winnerRacerId ?? null,
        nextQueueEntry,
        resultPresentation: this.resultPresentation,
        theme: selectedTheme
      }
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
    if (this.resultPresentation.race.queueEntryId) {
      this.db.markQueueEntryStatus(this.resultPresentation.race.queueEntryId, "completed");
    }
    this.reconcileQueueRaceStatuses(this.resultPresentation.race.eventId);
    this.resultPresentation = null;
    // Auto-stage waits until the audience result beat is finished so the projector and admin
    // workflow both move forward at the same deliberate moment.
    if (!this.maybeAutoStageNextRace()) {
      this.emitSnapshot();
    }
  }

  dismissRaceResultPresentation(): AppSnapshot {
    this.clearRaceResultPresentation();
    return this.getSnapshot();
  }

  private buildRacerSummaries(
    eventId: string,
    results: ReturnType<AppDatabase["listResults"]>,
    allResults: ReturnType<AppDatabase["listResults"]>
  ): RacerSummary[] {
    const racers = this.db.listEventRacers(eventId);

    return racers.map((racer) => {
      const racerResults = results.filter((result) => result.racerId === racer.id);
      const eventResults = allResults.filter(
        (result) => result.racerId === racer.id && result.eventId === eventId
      );
      const careerResults = allResults.filter((result) => result.racerId === racer.id);
      const stats: RacerStats = {
        races: racerResults.length,
        wins: racerResults.filter((result) => result.placement === 1).length,
        eventRaces: eventResults.length,
        eventWins: eventResults.filter((result) => result.placement === 1).length,
        careerRaces: careerResults.length,
        careerEventCount: new Set(careerResults.map((result) => result.eventId)).size,
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
        stats,
        payment: this.db.getEventRacerPayment(eventId, racer.id)
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
    return getLocalNetworkBaseUrl(this.serverPort);
  }

  async getQrCodeDataUrl(): Promise<string> {
    const tunnel = this.tunnelManager.getState();
    const url = tunnel.publicUrl ?? `${this.getLocalBaseUrl()}/racer`;
    return QRCode.toDataURL(url, {
      margin: 1,
      width: 220
    });
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
      type: "goldsprints.photo-booth.pairing",
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
      type: "goldsprints.photo-booth.token",
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
    const parsedOrigin = new URL(origin);
    const configuredRpId = process.env.GOLDSPRINTS_PASSKEY_RP_ID?.trim();
    return {
      origin: parsedOrigin.origin,
      rpId:
        configuredRpId !== undefined && configuredRpId.length > 0
          ? configuredRpId
          : parsedOrigin.hostname
    };
  }

  private getRacerSessionSecret(): string {
    const existing = this.db.getSetting<string | null>(
      RACER_SESSION_SECRET_SETTING_KEY,
      null
    ).value;
    if (existing) {
      return existing;
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    this.db.setSetting(RACER_SESSION_SECRET_SETTING_KEY, secret);
    return secret;
  }

  createRacerSessionToken(racerId: string): string {
    const payload = encodeBase64UrlJson({
      racerId,
      expiresAt: Date.now() + RACER_SESSION_TTL_MS
    });
    const signature = crypto
      .createHmac("sha256", this.getRacerSessionSecret())
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  getRacerFromSessionToken(token?: string | null): Racer | null {
    if (!token) {
      return null;
    }

    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.getRacerSessionSecret())
      .update(payload)
      .digest("base64url");
    if (!timingSafeEqualString(signature, expectedSignature)) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        racerId?: string;
        expiresAt?: number;
      };
      if (!decoded.racerId || !decoded.expiresAt || decoded.expiresAt < Date.now()) {
        return null;
      }
      return this.db.getRacer(decoded.racerId);
    } catch {
      return null;
    }
  }

  getRacerAuthSession(token?: string | null): Racer | null {
    const racer = this.getRacerFromSessionToken(token);
    const activeEvent = this.db.getActiveEvent();
    if (racer && activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }

  private rememberPasskeyChallenge(challenge: Omit<PasskeyChallenge, "id" | "expiresAt">): string {
    const id = nanoid();
    this.passkeyChallenges.set(id, {
      ...challenge,
      id,
      expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS
    });
    return id;
  }

  private consumePasskeyChallenge(id: string, kind: PasskeyChallenge["kind"]): PasskeyChallenge {
    const challenge = this.passkeyChallenges.get(id);
    this.passkeyChallenges.delete(id);
    if (challenge?.kind !== kind || challenge.expiresAt < Date.now()) {
      throw new AppHttpError("Passkey challenge expired. Please try again.", 400, "expired");
    }
    return challenge;
  }

  async startPasskeySignIn(
    emailInput: string,
    context: PasskeyRequestContext
  ): Promise<PasskeySignInStartResponse> {
    const email = normalizeEmail(emailInput);
    const racer = this.db.findRacerByIdentity("email", email);
    if (!racer) {
      return {
        status: "register_required",
        email
      };
    }

    const credentials = this.db.listPasskeyCredentialsForRacer(racer.id);
    if (credentials.length === 0) {
      return {
        status: "host_assist",
        email,
        message: "That email is already registered. Please ask the host to help attach a passkey."
      };
    }

    const options = await generateAuthenticationOptions({
      rpID: context.rpId,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[]
      })),
      userVerification: "preferred"
    });
    const challengeId = this.rememberPasskeyChallenge({
      kind: "sign-in",
      challenge: options.challenge,
      email,
      racerId: racer.id,
      origin: context.origin,
      rpId: context.rpId
    });

    return {
      status: "passkey",
      email,
      challengeId,
      options
    };
  }

  async finishPasskeySignIn(
    challengeId: string,
    response: unknown
  ): Promise<RacerAuthSuccessResponse> {
    const challenge = this.consumePasskeyChallenge(challengeId, "sign-in");
    const credentialId =
      typeof (response as { id?: unknown }).id === "string" ? (response as { id: string }).id : "";
    const credential = this.db.getPasskeyCredentialByCredentialId(credentialId);
    if (!credential || credential.racerId !== challenge.racerId) {
      throw new AppHttpError("Passkey credential was not recognized.", 401, "invalid_passkey");
    }

    const verification = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: toWebAuthnCredential(credential),
      requireUserVerification: false
    });
    if (!verification.verified) {
      throw new AppHttpError("Passkey sign-in was not verified.", 401, "invalid_passkey");
    }

    this.db.updatePasskeyCredentialUse(
      verification.authenticationInfo.credentialID,
      verification.authenticationInfo.newCounter
    );
    const racer = this.db.getRacer(credential.racerId);
    if (!racer) {
      throw new AppHttpError("Racer account was not found.", 404, "racer_not_found");
    }

    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    this.emitSnapshot();
    return {
      racer,
      snapshot: this.getSnapshot()
    };
  }

  async startPasskeyRegistration(
    input: PasskeyRegistrationStartInput,
    context: PasskeyRequestContext,
    sessionRacerId?: string | null
  ): Promise<PasskeyRegistrationStartResponse> {
    const email = normalizeEmail(input.email);
    const existingRacer = this.db.findRacerByIdentity("email", email);
    if (existingRacer && existingRacer.id !== sessionRacerId) {
      return {
        status: "host_assist",
        email,
        message: "That email is already registered. Please ask the host to help attach a passkey."
      };
    }

    const racerForCredential = sessionRacerId ? this.db.getRacer(sessionRacerId) : null;
    const excludeCredentials = racerForCredential
      ? this.db.listPasskeyCredentialsForRacer(racerForCredential.id).map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as AuthenticatorTransportFuture[]
        }))
      : [];
    const options = await generateRegistrationOptions({
      rpName: "GoldSprints",
      rpID: context.rpId,
      userName: email,
      userDisplayName: input.displayName,
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
      }
    });
    const challengeId = this.rememberPasskeyChallenge({
      kind: "registration",
      challenge: options.challenge,
      email,
      displayName: input.displayName,
      phone: input.phone,
      racerId: sessionRacerId ?? undefined,
      origin: context.origin,
      rpId: context.rpId
    });

    return {
      status: "passkey",
      email,
      challengeId,
      options
    };
  }

  async finishPasskeyRegistration(
    challengeId: string,
    response: unknown
  ): Promise<RacerAuthSuccessResponse> {
    const challenge = this.consumePasskeyChallenge(challengeId, "registration");
    const verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: false
    });
    if (!verification.verified) {
      throw new AppHttpError("Passkey registration was not verified.", 401, "invalid_passkey");
    }

    const credential = verification.registrationInfo.credential;
    const existingCredential = this.db.getPasskeyCredentialByCredentialId(credential.id);
    if (existingCredential) {
      throw new AppHttpError("That passkey is already registered.", 409, "duplicate_passkey");
    }

    let racer = challenge.racerId ? this.db.getRacer(challenge.racerId) : null;
    if (racer) {
      this.db.updateRacerRegistration(racer.id, {
        displayName: challenge.displayName ?? racer.displayName,
        email: challenge.email,
        phone: challenge.phone
      });
      racer = this.db.getRacer(racer.id);
    } else {
      racer = this.db.createOrUpdateRacer({
        displayName: challenge.displayName ?? challenge.email,
        email: challenge.email,
        phone: challenge.phone
      });
    }

    if (!racer) {
      throw new AppHttpError("Could not create racer account.", 500, "registration_failed");
    }

    this.db.createPasskeyCredential({
      racerId: racer.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp
    });

    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
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

    if (this.resultPresentation) {
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

    const runtime = this.currentRuntime;
    if (runtime?.raceId !== currentRace.id) {
      return;
    }

    runtime.targetDistanceMeters = targetDistanceMeters;
    // Lowering the target can instantly end a live race, so re-evaluate against current telemetry.
    this.reconcileRuntimeTargetDistance(Date.now());
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
    const activeEvent = this.db.getActiveEvent()!;
    this.db.updateEventRacerPayment(activeEvent.id, racerId, input);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  signUpQueueForRacer(racerId: string, input: RacerQueueSignupInput): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    this.db.ensureEventRegistration(activeEvent.id, racerId);
    const settings = this.db.getAdminSettings();
    const payment = this.db.getEventRacerPayment(activeEvent.id, racerId);
    if (settings.paymentRequiredForQueue && !["paid", "waived"].includes(payment.status)) {
      throw new AppHttpError(
        "Please see the host to pay the entrance fee before joining the race queue.",
        402,
        "payment_required"
      );
    }
    if (settings.paymentRequiredForQueue && input.opponentRacerId) {
      this.db.ensureEventRegistration(activeEvent.id, input.opponentRacerId);
      const opponentPayment = this.db.getEventRacerPayment(activeEvent.id, input.opponentRacerId);
      if (!["paid", "waived"].includes(opponentPayment.status)) {
        throw new AppHttpError(
          "That racer needs to see the host to pay before they can be added to a challenge.",
          402,
          "payment_required"
        );
      }
    }

    return this.signUpQueue({
      racerId,
      opponentRacerId: input.opponentRacerId,
      requestedType: input.requestedType
    });
  }

  signUpQueue(input: {
    racerId: string;
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
  }): AppSnapshot {
    const activeEvent = this.db.getActiveEvent()!;
    const settings = this.db.getAdminSettings();
    const racerStatsById = this.getQueueRacerStatsById(activeEvent.id);
    const timestamp = nowIso();
    this.db.ensureEventRegistration(activeEvent.id, input.racerId);
    if (input.opponentRacerId) {
      this.db.ensureEventRegistration(activeEvent.id, input.opponentRacerId);
    }
    const updated = addQueueSignup(this.db.listQueueOccurrences(activeEvent.id), {
      eventId: activeEvent.id,
      racerId: input.racerId,
      opponentRacerId: input.opponentRacerId,
      requestedType: input.requestedType,
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
    this.saveProjectedQueue(activeEvent.id, updated, timestamp);
    if (!this.maybeAutoStageNextRace()) {
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

    if (activeRace.queueEntryId) {
      this.db.markQueueEntryStatus(activeRace.queueEntryId, "racing");
    }
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
    const finishedRace = this.db.updateRace(runtime.raceId, {
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

    this.applyTournamentRaceOutcome(finishedRace, winnerRacerId);
    this.showRaceResultPresentation(finishedRace, winnerRacerId);

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
