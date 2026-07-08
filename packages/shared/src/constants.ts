export const APP_NAME = "Roller Rumble";
export const API_PREFIX = "/api";
export const WS_PATH = "/ws";
export const DEFAULT_TARGET_DISTANCE_METERS = 250;
export const DEFAULT_TICKER_SPEED_PIXELS_PER_SECOND = 72;
export const COUNTDOWN_SECONDS = 4;
export const COUNTDOWN_DURATION_MS = COUNTDOWN_SECONDS * 1000;
/**
 * The OpenSprints box's own silent countdown between the `g` (GO) command and the start of its
 * tick stream. The real `basic_msg` box runs a ~4s silent countdown and emits no `CD:` steps, so
 * this can't be measured closed-loop — it is a hand-tuned default (see ADR 0010). The app delays
 * `g` by `max(0, N − BOX_COUNTDOWN_MS)` so the box's silent countdown becomes the tail of the
 * app-owned, music-locked countdown. Overridable via the `ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS`
 * advanced setting for a box whose silent countdown differs.
 */
export const BOX_COUNTDOWN_MS = 4000;
export const DEFAULT_WHEEL_CIRCUMFERENCE_METERS = 2.1;
/**
 * The short beat between a clean finish (both racers cross the line, or the lone rider in a solo
 * race) and the results overlay, so the audience gets a moment on the finish line before the modal.
 * The finish-budget expiry path skips this beat — it already spent its drama waiting for the
 * trailing racer.
 */
export const RACE_CLEAN_FINISH_BEAT_MS = 1500;
/**
 * The trailing racer's finish budget, as a percentage of the winner's finishing elapsed time,
 * reckoned from race start. 120 means the trailing racer has until 1.2× the winner's time before the
 * race force-finalizes. Must be ≥ 100 (a value below the winner's own time makes no sense).
 * Overridable via the `ROLLER_RUMBLE_FINISH_BUDGET_PERCENT` advanced setting.
 */
export const DEFAULT_FINISH_BUDGET_PERCENT = 120;
/**
 * The floor on the trailing racer's finish budget: they always get at least this much time beyond
 * the winner's finish, so a short race (or a misconfigured low percentage) never slams the results
 * overlay up the instant the winner crosses.
 */
export const FINISH_BUDGET_FLOOR_MS = 5000;
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
