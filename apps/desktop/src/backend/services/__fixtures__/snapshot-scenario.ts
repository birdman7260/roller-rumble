import type {
  AdminSettings,
  EventRacerPayment,
  EventRecord,
  Os2lDiagnostics,
  PhotoBoothStatus,
  QueueEntry,
  Racer,
  RaceRecord,
  RaceResult,
  RaceResultPresentation,
  RuntimeEnvInfo,
  StripeSetupStatus,
  TunnelState
} from "@roller-rumble/shared/types";
import { COUNTDOWN_DURATION_MS, DEFAULT_THEME_ID } from "@roller-rumble/shared/constants";
import { MANAGED_SETTINGS } from "@roller-rumble/shared/managed-settings";
import type { SensorStatus } from "../../adapters/sensor";
import type { AppDatabase } from "../../db/Database";

// A single pinned instant so generatedAt / Date.now()-derived fields are deterministic
// across both the legacy getSnapshot path and the extracted SnapshotAssembler.
export const FIXED_NOW_MS = Date.UTC(2026, 5, 24, 12, 0, 0);
export const FIXED_NOW_ISO = new Date(FIXED_NOW_MS).toISOString();

const ACTIVE_EVENT_ID = "event-1";
const OTHER_EVENT_ID = "event-0";

function makeRacer(id: string, displayName: string): Racer {
  return {
    id,
    displayName,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    identities: []
  };
}

function makeResult(patch: Partial<RaceResult> & Pick<RaceResult, "id" | "racerId">): RaceResult {
  return {
    eventId: ACTIVE_EVENT_ID,
    raceId: "race-history",
    lane: "left",
    placement: 1,
    finishTimeMs: 60_000,
    distanceMeters: 250,
    avgSpeedKph: 35,
    topSpeedKph: 40,
    maxWattage: 300,
    createdAt: "2026-01-02T00:00:00.000Z",
    ...patch
  };
}

const RACERS: Racer[] = [makeRacer("racer-1", "Ada"), makeRacer("racer-2", "Grace")];

// Mix of active-event and other-event results so includeAllRaceData filtering is exercised.
const ALL_RESULTS: RaceResult[] = [
  makeResult({ id: "result-1", racerId: "racer-1", placement: 1, finishTimeMs: 60_000 }),
  makeResult({
    id: "result-2",
    racerId: "racer-2",
    placement: 2,
    finishTimeMs: 65_000,
    avgSpeedKph: 33,
    topSpeedKph: 38,
    maxWattage: 280
  }),
  makeResult({
    id: "result-3",
    racerId: "racer-1",
    eventId: OTHER_EVENT_ID,
    placement: 1,
    finishTimeMs: 58_000,
    avgSpeedKph: 36,
    topSpeedKph: 42,
    maxWattage: 320
  })
];

const QUEUE: QueueEntry[] = [
  {
    id: "queue-1",
    eventId: ACTIVE_EVENT_ID,
    type: "match",
    requestedType: "auto-match",
    lockType: "flex",
    position: 1,
    racerIds: ["racer-1", "racer-2"],
    occurrenceIds: ["occ-1", "occ-2"],
    priorityScore: 0,
    status: "queued",
    createdAt: "2026-06-24T11:00:00.000Z",
    updatedAt: "2026-06-24T11:00:00.000Z"
  },
  {
    id: "queue-2",
    eventId: ACTIVE_EVENT_ID,
    type: "match",
    requestedType: "auto-match",
    lockType: "flex",
    position: 2,
    racerIds: ["racer-1"],
    occurrenceIds: ["occ-3"],
    priorityScore: 0,
    status: "staging",
    createdAt: "2026-06-24T11:05:00.000Z",
    updatedAt: "2026-06-24T11:05:00.000Z"
  }
];

// A mid-flight race so metricsByRacerId (written by ActiveRace) is exercised.
const CURRENT_RACE: RaceRecord = {
  id: "race-current",
  eventId: ACTIVE_EVENT_ID,
  queueEntryId: "queue-0",
  tournamentId: null,
  stageId: null,
  mode: "open-time-trial",
  format: "match",
  state: "active",
  targetDistanceMeters: 250,
  themeId: DEFAULT_THEME_ID,
  participants: [
    { racerId: "racer-1", lane: "left" },
    { racerId: "racer-2", lane: "right" }
  ],
  metrics: [
    {
      racerId: "racer-1",
      lane: "left",
      rotationCount: 80,
      elapsedMs: 12_000,
      distanceMeters: 168,
      rpm: 270,
      currentSpeedKph: 34,
      topSpeedKph: 41,
      averageSpeedKph: 33.5,
      wattage: 260,
      maxWattage: 310,
      finishedAtMs: null
    },
    {
      racerId: "racer-2",
      lane: "right",
      rotationCount: 72,
      elapsedMs: 12_000,
      distanceMeters: 151,
      rpm: 246,
      currentSpeedKph: 31,
      topSpeedKph: 38,
      averageSpeedKph: 30.2,
      wattage: 230,
      maxWattage: 290,
      finishedAtMs: null
    }
  ],
  winnerRacerId: null,
  countdownStartedAt: null,
  startedAt: "2026-06-24T11:59:48.000Z",
  finishedAt: null,
  createdAt: "2026-06-24T11:59:40.000Z",
  updatedAt: "2026-06-24T11:59:52.000Z"
};

