import type {
  APP_MODES,
  EVENT_PAYMENT_STATUSES,
  IDENTITY_TYPES,
  PAYMENT_RECORD_STATUSES,
  PASSKEY_AUTH_STATUSES,
  QUEUE_ENTRY_REQUESTED_TYPES,
  QUEUE_ENTRY_LOCK_TYPES,
  QUEUE_ENTRY_STATUSES,
  QUEUE_ENTRY_TYPES,
  QUEUE_OCCURRENCE_INTENTS,
  RACER_NOTIFICATION_TYPES,
  RACE_STATES,
  SUPPORTED_TOURNAMENT_PRESETS,
  THEME_CONNECTOR_STYLES,
  THEME_CONFETTI_EFFECTS,
  THEME_RACE_GRAPHIC_VARIANTS,
  THEME_SPRITE_SHEET_IDS,
  TOURNAMENT_BRACKET_LAYOUT_MODES,
  TOURNAMENT_BRACKET_SIZES,
  THEME_ORIENTATIONS,
  THEME_SURFACE_STYLES,
  THEME_UI_STYLES,
  TOURNAMENT_STAGE_KINDS,
  TOURNAMENT_STATUSES
} from "./constants";

export type IdentityType = (typeof IDENTITY_TYPES)[number];
export type EventPaymentStatus = (typeof EVENT_PAYMENT_STATUSES)[number];
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];
export type PasskeyAuthStatus = (typeof PASSKEY_AUTH_STATUSES)[number];
export type AppMode = (typeof APP_MODES)[number];
export type QueueEntryType = (typeof QUEUE_ENTRY_TYPES)[number];
export type QueueEntryRequestedType = (typeof QUEUE_ENTRY_REQUESTED_TYPES)[number];
export type QueueEntryLockType = (typeof QUEUE_ENTRY_LOCK_TYPES)[number];
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number];
export type QueueOccurrenceIntent = (typeof QUEUE_OCCURRENCE_INTENTS)[number];
export type RaceState = (typeof RACE_STATES)[number];
export type ThemeConnectorStyle = (typeof THEME_CONNECTOR_STYLES)[number];
export type ThemeConfettiEffect = (typeof THEME_CONFETTI_EFFECTS)[number];
export type ThemeOrientation = (typeof THEME_ORIENTATIONS)[number];
export type ThemeRaceGraphicVariant = (typeof THEME_RACE_GRAPHIC_VARIANTS)[number];
export type ThemeSpriteSheetId = (typeof THEME_SPRITE_SHEET_IDS)[number];
export type ThemeSurfaceStyle = (typeof THEME_SURFACE_STYLES)[number];
export type ThemeUiStyle = (typeof THEME_UI_STYLES)[number];
export type TournamentPreset = (typeof SUPPORTED_TOURNAMENT_PRESETS)[number];
export type TournamentBracketSize = (typeof TOURNAMENT_BRACKET_SIZES)[number];
export type TournamentBracketLayoutMode = (typeof TOURNAMENT_BRACKET_LAYOUT_MODES)[number];
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentStageKind = (typeof TOURNAMENT_STAGE_KINDS)[number];
export type ProjectorWindowSizePreset = "720p" | "1080p";

export interface ProjectorWindowResizeResult {
  preset: ProjectorWindowSizePreset;
  width: number;
  height: number;
}

export interface Identity {
  id: string;
  racerId: string;
  type: IdentityType;
  value: string;
  createdAt: string;
}

export interface Racer {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  identities: Identity[];
}

export interface EventRacerPayment {
  status: EventPaymentStatus;
  paidAt?: string | null;
  updatedAt?: string | null;
  note?: string | null;
  providerReference?: string | null;
}

export type PhotoBoothHardwareStatus = "unknown" | "online" | "offline" | "simulated" | "error";

export interface PhotoBoothHardwareComponentHealth {
  status: PhotoBoothHardwareStatus;
  message?: string | null;
  updatedAt?: string | null;
}

