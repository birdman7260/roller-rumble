import type { LightSelection, UmbrellaState } from "./types";

export type BoothFlowState =
  | "idle"
  | "token-scanned"
  | "photo-mode"
  | "capturing"
  | "reviewing"
  | "syncing"
  | "error";

export interface BoothSessionState {
  flow: BoothFlowState;
  token: string | null;
  racerName: string | null;
  previewPath: string | null;
  message: string | null;
  lightSelection: LightSelection;
  umbrella: UmbrellaState;
  captureCountdownEndsAt: string | null;
}

export type BoothSessionEvent =
  | { type: "scan"; token: string; racerName: string }
  | { type: "photo-mode-ready"; umbrella: UmbrellaState }
  | { type: "light-selected"; selection: LightSelection }
  | { type: "umbrella-updated"; umbrella: UmbrellaState }
  | { type: "capture-started"; countdownEndsAt: string }
  | { type: "capture-ready"; previewPath: string; umbrella: UmbrellaState }
  | { type: "retake"; umbrella: UmbrellaState }
  | { type: "accept-started" }
  | { type: "accepted"; idleUmbrella: UmbrellaState }
  | { type: "cancelled"; idleUmbrella: UmbrellaState }
  | { type: "failed"; message: string };

export function createIdleBoothState(
  lightSelection: LightSelection,
  umbrella: UmbrellaState
): BoothSessionState {
  return {
    flow: "idle",
    token: null,
    racerName: null,
    previewPath: null,
    message: null,
    lightSelection,
    umbrella,
    captureCountdownEndsAt: null
  };
}

export function reduceBoothSession(
  state: BoothSessionState,
  event: BoothSessionEvent
): BoothSessionState {
  switch (event.type) {
    case "scan":
      return {
        ...state,
        flow: "token-scanned",
        token: event.token,
        racerName: event.racerName,
        previewPath: null,
        captureCountdownEndsAt: null,
        message: `Ready for ${event.racerName}`
      };
    case "photo-mode-ready":
      return {
        ...state,
        flow: "photo-mode",
        umbrella: event.umbrella,
        message: state.racerName ? `${state.racerName}, step into the kaleidoscope.` : null
      };
    case "light-selected":
      return {
        ...state,
        lightSelection: event.selection,
        message: `Lighting set to ${event.selection.label}.`
      };
    case "umbrella-updated":
      return {
        ...state,
        umbrella: event.umbrella,
        message: event.umbrella.message ?? state.message
      };
    case "capture-started":
      return {
        ...state,
        flow: "capturing",
        previewPath: null,
        captureCountdownEndsAt: event.countdownEndsAt,
        message: "Hold still. Capturing..."
      };
    case "capture-ready":
      return {
        ...state,
        flow: "reviewing",
        previewPath: event.previewPath,
        umbrella: event.umbrella,
        captureCountdownEndsAt: null,
        message: "Accept this avatar or retake it."
      };
    case "retake":
      return {
        ...state,
        flow: "photo-mode",
        previewPath: null,
        umbrella: event.umbrella,
        captureCountdownEndsAt: null,
        message: "No worries, let's take another."
      };
    case "accept-started":
      return {
        ...state,
        flow: "syncing",
        message: "Saving your avatar..."
      };
    case "accepted":
    case "cancelled":
      return createIdleBoothState(state.lightSelection, event.idleUmbrella);
    case "failed":
      return {
        ...state,
        flow: "error",
        captureCountdownEndsAt: null,
        message: event.message
      };
  }
}