function makeSettings(includeAllRaceData: boolean): AdminSettings {
  return {
    mode: "open-time-trial",
    themeId: DEFAULT_THEME_ID,
    os2lEnabled: true,
    autoStageNextRace: false,
    includeAllRaceData,
    allowAccountlessRacerSignup: true,
    showPublicRacerInfoWithoutLogin: true,
    showRacerNotificationDebugList: false,
    raceDisplayLaneColorsFlipped: false,
    raceDisplayGlowMode: "rivalry",
    raceDisplayShowEventName: true,
    raceDisplayTickerMessages: ["Welcome to Roller Rumble", "Next up: finals"],
    raceDisplayTickerSpeed: 40,
    maxActiveQueueEntriesPerRacer: 2,
    targetDistanceMeters: 250,
    serverPort: 3187
  };
}

function makeEvent(includeAllRaceData: boolean): EventRecord {
  return {
    id: ACTIVE_EVENT_ID,
    name: "Friday Night Rumble",
    includeAllRaceData,
    paymentRequiredForQueue: false,
    paymentAmountCents: null,
    paymentCurrency: "usd",
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-24T11:00:00.000Z"
  };
}

const PAYMENT: EventRacerPayment = {
  status: "paid",
  paidAt: "2026-06-24T10:00:00.000Z",
  updatedAt: "2026-06-24T10:00:00.000Z",
  note: null,
  providerReference: "pi_test_123"
};

// Context pieces — the live runtime state only RollerRumbleApp knows at assemble time.
// Values are deliberately non-default so the racer-surface stripping is observable.
export const SCENARIO_TUNNEL: TunnelState = {
  status: "active",
  mode: "quick",
  publicUrl: "https://race.example.test",
  tunnelName: "rumble-tunnel",
  binarySource: "managed",
  cloudflaredVersion: "2026.6.0",
  message: "Tunnel ready",
  lastError: null
};

export const SCENARIO_OS2L: Os2lDiagnostics = {
  enabled: true,
  listening: true,
  advertising: true,
  port: 8088,
  serviceName: "Roller Rumble",
  armedRaceId: "race-current",
  acceptedMessageCount: 12,
  ignoredMessageCount: 3,
  beatMessageCount: 480,
  lastBeatAt: "2026-06-24T11:59:59.000Z",
  lastRawMessage: '{"evt":"beat"}',
  lastRawMessageAt: "2026-06-24T11:59:59.000Z",
  lastAcceptedMessage: '{"evt":"btn"}',
  lastAcceptedAt: "2026-06-24T11:59:50.000Z",
  lastIgnoredMessage: '{"evt":"noop"}',
  lastIgnoredAt: "2026-06-24T11:59:40.000Z",
  lastIgnoredReason: "not armed",
  lastError: null
};

export const SCENARIO_PHOTO_BOOTH: PhotoBoothStatus = {
  enabled: true,
  boothId: "booth-1",
  status: "online",
  lastSeenAt: "2026-06-24T11:59:55.000Z",
  lastCaptureAt: "2026-06-24T11:58:00.000Z",
  pendingUploadCount: 2,
  message: "Camera ready"
};

export const SCENARIO_STRIPE: StripeSetupStatus = {
  configured: true,
  hasSecretKey: true,
  hasWebhookSecret: true,
  hasExtraCaCertFile: false,
  extraCaCertFile: null,
  publicRacerUrl: "https://pay.example.test",
  message: "Stripe configured"
};

export const SCENARIO_SENSOR: SensorStatus = {
  adapterId: "simulator",
  label: "Built-in simulator",
  connected: true,
  detail: "Using the built-in simulator (no hardware).",
  portPath: null,
  firmware: null,
  manualPortOverride: null,
  lastError: null
};

export const SCENARIO_RESULT_PRESENTATION: RaceResultPresentation = {
  race: { ...CURRENT_RACE, id: "race-prev", state: "finished", winnerRacerId: "racer-1" },
  winnerRacerId: "racer-1",
  expiresAt: "2026-06-24T12:00:10.000Z"
};

// Managed settings that are "set" in the golden scenario; the rest report unset.
const SCENARIO_SET_MANAGED_IDS = new Set([
  "stripeSecretKey",
  "stripeWebhookSecret",
  "publicRacerUrl",
  "webPushPublicKey",
  "webPushPrivateKey",
  "webPushSubject"
]);

export const SCENARIO_RUNTIME_ENV: RuntimeEnvInfo = {
  path: "/data/.env.local",
  exists: true,
  loadedFiles: ["/data/.env.local"],
  managedSettings: MANAGED_SETTINGS.map((setting) => {
    const set = SCENARIO_SET_MANAGED_IDS.has(setting.id);
    return {
      id: setting.id,
      envKey: setting.envKey,
      secret: setting.secret,
      set,
      value: setting.secret ? null : set ? "configured-value" : "",
      last4: set && setting.secret ? "1234" : null
    };
  })
};

export const SCENARIO_COUNTDOWN_DURATION_MS = COUNTDOWN_DURATION_MS;

/**
 * A mock AppDatabase exposing only the read methods getSnapshot / SnapshotAssembler use.
 * Deterministic — no SQLite, matching the prototype-mock convention in app.test.ts.
 */
export function makeSnapshotDb(includeAllRaceData: boolean): AppDatabase {
  const settings = makeSettings(includeAllRaceData);
  const event = makeEvent(includeAllRaceData);

  return {
    getActiveEvent: () => event,
    getAdminSettings: () => settings,
    getNotificationRevision: () => "revision-1",
    listResults: () => ALL_RESULTS.map((result) => ({ ...result })),
    listQueueEntries: () => QUEUE.map((entry) => ({ ...entry })),
    getCurrentRace: () => ({ ...CURRENT_RACE }),
    listTournamentBundles: () => [],
    listEventRacers: () => RACERS.map((racer) => ({ ...racer })),
    getEventRacerPayment: () => ({ ...PAYMENT })
  } as unknown as AppDatabase;
}

export const SCENARIO_RESULT_PRESENTATION_NULL = null;
