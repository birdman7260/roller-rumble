import type {
  APP_MODES,
  IDENTITY_TYPES,
  QUEUE_ENTRY_REQUESTED_TYPES,
  QUEUE_ENTRY_STATUSES,
  QUEUE_ENTRY_TYPES,
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
export type AppMode = (typeof APP_MODES)[number];
export type QueueEntryType = (typeof QUEUE_ENTRY_TYPES)[number];
export type QueueEntryRequestedType = (typeof QUEUE_ENTRY_REQUESTED_TYPES)[number];
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number];
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

export interface EventRecord {
  id: string;
  name: string;
  includeAllRaceData: boolean;
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
  position: number;
  racerIds: string[];
  status: QueueEntryStatus;
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
}

export interface RacerStats {
  races: number;
  wins: number;
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
  theme: ThemeDefinition;
}

export interface TunnelState {
  status: "idle" | "starting" | "active" | "error";
  publicUrl?: string | null;
  message?: string | null;
}

export interface AdminSettings {
  mode: AppMode;
  themeId: string;
  os2lEnabled: boolean;
  autoStageNextRace: boolean;
  includeAllRaceData: boolean;
  targetDistanceMeters: number;
  serverPort: number;
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
  photoBooth: PhotoBoothStatus;
}

export interface CreateRacerInput {
  displayName: string;
  email?: string;
  phone?: string;
  anonymousId?: string;
}

export interface QueueSignupInput {
  racerId: string;
  opponentRacerId?: string;
  requestedType?: "solo" | "auto-match";
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
