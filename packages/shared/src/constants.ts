export const APP_NAME = "Roller Rumble";
export const API_PREFIX = "/api";
export const WS_PATH = "/ws";
export const DEFAULT_TARGET_DISTANCE_METERS = 250;
export const DEFAULT_TICKER_SPEED_PIXELS_PER_SECOND = 72;
export const COUNTDOWN_SECONDS = 3;
export const COUNTDOWN_DURATION_MS = COUNTDOWN_SECONDS * 1000;
export const DEFAULT_WHEEL_CIRCUMFERENCE_METERS = 2.1;
/**
 * The OpenSprints box's roller is 4.5 in / 114.3 mm in diameter with a single magnet, so one
 * sensor tick is one roller revolution. Confirmed against real hardware 2026-07-01 (and matching
 * the `114.3 * PI` constant in SilverSprint's firmware). The rollout — race distance per tick — is
 * the roller circumference. This is the OpenSprints sensor's rollout default; it is deliberately
 * separate from DEFAULT_WHEEL_CIRCUMFERENCE_METERS (a bike wheel, used by the simulator).
 */
export const OPENSPRINTS_ROLLER_DIAMETER_METERS = 0.1143;
export const OPENSPRINTS_ROLLER_ROLLOUT_METERS = Math.PI * OPENSPRINTS_ROLLER_DIAMETER_METERS;
export const DEFAULT_OS2L_PORT = 9996;
export const DEFAULT_SERVER_PORT = 3187;
export const DEFAULT_PUBLIC_HOST = "127.0.0.1";
export const DEFAULT_THEME_ID = "neon-night";
export const DEFAULT_EVENT_NAME = "Main Event";
export const DEFAULT_PAYMENT_CURRENCY = "usd";
export const STRIPE_MIN_PAYMENT_AMOUNT_CENTS = 50;
export const SUPPORTED_TOURNAMENT_PRESETS = [
  "open-time-trial",
  "single-elimination",
  "double-elimination",
  "round-robin",
  "groups-to-single-elimination"
] as const;
export const TOURNAMENT_BRACKET_SIZES = [2, 4, 8, 16, 32] as const;
export const TOURNAMENT_BRACKET_LAYOUT_MODES = ["auto", "standard", "center-converging"] as const;

export const RACE_STATES = [
  "scheduled",
  "staging",
  "countdown",
  "active",
  "finished",
  "interrupted",
  "cancelled"
] as const;

export const APP_MODES = SUPPORTED_TOURNAMENT_PRESETS;
export const IDENTITY_TYPES = ["email", "phone", "anonymous"] as const;
export const QUEUE_ENTRY_TYPES = ["solo", "match"] as const;
export const QUEUE_ENTRY_REQUESTED_TYPES = ["solo", "match", "auto-match"] as const;
export const QUEUE_ENTRY_LOCK_TYPES = ["flex", "challenge", "admin"] as const;
export const QUEUE_ENTRY_STATUSES = [
  "queued",
  "staging",
  "racing",
  "completed",
  "removed"
] as const;
export const QUEUE_OCCURRENCE_INTENTS = ["auto-match", "solo", "challenge"] as const;
export const EVENT_PAYMENT_STATUSES = ["unpaid", "paid", "waived"] as const;
export const PAYMENT_RECORD_STATUSES = [
  "checkout_created",
  "paid",
  "cancelled",
  "expired",
  "failed",
  "queue_failed"
] as const;
export const PASSKEY_AUTH_STATUSES = ["passkey", "register_required", "host_assist"] as const;
export const RACER_NOTIFICATION_TYPES = [
  "admin_message",
  "queue_get_ready",
  "tournament_started"
] as const;
export const TOURNAMENT_STATUSES = ["draft", "active", "complete"] as const;
export const TOURNAMENT_STAGE_KINDS = ["elimination", "round-robin", "groups"] as const;
export const THEME_ORIENTATIONS = ["horizontal", "vertical"] as const;
export const THEME_SURFACE_STYLES = ["default", "frontier", "black"] as const;
export const THEME_UI_STYLES = ["rounded", "pixel"] as const;
export const THEME_CONNECTOR_STYLES = ["glow", "shadow", "trail", "pixel"] as const;
export const THEME_RACE_GRAPHIC_VARIANTS = ["track", "climb", "trail", "ledger"] as const;
export const THEME_CONFETTI_EFFECTS = ["burst"] as const;
export const THEME_SPRITE_SHEET_IDS = [
  "neon-rider",
  "summit-rider",
  "frontier-wagon",
  "oregon-wagon"
] as const;