export interface PhotoBoothHardwareHealth {
  scanner?: PhotoBoothHardwareComponentHealth;
  camera?: PhotoBoothHardwareComponentHealth;
  lights?: PhotoBoothHardwareComponentHealth;
  umbrella?: PhotoBoothHardwareComponentHealth;
  hallSensor?: PhotoBoothHardwareComponentHealth;
}

export interface PhotoBoothStatus {
  boothId: string;
  status: "idle" | "online" | "capturing" | "syncing" | "error";
  lastSeenAt?: string | null;
  lastCaptureAt?: string | null;
  pendingUploadCount: number;
  message?: string | null;
  hardware?: PhotoBoothHardwareHealth;
}

export interface PhotoBoothAdminStatus {
  status: PhotoBoothStatus;
  serverBaseUrl: string;
  pairingSecret: string;
  pairingQrCodeDataUrl: string;
}

export interface PhotoBoothTokenResponse {
  token: string;
  expiresAt: string;
  qrPayload: string;
  qrCodeDataUrl: string;
  racer: Pick<Racer, "id" | "displayName" | "avatarUrl">;
  event: Pick<EventRecord, "id" | "name">;
}

export interface PhotoBoothSession {
  eventId: string;
  eventName: string;
  racerId: string;
  racerName: string;
  racerAvatarUrl?: string | null;
  expiresAt: string;
}

export interface PhotoBoothCapture {
  id: string;
  eventId: string;
  racerId: string;
  boothId: string;
  originalUrl: string;
  avatarUrl: string;
  capturedAt: string;
  uploadedAt: string;
  createdAt: string;
}

export type RacerNotificationType = (typeof RACER_NOTIFICATION_TYPES)[number];
export type NotificationDeliveryStatus = "pending" | "sent" | "failed" | "no_subscription";
export type AdminNotificationTargetType = "event" | "queued" | "tournament" | "selected";

export interface WebPushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationConfig {
  configured: boolean;
  publicKey?: string | null;
  message: string;
}

export interface AdminNotificationInput {
  targetType: AdminNotificationTargetType;
  type?: RacerNotificationType;
  racerIds?: string[];
  title: string;
  body: string;
  url?: string | null;
}

export interface RacerNotification {
  id: string;
  notificationId: string;
  type: RacerNotificationType;
  title: string;
  body: string;
  url?: string | null;
  eventId?: string | null;
  readAt?: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  createdAt: string;
}

