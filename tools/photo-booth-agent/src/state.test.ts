import { describe, expect, it } from "vitest";
import { createIdleBoothState, reduceBoothSession } from "./state";
import type { LightSelection, UmbrellaState } from "./types";

const selection: LightSelection = {
  lookId: "solid-white",
  hue: 0,
  saturation: 0,
  brightness: 255,
  effectId: 0,
  effectSpeed: 128,
  effectIntensity: 128,
  paletteId: 0,
  label: "Clean white"
};

const umbrella: UmbrellaState = {
  mode: "parked",
  panelCount: 8,
  currentPanel: 0,
  message: "Parked"
};

describe("photo booth session state", () => {
  it("walks through scan, photo mode, capture, review, accept, and idle", () => {
    const idle = createIdleBoothState(selection, umbrella);
    const scanned = reduceBoothSession(idle, {
      type: "scan",
      token: "token-1",
      racerName: "Ada Fast"
    });
    const photoMode = reduceBoothSession(scanned, {
      type: "photo-mode-ready",
      umbrella: { ...umbrella, mode: "spinning" }
    });
    const capturing = reduceBoothSession(photoMode, {
      type: "capture-started",
      countdownEndsAt: "2026-05-09T17:00:03.000Z"
    });
    const reviewing = reduceBoothSession(capturing, {
      type: "capture-ready",
      previewPath: "/captures/photo.png",
      umbrella: { ...umbrella, mode: "holding" }
    });
    const syncing = reduceBoothSession(reviewing, { type: "accept-started" });
    const accepted = reduceBoothSession(syncing, { type: "accepted", idleUmbrella: umbrella });

    expect(photoMode.flow).toBe("photo-mode");
    expect(reviewing.flow).toBe("reviewing");
    expect(reviewing.previewPath).toBe("/captures/photo.png");
    expect(syncing.flow).toBe("syncing");
    expect(accepted.flow).toBe("idle");
    expect(accepted.umbrella.mode).toBe("parked");
  });

  it("tracks light and umbrella choices during photo mode", () => {
    const idle = createIdleBoothState(selection, umbrella);
    const selected = reduceBoothSession(idle, {
      type: "light-selected",
      selection: {
        ...selection,
        lookId: "solid-blue",
        hue: 210,
        saturation: 90,
        label: "Blue shimmer"
      }
    });
    const moved = reduceBoothSession(selected, {
      type: "umbrella-updated",
      umbrella: { ...umbrella, mode: "holding", currentPanel: 3 }
    });

    expect(selected.lightSelection.label).toBe("Blue shimmer");
    expect(moved.umbrella.currentPanel).toBe(3);
  });

  it("keeps the session lit for a retake", () => {
    const reviewing = reduceBoothSession(
      {
        ...createIdleBoothState(selection, umbrella),
        flow: "reviewing",
        token: "token-1",
        racerName: "Ada Fast",
        previewPath: "/captures/photo.png"
      },
      { type: "retake", umbrella: { ...umbrella, mode: "spinning" } }
    );

    expect(reviewing.flow).toBe("photo-mode");
    expect(reviewing.previewPath).toBeNull();
    expect(reviewing.umbrella.mode).toBe("spinning");
  });
});
