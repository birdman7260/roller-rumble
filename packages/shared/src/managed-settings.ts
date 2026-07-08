/**
 * The small, stable set of operator-facing configuration keys the app reads *and writes back*
 * into the runtime env file on the operator's behalf (see ADR 0004 and CONTEXT.md "managed
 * setting"). Everything else stays an advanced setting: read but never written by the app.
 *
 * This registry is the single source of truth shared by the backend (write-back, redaction,
 * subsystem mapping) and the renderer (which fields to render and how to mask them).
 */

export type SubsystemId =
  | "tunnel"
  | "stripe"
  | "webPush"
  | "network"
  | "os2l"
  | "photoBooth"
  | "sensor";

export type ManagedSettingKind = "text" | "secret" | "select";

export interface ManagedSettingOption {
  value: string;
  label: string;
}

export interface ManagedSettingDefinition {
  /** Stable identifier used by the REST surface and the renderer (e.g. "tunnelToken"). */
  id: string;
  /** The env var written into the runtime env file (e.g. "ROLLER_RUMBLE_TUNNEL_TOKEN"). */
  envKey: string;
  label: string;
  description?: string;
  kind: ManagedSettingKind;
  /** Secret values are masked in the UI and must never reach logs or the diagnostics bundle. */
  secret: boolean;
  /** Which subsystem this setting configures, for the status surface. */
  subsystem: SubsystemId;
  /** Options for `select` settings. */
  options?: ManagedSettingOption[];
  /**
   * The tunnel caches its config at construction and owns a child process, so a change to a
   * tunnel-affecting key only takes effect after an explicit, user-confirmed tunnel restart.
   */
  requiresTunnelRestart?: boolean;
}

