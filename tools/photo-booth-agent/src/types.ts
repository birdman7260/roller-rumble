export type BoothHardwareStatus = "unknown" | "online" | "offline" | "simulated" | "error";

export interface HardwareComponentHealth {
  status: BoothHardwareStatus;
  message?: string | null;
  updatedAt: string;
}

export interface BoothHardwareHealth {
  scanner: HardwareComponentHealth;
  camera: HardwareComponentHealth;
  lights: HardwareComponentHealth;
  umbrella: HardwareComponentHealth;
  hallSensor: HardwareComponentHealth;
}

export interface LightSelection {
  lookId: string;
  hue: number;
  saturation: number;
  brightness: number;
  effectId: number;
  effectSpeed: number;
  effectIntensity: number;
  paletteId: number;
  label: string;
}

export type UmbrellaMode = "parked" | "homing" | "spinning" | "holding" | "moving" | "error";

export interface UmbrellaState {
  mode: UmbrellaMode;
  panelCount: number;
  currentPanel: number | null;
  message?: string | null;
}

export interface DiagnosticsResult {
  checkedAt: string;
  scanner: HardwareComponentHealth;
  camera: HardwareComponentHealth;
  lights: HardwareComponentHealth;
  umbrella: HardwareComponentHealth;
  hallSensor: HardwareComponentHealth;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createHealth(
  status: BoothHardwareStatus,
  message: string | null = null
): HardwareComponentHealth {
  return {
    status,
    message,
    updatedAt: nowIso()
  };
}