export interface EventRecord {
  id: string;
  name: string;
  includeAllRaceData: boolean;
  paymentRequiredForQueue: boolean;
  paymentAmountCents?: number | null;
  paymentCurrency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventRacer {
  id: string;
  eventId: string;
  racerId: string;
  createdAt: string;
}

export interface QueueEntry {
  id: string;
  eventId: string;
  type: QueueEntryType;
  requestedType: QueueEntryRequestedType;
  lockType: QueueEntryLockType;
  position: number;
  racerIds: string[];
  occurrenceIds: string[];
  priorityScore: number;
  status: QueueEntryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QueueOccurrence {
  id: string;
  eventId: string;
  racerId: string;
  status: QueueEntryStatus;
  intent: QueueOccurrenceIntent;
  lockGroupId: string | null;
  signupSequence: number;
  bumpCount: number;
  raceCountAtJoin: number;
  projectedPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RaceParticipant {
  racerId: string;
  lane: "left" | "right" | "solo";
}

export interface RaceMetricsSnapshot {
  racerId: string;
  lane: "left" | "right" | "solo";
  rotationCount: number;
  elapsedMs: number;
  distanceMeters: number;
  currentSpeedKph: number;
  topSpeedKph: number;
  averageSpeedKph: number;
  wattage: number;
  maxWattage: number;
  finishedAtMs?: number | null;
}

export interface RaceResult {
  id: string;
  eventId: string;
  raceId: string;
  racerId: string;
  lane: "left" | "right" | "solo";
  placement: number;
  finishTimeMs?: number | null;
  distanceMeters: number;
  avgSpeedKph: number;
  topSpeedKph: number;
  maxWattage: number;
  createdAt: string;
}

export interface RaceRecord {
  id: string;
  eventId: string;
  queueEntryId?: string | null;
  tournamentId?: string | null;
  stageId?: string | null;
  mode: AppMode;
  format: QueueEntryType;
  state: RaceState;
  targetDistanceMeters: number;
  themeId: string;
  participants: RaceParticipant[];
  metrics: RaceMetricsSnapshot[];
  winnerRacerId?: string | null;
  countdownStartedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface TournamentParticipantSeed {
  racerId: string;
  seed: number;
  score: number;
  label: string;
}

export interface TournamentRecord {
  id: string;
  eventId: string;
  name: string;
  preset: TournamentPreset;
  status: TournamentStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentStage {
  id: string;
  tournamentId: string;
  kind: TournamentStageKind;
  name: string;
  order: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BracketNode {
  id: string;
  tournamentId: string;
  stageId: string;
  roundNumber: number;
  matchNumber: number;
  slotLabel: string;
  racerAId?: string | null;
  racerBId?: string | null;
  winnerRacerId?: string | null;
  loserToNodeId?: string | null;
  winnerToNodeId?: string | null;
  state: "pending" | "ready" | "finished" | "bye";
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RoundRobinMatch {
  id: string;
  racerAId: string;
  racerBId: string;
  winnerRacerId?: string | null;
  scoreLabel?: string | null;
}

export interface RoundRobinStanding {
  racerId: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}

export interface TournamentBundle {
  tournament: TournamentRecord;
  stages: TournamentStage[];
  bracketNodes: BracketNode[];
  groupMatches: RoundRobinMatch[];
  standings: RoundRobinStanding[];
  seeds: TournamentParticipantSeed[];
}

export interface TournamentOptOutResponse {
  snapshot: AppSnapshot;
  tournamentId: string;
  optedOutRacerId: string;
  replacementType: "racer" | "bye";
  replacementRacerId: string | null;
  replacementRacerName: string | null;
  message: string;
}

export interface TournamentReplacementCandidate {
  label: string;
  racerId: string;
  score: number;
  seed: number;
}

export interface TournamentRacerRemovalOptionsResponse {
  canAutomaticallyReplace: boolean;
  candidates: TournamentReplacementCandidate[];
  racerId: string;
  tournamentId: string;
}

export interface AdminTournamentRacerRemovalInput {
  replacementMode: "auto" | "racer" | "bye";
  replacementRacerId?: string | null;
}

export interface AdminTournamentRacerRemovalResponse {
  snapshot: AppSnapshot;
  tournamentId: string;
  removedRacerId: string;
  replacementType: "racer" | "bye";
  replacementRacerId: string | null;
  replacementRacerName: string | null;
  message: string;
}

export interface TournamentByeFillOptionsResponse {
  candidates: TournamentReplacementCandidate[];
  nodeId: string;
  tournamentId: string;
}

export interface AdminTournamentByeFillInput {
  replacementRacerId: string;
}

export interface AdminTournamentByeFillResponse {
  snapshot: AppSnapshot;
  tournamentId: string;
  nodeId: string;
  replacementRacerId: string;
  replacementRacerName: string;
  message: string;
}

export interface ThemeTokens {
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentSoft: string;
  text: string;
  textMuted: string;
  success: string;
  warning: string;
  danger: string;
  laneA: string;
  laneB: string;
}

export interface ThemeSpriteAnimationDefinition {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  row: number;
  durationMs: number;
}

export interface ThemeSpriteSheetDefinition {
  id: ThemeSpriteSheetId;
  speedThresholdKph: number;
  slowAnimation: ThemeSpriteAnimationDefinition;
  fastAnimation: ThemeSpriteAnimationDefinition;
}

export interface ThemeRaceGraphicDefinition {
  variant: ThemeRaceGraphicVariant;
  laneLabels?: {
    default?: string;
    laneA?: string;
    laneB?: string;
    solo?: string;
  };
  markers?: {
    finish?: string;
    middle?: string;
    start?: string;
  };
}

export interface ThemeDefinition {
  id: string;
  label: string;
  description: string;
  orientation: ThemeOrientation;
  surfaceStyle: ThemeSurfaceStyle;
  uiStyle: ThemeUiStyle;
  connectorStyle: ThemeConnectorStyle;
  fontFamily: string;
  raceGraphic: ThemeRaceGraphicDefinition;
  confettiEffectId: ThemeConfettiEffect;
  spriteSheet: ThemeSpriteSheetDefinition;
  tokens: ThemeTokens;
}

export interface CompetitionPresetDefinition {
  id: TournamentPreset;
  label: string;
  description: string;
  createsBracket: boolean;
  supportsBracketSizing: boolean;
  supportsSeeding: boolean;
}

export interface RacerSummary {
  racer: Racer;
  stats: RacerStats;
  payment: EventRacerPayment;
}

export interface RacerStats {
  races: number;
  wins: number;
  eventRaces: number;
  eventWins: number;
  careerRaces: number;
  careerEventCount: number;
  bestFinishTimeMs?: number | null;
  topSpeedKph: number;
  averageSpeedKph: number;
  maxWattage: number;
}

export interface RaceProjectionModel {
  race: RaceRecord | null;
  countdownSecondsRemaining: number | null;
  metricsByRacerId: Record<string, RaceMetricsSnapshot>;
  winnerRacerId?: string | null;
  nextQueueEntry: QueueEntry | null;
  resultPresentation: RaceResultPresentation | null;
  theme: ThemeDefinition;
}

export interface RaceResultPresentation {
  race: RaceRecord;
  winnerRacerId: string;
  expiresAt: string;
}

export interface TunnelState {
  status: "idle" | "starting" | "active" | "error";
  mode?: "quick" | "token";
  publicUrl?: string | null;
  tunnelName?: string | null;
  binarySource?: "env" | "managed" | "path" | "missing" | null;
  cloudflaredVersion?: string | null;
  message?: string | null;
  lastError?: string | null;
}

export interface TunnelDiagnostics {
  mode: "quick" | "token";
  publicUrl: string | null;
  tunnelName: string | null;
  hasToken: boolean;
  binaryPath: string | null;
  binarySource: "env" | "managed" | "path" | "missing";
  cloudflaredVersion: string | null;
  installPath: string | null;
  downloadUrl: string | null;
  supportedPlatform: boolean;
  message: string | null;
  lastError: string | null;
}

export interface Os2lDiagnostics {
  enabled: boolean;
  listening: boolean;
  advertising: boolean;
  port: number;
  serviceName: string;
  armedRaceId: string | null;
  acceptedMessageCount: number;
  ignoredMessageCount: number;
  beatMessageCount: number;
  lastBeatAt: string | null;
  lastRawMessage: string | null;
  lastRawMessageAt: string | null;
  lastAcceptedMessage: string | null;
  lastAcceptedAt: string | null;
  lastIgnoredMessage: string | null;
  lastIgnoredAt: string | null;
  lastIgnoredReason: string | null;
  lastError: string | null;
}

export interface AdminSettings {
  mode: AppMode;
  themeId: string;
  os2lEnabled: boolean;
  autoStageNextRace: boolean;
  includeAllRaceData: boolean;
  allowAccountlessRacerSignup: boolean;
  showPublicRacerInfoWithoutLogin: boolean;
  showRacerNotificationDebugList: boolean;
  raceDisplayLaneColorsFlipped: boolean;
  raceDisplayShowEventName: boolean;
  raceDisplayTickerMessages: string[];
  raceDisplayTickerSpeed: number;
  maxActiveQueueEntriesPerRacer: number;
  targetDistanceMeters: number;
  serverPort: number;
}

export interface StripeSetupStatus {
  configured: boolean;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  hasExtraCaCertFile: boolean;
  extraCaCertFile?: string | null;
  publicRacerUrl?: string | null;
  message: string;
}

export interface StripeConnectionTestResult {
  ok: boolean;
  code: string;
  message: string;
  requestId?: string | null;
}

export interface PaymentProviderStatus {
  stripe: StripeSetupStatus;
}

export interface AppSnapshot {
  generatedAt: string;
  settings: AdminSettings;
  activeEvent: EventRecord;
  racers: RacerSummary[];
  queue: QueueEntry[];
  raceProjection: RaceProjectionModel;
  tournaments: TournamentBundle[];
  themes: ThemeDefinition[];
  tunnel: TunnelState;
  os2l: Os2lDiagnostics;
  photoBooth: PhotoBoothStatus;
  paymentProvider: PaymentProviderStatus;
}

export interface CreateRacerInput {
  displayName: string;
  email?: string;
  phone?: string;
  accountlessId?: string;
}

export interface QueueSignupInput {
  racerId: string;
  opponentRacerId?: string;
  requestedType?: "solo" | "auto-match";
  replaceQueueEntryId?: string;
}

export interface RacerQueueSignupInput {
  opponentRacerId?: string;
  requestedType?: "solo" | "auto-match";
  replaceQueueEntryId?: string;
}

export interface ChallengeReplacementOption {
  queueEntryId: string;
  position: number;
  opponentRacerId: string;
  opponentDisplayName: string;
}

export type RacerQueueSignupResponse =
  | {
      status: "queued";
      snapshot: AppSnapshot;
    }
  | {
      status: "challenge_replacement_required";
      message: string;
      opponentRacerId: string;
      replaceableMatches: ChallengeReplacementOption[];
      snapshot: AppSnapshot;
    }
  | {
      status: "checkout_required";
      checkoutUrl: string;
      paymentId: string;
      snapshot: AppSnapshot;
    };

export interface PasskeyEmailInput {
  email: string;
}

export interface PasskeyRegistrationStartInput {
  email: string;
  displayName: string;
  phone?: string;
}

export interface PasskeyChallengeInput {
  challengeId: string;
  response: unknown;
}

export interface AccountlessRacerSessionInput {
  displayName: string;
  accountlessId: string;
}

export type PasskeySignInStartResponse =
  | {
      status: "passkey";
      email: string;
      challengeId: string;
      options: unknown;
    }
  | {
      status: "register_required";
      email: string;
    }
  | {
      status: "host_assist";
      email: string;
      message: string;
    };

export type PasskeyRegistrationStartResponse =
  | {
      status: "passkey";
      email: string;
      challengeId: string;
      options: unknown;
    }
  | {
      status: "host_assist";
      email: string;
      message: string;
    };

export interface RacerAuthSessionResponse {
  racer: Racer | null;
  snapshot: AppSnapshot;
  sessionToken?: string | null;
}

export interface RacerAuthSuccessResponse {
  racer: Racer;
  snapshot: AppSnapshot;
  sessionToken?: string | null;
}

export interface UpdateRacerPaymentInput {
  status: EventPaymentStatus;
  note?: string;
  providerReference?: string;
}

export interface UpdateEventPaymentConfigInput {
  paymentRequiredForQueue: boolean;
  paymentAmountCents?: number | null;
  paymentCurrency?: string;
}

export interface StartTournamentInput {
  name: string;
  preset: TournamentPreset;
  bracketSize?: TournamentBracketSize;
  bracketLayout?: TournamentBracketLayoutMode;
}

export interface CreatePhotoBoothTokenInput {
  racerId: string;
}

export interface ResolvePhotoBoothSessionInput {
  token: string;
  boothId?: string;
}

export interface UpdatePhotoBoothStatusInput {
  boothId: string;
  status: PhotoBoothStatus["status"];
  pendingUploadCount?: number;
  lastCaptureAt?: string | null;
  message?: string | null;
  hardware?: PhotoBoothHardwareHealth;
}