export const MANAGED_SETTINGS: readonly ManagedSettingDefinition[] = [
  {
    id: "tunnelMode",
    envKey: "ROLLER_RUMBLE_TUNNEL_MODE",
    label: "Tunnel mode",
    description:
      "Quick mode gives a throwaway public URL with no setup. Token mode gives a stable URL backed by a Cloudflare tunnel you created (needed to fully test Stripe webhooks).",
    kind: "select",
    secret: false,
    subsystem: "tunnel",
    options: [
      { value: "quick", label: "Quick (throwaway URL)" },
      { value: "token", label: "Token (stable URL)" }
    ],
    requiresTunnelRestart: true
  },
  {
    id: "tunnelToken",
    envKey: "ROLLER_RUMBLE_TUNNEL_TOKEN",
    label: "Tunnel token",
    description: "Paste the connector token from your Cloudflare tunnel. Required for token mode.",
    kind: "secret",
    secret: true,
    subsystem: "tunnel",
    requiresTunnelRestart: true
  },
  {
    id: "tunnelName",
    envKey: "ROLLER_RUMBLE_TUNNEL_NAME",
    label: "Tunnel name",
    description: "The name of your Cloudflare tunnel, shown for reference.",
    kind: "text",
    secret: false,
    subsystem: "tunnel",
    requiresTunnelRestart: true
  },
  {
    id: "stripeSecretKey",
    envKey: "ROLLER_RUMBLE_STRIPE_SECRET_KEY",
    label: "Stripe secret key",
    description: "Your Stripe secret key (starts with sk_).",
    kind: "secret",
    secret: true,
    subsystem: "stripe"
  },
  {
    id: "stripeWebhookSecret",
    envKey: "ROLLER_RUMBLE_STRIPE_WEBHOOK_SECRET",
    label: "Stripe webhook secret",
    description: "Your Stripe webhook signing secret (starts with whsec_).",
    kind: "secret",
    secret: true,
    subsystem: "stripe"
  },
  {
    id: "stripeExtraCaCertFile",
    envKey: "ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE",
    label: "Stripe CA certificate file",
    description:
      "Only needed behind Zscaler, a corporate VPN, or other HTTPS inspection. Full path to a trusted root certificate exported as a PEM file.",
    kind: "text",
    secret: false,
    subsystem: "stripe"
  },
  {
    id: "localServerHost",
    envKey: "ROLLER_RUMBLE_LOCAL_SERVER_HOST",
    label: "Local network address",
    description:
      "Only set this if racer phones, the QR code, or the photo booth show the wrong address. This computer's LAN IP, usually 192.168.x.x or 10.x.x.x.",
    kind: "text",
    secret: false,
    subsystem: "network"
  },
  {
    id: "publicRacerUrl",
    envKey: "ROLLER_RUMBLE_PUBLIC_RACER_URL",
    label: "Public racer URL",
    description:
      "The public HTTPS address racers use. Set this when using a stable tunnel or custom domain.",
    kind: "text",
    secret: false,
    subsystem: "network",
    requiresTunnelRestart: true
  },
  {
    id: "webPushPublicKey",
    envKey: "ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY",
    label: "Web push public key",
    description: 'Usually filled in by the "Generate push keys" button.',
    kind: "text",
    secret: false,
    subsystem: "webPush"
  },
  {
    id: "webPushPrivateKey",
    envKey: "ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY",
    label: "Web push private key",
    description: 'Usually filled in by the "Generate push keys" button. Keep it secret.',
    kind: "secret",
    secret: true,
    subsystem: "webPush"
  },
  {
    id: "webPushSubject",
    envKey: "ROLLER_RUMBLE_WEB_PUSH_SUBJECT",
    label: "Web push contact",
    description: "Contact info for browser push services, e.g. mailto:you@example.com.",
    kind: "text",
    secret: false,
    subsystem: "webPush"
  },
  {
    id: "sensorMode",
    envKey: "ROLLER_RUMBLE_SENSOR_MODE",
    label: "Bike sensor",
    description:
      "Simulator generates fake riders for testing. OpenSprints uses the physical USB race box. Changing this takes effect after you fully quit and reopen Roller Rumble.",
    kind: "select",
    secret: false,
    subsystem: "sensor",
    options: [
      { value: "simulator", label: "Simulator (no hardware)" },
      { value: "opensprints", label: "OpenSprints USB box" }
    ]
  },
  {
    id: "sensorProtocol",
    envKey: "ROLLER_RUMBLE_SENSOR_PROTOCOL",
    label: "Sensor protocol",
    description:
      "Leave on Auto-detect for almost every box. Only force a specific OpenSprints firmware if auto-detect can't identify yours — the oldest 'advanced' firmware can't announce itself, so it must be set here.",
    kind: "select",
    secret: false,
    subsystem: "sensor",
    options: [
      { value: "auto", label: "Auto-detect (recommended)" },
      { value: "ss-basic", label: "SilverSprint (newest)" },
      { value: "basic", label: "OpenSprints basic" },
      { value: "advanced", label: "OpenSprints advanced (oldest)" }
    ]
  },
  {
    id: "sensorPort",
    envKey: "ROLLER_RUMBLE_SENSOR_PORT",
    label: "Sensor serial port",
    description:
      "Leave blank to auto-detect the race box. Set this to a specific port (e.g. COM3 on Windows, /dev/tty.usbserial-XXXX on Mac) only if auto-detect picks the wrong device.",
    kind: "text",
    secret: false,
    subsystem: "sensor"
  },
  {
    id: "sensorLaneMap",
    envKey: "ROLLER_RUMBLE_SENSOR_LANE_MAP",
    label: "Sensor lane map",
    description:
      "Which race lane each sensor port feeds, in order, comma-separated. Use left, right, solo, or unused. Example: left,right. Leave blank to map sensors to racers in order. A flipped map crowns the wrong winner, so confirm it against the real wiring.",
    kind: "text",
    secret: false,
    subsystem: "sensor"
  },
  {
    id: "sensorRolloutMeters",
    envKey: "ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS",
    label: "Roller rollout (meters)",
    description:
      "Distance a bike travels per one roller revolution, measured from your hardware. Feeds race distance and speed. Leave blank to use the default. Wrong values make distances and speeds wrong.",
    kind: "text",
    secret: false,
    subsystem: "sensor"
  },
  {
    id: "sensorBoxCountdownMs",
    envKey: "ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS",
    label: "Race box countdown (ms)",
    description:
      "How long the OpenSprints box stays silent between GO and its first tick, in milliseconds. Roller Rumble delays the box's GO so this silent stretch lands exactly at the end of the on-screen countdown. Leave blank to use the default (4000). Raise or lower it only if the countdown reaching zero doesn't match when your box actually goes.",
    kind: "text",
    secret: false,
    subsystem: "sensor"
  }
] as const;

const MANAGED_SETTINGS_BY_ID = new Map(MANAGED_SETTINGS.map((setting) => [setting.id, setting]));
const MANAGED_SETTINGS_BY_ENV_KEY = new Map(
  MANAGED_SETTINGS.map((setting) => [setting.envKey, setting])
);

export function getManagedSetting(id: string): ManagedSettingDefinition | undefined {
  return MANAGED_SETTINGS_BY_ID.get(id);
}

export function getManagedSettingByEnvKey(envKey: string): ManagedSettingDefinition | undefined {
  return MANAGED_SETTINGS_BY_ENV_KEY.get(envKey);
}

/** The env keys whose values are secret and must never appear in logs or the diagnostics bundle. */
export const SECRET_ENV_KEYS: readonly string[] = MANAGED_SETTINGS.filter(
  (setting) => setting.secret
).map((setting) => setting.envKey);

export function isSecretEnvKey(envKey: string): boolean {
  return getManagedSettingByEnvKey(envKey)?.secret ?? false;
}
