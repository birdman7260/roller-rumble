import { type CSSProperties, useEffect, useReducer } from "react";
import type {
  RaceMetricsSnapshot,
  RacerSummary,
  ThemeDefinition
} from "@roller-rumble/shared/types";
import { DEFAULT_WHEEL_CIRCUMFERENCE_METERS } from "@roller-rumble/shared/constants";
import { themes } from "@roller-rumble/shared/themes";
import { applyThemeToDocument } from "@roller-rumble/shared-ui/theme";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { RaceGraphic } from "../components/race-graphics";

// The lab feeds RaceGraphic synthetic racers/metrics and drives the cues by hand
// (glow/flash/streak intensity overrides), so position and brightness are
// decoupled from the live speed signal. Each companion cue (leading-edge glow,
// lead-change flash, speed streaks, and the upcoming top-speed flare) gets its own
// control section here as it lands.

const TARGET_DISTANCE_METERS = 1000;
const SPRITE_PEDAL_SPEED_KPH = 22;
const SPRITE_PEDAL_RPM = Math.round(
  ((SPRITE_PEDAL_SPEED_KPH / 3.6) * 60) / DEFAULT_WHEEL_CIRCUMFERENCE_METERS
);
const LAB_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const RACER_A_ID = "glow-lab-a";
const RACER_B_ID = "glow-lab-b";

interface GlowDesign {
  lengthRem: number;
  girthRem: number;
  blurRem: number;
  scaleBase: number;
  scaleGain: number;
  opacity: number;
  headOverlapRem: number;
  headStopPct: number;
}

const DEFAULT_DESIGN: GlowDesign = {
  lengthRem: 13,
  girthRem: 5.5,
  blurRem: 0.5,
  scaleBase: 0.55,
  scaleGain: 0.85,
  opacity: 1,
  headOverlapRem: 1.1,
  headStopPct: 16
};

interface FlashDesign {
  sizeRem: number;
  blurRem: number;
  scaleBase: number;
  scaleGain: number;
  opacity: number;
}

const DEFAULT_FLASH_DESIGN: FlashDesign = {
  sizeRem: 9,
  blurRem: 0.4,
  scaleBase: 0.6,
  scaleGain: 0.9,
  opacity: 1
};

interface StreakDesign {
  lengthRem: number;
  girthRem: number;
  lineRem: number;
  gapRem: number;
  blurRem: number;
  opacity: number;
  headOverlapRem: number;
}

const DEFAULT_STREAK_DESIGN: StreakDesign = {
  lengthRem: 11,
  girthRem: 4.5,
  lineRem: 0.32,
  gapRem: 0.7,
  blurRem: 0.12,
  opacity: 0.85,
  headOverlapRem: 0.6
};

interface RacerControl {
  name: string;
  positionPct: number;
  glow: number;
  flash: number;
  streak: number;
}

interface GlowLabState {
  themeId: string;
  laneColorsFlipped: boolean;
  headToHead: boolean;
  racerA: RacerControl;
  racerB: RacerControl;
  design: GlowDesign;
  flashDesign: FlashDesign;
  streakDesign: StreakDesign;
}

const initialState: GlowLabState = {
  themeId: themes[0]?.id ?? "",
  laneColorsFlipped: false,
  headToHead: true,
  racerA: { name: "Orange", positionPct: 62, glow: 0.85, flash: 0, streak: 0.9 },
  racerB: { name: "Purple", positionPct: 48, glow: 0, flash: 1, streak: 0.35 },
  design: DEFAULT_DESIGN,
  flashDesign: DEFAULT_FLASH_DESIGN,
  streakDesign: DEFAULT_STREAK_DESIGN
};

type GlowLabPatch =
  | Partial<Omit<GlowLabState, "racerA" | "racerB" | "design" | "flashDesign" | "streakDesign">>
  | { racerA: Partial<RacerControl> }
  | { racerB: Partial<RacerControl> }
  | { design: Partial<GlowDesign> }
  | { flashDesign: Partial<FlashDesign> }
  | { streakDesign: Partial<StreakDesign> };

function glowLabReducer(state: GlowLabState, patch: GlowLabPatch): GlowLabState {
  if ("racerA" in patch) {
    return { ...state, racerA: { ...state.racerA, ...patch.racerA } };
  }
  if ("racerB" in patch) {
    return { ...state, racerB: { ...state.racerB, ...patch.racerB } };
  }
  if ("design" in patch) {
    return { ...state, design: { ...state.design, ...patch.design } };
  }
  if ("flashDesign" in patch) {
    return { ...state, flashDesign: { ...state.flashDesign, ...patch.flashDesign } };
  }
  if ("streakDesign" in patch) {
    return { ...state, streakDesign: { ...state.streakDesign, ...patch.streakDesign } };
  }
  return { ...state, ...patch };
}

function makeRacerSummary(id: string, displayName: string): RacerSummary {
  return {
    racer: {
      id,
      displayName,
      avatarUrl: null,
      createdAt: LAB_TIMESTAMP,
      updatedAt: LAB_TIMESTAMP,
      identities: []
    },
    stats: {
      races: 0,
      wins: 0,
      eventRaces: 0,
      eventWins: 0,
      careerRaces: 0,
      careerEventCount: 0,
      topSpeedKph: 0,
      averageSpeedKph: 0,
      maxWattage: 0
    },
    payment: { status: "paid" }
  };
}

function makeMetric(
  racerId: string,
  lane: RaceMetricsSnapshot["lane"],
  positionPct: number
): RaceMetricsSnapshot {
  return {
    racerId,
    lane,
    rotationCount: 0,
    elapsedMs: 0,
    distanceMeters: (Math.max(0, Math.min(100, positionPct)) / 100) * TARGET_DISTANCE_METERS,
    rpm: SPRITE_PEDAL_RPM,
    currentSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    topSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    averageSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    wattage: 0,
    maxWattage: 0,
    finishedAtMs: null
  };
}

function designToStyle(
  design: GlowDesign,
  flashDesign: FlashDesign,
  streakDesign: StreakDesign
): CSSProperties {
  return {
    "--rr-glow-length": `${design.lengthRem}rem`,
    "--rr-glow-girth": `${design.girthRem}rem`,
    "--rr-glow-blur": `${design.blurRem}rem`,
    "--rr-glow-scale-base": design.scaleBase,
    "--rr-glow-scale-gain": design.scaleGain,
    "--rr-glow-opacity": design.opacity,
    "--rr-glow-head-overlap": `${design.headOverlapRem}rem`,
    "--rr-glow-head-stop": `${design.headStopPct}%`,
    "--rr-flash-size": `${flashDesign.sizeRem}rem`,
    "--rr-flash-blur": `${flashDesign.blurRem}rem`,
    "--rr-flash-scale-base": flashDesign.scaleBase,
    "--rr-flash-scale-gain": flashDesign.scaleGain,
    "--rr-flash-opacity": flashDesign.opacity,
    "--rr-streak-length": `${streakDesign.lengthRem}rem`,
    "--rr-streak-girth": `${streakDesign.girthRem}rem`,
    "--rr-streak-line": `${streakDesign.lineRem}rem`,
    "--rr-streak-gap": `${streakDesign.gapRem}rem`,
    "--rr-streak-blur": `${streakDesign.blurRem}rem`,
    "--rr-streak-opacity": streakDesign.opacity,
    "--rr-streak-head-overlap": `${streakDesign.headOverlapRem}rem`
  } as CSSProperties;
}

function streakDesignToCss(streakDesign: StreakDesign): string {
  return [
    ".race-lane__streak {",
    `  --rr-streak-length: ${streakDesign.lengthRem}rem;`,
    `  --rr-streak-girth: ${streakDesign.girthRem}rem;`,
    `  --rr-streak-line: ${streakDesign.lineRem}rem;`,
    `  --rr-streak-gap: ${streakDesign.gapRem}rem;`,
    `  --rr-streak-blur: ${streakDesign.blurRem}rem;`,
    `  --rr-streak-opacity: ${streakDesign.opacity};`,
    `  --rr-streak-head-overlap: ${streakDesign.headOverlapRem}rem;`,
    "}"
  ].join("\n");
}

function flashDesignToCss(flashDesign: FlashDesign): string {
  return [
    ".race-lane__flash {",
    `  --rr-flash-size: ${flashDesign.sizeRem}rem;`,
    `  --rr-flash-blur: ${flashDesign.blurRem}rem;`,
    `  --rr-flash-scale-base: ${flashDesign.scaleBase};`,
    `  --rr-flash-scale-gain: ${flashDesign.scaleGain};`,
    `  --rr-flash-opacity: ${flashDesign.opacity};`,
    "}"
  ].join("\n");
}

function designToCss(design: GlowDesign): string {
  return [
    ".race-lane__glow {",
    `  --rr-glow-length: ${design.lengthRem}rem;`,
    `  --rr-glow-girth: ${design.girthRem}rem;`,
    `  --rr-glow-blur: ${design.blurRem}rem;`,
    `  --rr-glow-scale-base: ${design.scaleBase};`,
    `  --rr-glow-scale-gain: ${design.scaleGain};`,
    `  --rr-glow-opacity: ${design.opacity};`,
    `  --rr-glow-head-overlap: ${design.headOverlapRem}rem;`,
    `  --rr-glow-head-stop: ${design.headStopPct}%;`,
    "}"
  ].join("\n");
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <div className="range-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
        <span>
          {value}
          {suffix ?? ""}
        </span>
      </div>
    </label>
  );
}

function RacerControls({
  heading,
  control,
  onPatch
}: {
  heading: string;
  control: RacerControl;
  onPatch: (patch: Partial<RacerControl>) => void;
}) {
  return (
    <Panel title={heading}>
      <div className="form-grid">
        <label>
          Name
          <input
            value={control.name}
            maxLength={24}
            onChange={(event) => {
              onPatch({ name: event.target.value });
            }}
          />
        </label>
        <RangeField
          label="Position"
          value={control.positionPct}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(positionPct) => {
            onPatch({ positionPct });
          }}
        />
        <RangeField
          label="Glow intensity"
          value={control.glow}
          min={0}
          max={1}
          step={0.01}
          onChange={(glow) => {
            onPatch({ glow });
          }}
        />
        <RangeField
          label="Flash intensity"
          value={control.flash}
          min={0}
          max={1}
          step={0.01}
          onChange={(flash) => {
            onPatch({ flash });
          }}
        />
        <RangeField
          label="Streak intensity"
          value={control.streak}
          min={0}
          max={1}
          step={0.01}
          onChange={(streak) => {
            onPatch({ streak });
          }}
        />
      </div>
    </Panel>
  );
}

function GlowDesignPanel({
  design,
  onPatch,
  onReset
}: {
  design: GlowDesign;
  onPatch: (patch: Partial<GlowDesign>) => void;
  onReset: () => void;
}) {
  return (
    <Panel
      title="Glow design"
      actions={
        <div className="panel-action-row">
          <Button variant="ghost" onClick={onReset}>
            Reset
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(designToCss(design));
            }}
          >
            Copy CSS
          </Button>
        </div>
      }
    >
      <div className="form-grid">
        <RangeField
          label="Trail length (behind rider)"
          value={design.lengthRem}
          min={2}
          max={20}
          step={0.5}
          suffix="rem"
          onChange={(lengthRem) => {
            onPatch({ lengthRem });
          }}
        />
        <RangeField
          label="Girth (across travel)"
          value={design.girthRem}
          min={2}
          max={20}
          step={0.5}
          suffix="rem"
          onChange={(girthRem) => {
            onPatch({ girthRem });
          }}
        />
        <RangeField
          label="Blur"
          value={design.blurRem}
          min={0}
          max={3}
          step={0.05}
          suffix="rem"
          onChange={(blurRem) => {
            onPatch({ blurRem });
          }}
        />
        <RangeField
          label="Scale at zero"
          value={design.scaleBase}
          min={0}
          max={2}
          step={0.05}
          onChange={(scaleBase) => {
            onPatch({ scaleBase });
          }}
        />
        <RangeField
          label="Scale gain"
          value={design.scaleGain}
          min={0}
          max={2}
          step={0.05}
          onChange={(scaleGain) => {
            onPatch({ scaleGain });
          }}
        />
        <RangeField
          label="Opacity ceiling"
          value={design.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => {
            onPatch({ opacity });
          }}
        />
        <RangeField
          label="Head overlap (ahead of rider)"
          value={design.headOverlapRem}
          min={0}
          max={4}
          step={0.1}
          suffix="rem"
          onChange={(headOverlapRem) => {
            onPatch({ headOverlapRem });
          }}
        />
        <RangeField
          label="Head bloom (solid before tail)"
          value={design.headStopPct}
          min={0}
          max={60}
          step={1}
          suffix="%"
          onChange={(headStopPct) => {
            onPatch({ headStopPct });
          }}
        />
        <pre className="glow-lab__css-readout">{designToCss(design)}</pre>
      </div>
    </Panel>
  );
}

function FlashDesignPanel({
  flashDesign,
  onPatch,
  onReset
}: {
  flashDesign: FlashDesign;
  onPatch: (patch: Partial<FlashDesign>) => void;
  onReset: () => void;
}) {
  return (
    <Panel
      title="Flash design"
      actions={
        <div className="panel-action-row">
          <Button variant="ghost" onClick={onReset}>
            Reset
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(flashDesignToCss(flashDesign));
            }}
          >
            Copy CSS
          </Button>
        </div>
      }
    >
      <div className="form-grid">
        <RangeField
          label="Burst size"
          value={flashDesign.sizeRem}
          min={3}
          max={20}
          step={0.5}
          suffix="rem"
          onChange={(sizeRem) => {
            onPatch({ sizeRem });
          }}
        />
        <RangeField
          label="Blur"
          value={flashDesign.blurRem}
          min={0}
          max={3}
          step={0.05}
          suffix="rem"
          onChange={(blurRem) => {
            onPatch({ blurRem });
          }}
        />
        <RangeField
          label="Scale at zero"
          value={flashDesign.scaleBase}
          min={0}
          max={2}
          step={0.05}
          onChange={(scaleBase) => {
            onPatch({ scaleBase });
          }}
        />
        <RangeField
          label="Scale gain"
          value={flashDesign.scaleGain}
          min={0}
          max={2}
          step={0.05}
          onChange={(scaleGain) => {
            onPatch({ scaleGain });
          }}
        />
        <RangeField
          label="Opacity ceiling"
          value={flashDesign.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => {
            onPatch({ opacity });
          }}
        />
        <pre className="glow-lab__css-readout">{flashDesignToCss(flashDesign)}</pre>
      </div>
    </Panel>
  );
}

function StreakDesignPanel({
  streakDesign,
  onPatch,
  onReset
}: {
  streakDesign: StreakDesign;
  onPatch: (patch: Partial<StreakDesign>) => void;
  onReset: () => void;
}) {
  return (
    <Panel
      title="Streak design"
      actions={
        <div className="panel-action-row">
          <Button variant="ghost" onClick={onReset}>
            Reset
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(streakDesignToCss(streakDesign));
            }}
          >
            Copy CSS
          </Button>
        </div>
      }
    >
      <div className="form-grid">
        <RangeField
          label="Trail length (behind rider)"
          value={streakDesign.lengthRem}
          min={2}
          max={24}
          step={0.5}
          suffix="rem"
          onChange={(lengthRem) => {
            onPatch({ lengthRem });
          }}
        />
        <RangeField
          label="Girth (across travel)"
          value={streakDesign.girthRem}
          min={1}
          max={16}
          step={0.5}
          suffix="rem"
          onChange={(girthRem) => {
            onPatch({ girthRem });
          }}
        />
        <RangeField
          label="Line thickness"
          value={streakDesign.lineRem}
          min={0.05}
          max={1.5}
          step={0.01}
          suffix="rem"
          onChange={(lineRem) => {
            onPatch({ lineRem });
          }}
        />
        <RangeField
          label="Gap between lines"
          value={streakDesign.gapRem}
          min={0.1}
          max={3}
          step={0.05}
          suffix="rem"
          onChange={(gapRem) => {
            onPatch({ gapRem });
          }}
        />
        <RangeField
          label="Blur"
          value={streakDesign.blurRem}
          min={0}
          max={2}
          step={0.02}
          suffix="rem"
          onChange={(blurRem) => {
            onPatch({ blurRem });
          }}
        />
        <RangeField
          label="Opacity ceiling"
          value={streakDesign.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => {
            onPatch({ opacity });
          }}
        />
        <RangeField
          label="Head overlap (under rider)"
          value={streakDesign.headOverlapRem}
          min={0}
          max={4}
          step={0.1}
          suffix="rem"
          onChange={(headOverlapRem) => {
            onPatch({ headOverlapRem });
          }}
        />
        <pre className="glow-lab__css-readout">{streakDesignToCss(streakDesign)}</pre>
      </div>
    </Panel>
  );
}

export function GlowLabPage() {
  const [state, dispatch] = useReducer(glowLabReducer, initialState);
  const {
    themeId,
    laneColorsFlipped,
    headToHead,
    racerA,
    racerB,
    design,
    flashDesign,
    streakDesign
  } = state;
  const selectedTheme: ThemeDefinition = themes.find((theme) => theme.id === themeId) ?? themes[0];
  const orientation = selectedTheme.orientation;

  useEffect(() => {
    applyThemeToDocument(selectedTheme);
  }, [selectedTheme]);

  useEffect(() => {
    document.body.classList.add("route-glow-lab");
    return () => {
      document.body.classList.remove("route-glow-lab");
    };
  }, []);

  const racers = headToHead
    ? [makeRacerSummary(RACER_A_ID, racerA.name), makeRacerSummary(RACER_B_ID, racerB.name)]
    : [makeRacerSummary(RACER_A_ID, racerA.name)];
  const metrics = headToHead
    ? [
        makeMetric(RACER_A_ID, "left", racerA.positionPct),
        makeMetric(RACER_B_ID, "right", racerB.positionPct)
      ]
    : [makeMetric(RACER_A_ID, "solo", racerA.positionPct)];
  const glowIntensityOverride: Record<string, number> = headToHead
    ? { [RACER_A_ID]: racerA.glow, [RACER_B_ID]: racerB.glow }
    : { [RACER_A_ID]: racerA.glow };
  // No lead-change flash in a solo race — there is no one to overtake.
  const flashIntensityOverride: Record<string, number> = headToHead
    ? { [RACER_A_ID]: racerA.flash, [RACER_B_ID]: racerB.flash }
    : { [RACER_A_ID]: 0 };
  // Streaks are per-rider absolute speed — no opponent needed, so they show solo too.
  const streakIntensityOverride: Record<string, number> = headToHead
    ? { [RACER_A_ID]: racerA.streak, [RACER_B_ID]: racerB.streak }
    : { [RACER_A_ID]: racerA.streak };

  function setBothGlows(a: number, b: number): void {
    dispatch({ racerA: { glow: a } });
    dispatch({ racerB: { glow: b } });
  }

  function setBothFlashes(a: number, b: number): void {
    dispatch({ racerA: { flash: a } });
    dispatch({ racerB: { flash: b } });
  }

  function setBothStreaks(a: number, b: number): void {
    dispatch({ racerA: { streak: a } });
    dispatch({ racerB: { streak: b } });
  }

  return (
    <div className="glow-lab">
      <header className="glow-lab__header">
        <div>
          <h1>Glow Lab</h1>
          <p>
            Dial in the leading-edge glow, lead-change flash, and speed streaks by hand across every
            race graphic. Position each racer, set each lane&apos;s glow, flash, and streak levels,
            and tune the shape live. The relative-speed glow signal, standings-based flash trigger,
            and absolute-speed streak signal that drive these in real races are covered separately
            by the reducer unit tests.
          </p>
        </div>
      </header>

      <div className="glow-lab__body">
        <div
          className={`glow-lab__stage race-page race-page--${orientation}`}
          style={designToStyle(design, flashDesign, streakDesign)}
        >
          <RaceGraphic
            theme={selectedTheme}
            racers={racers}
            metrics={metrics}
            targetDistanceMeters={TARGET_DISTANCE_METERS}
            laneColorsFlipped={laneColorsFlipped}
            glowMode="rivalry"
            glowIntensityOverride={glowIntensityOverride}
            flashIntensityOverride={flashIntensityOverride}
            streakIntensityOverride={streakIntensityOverride}
          />
        </div>

        <aside className="glow-lab__controls">
          <Panel title="Stage">
            <div className="form-grid">
              <label>
                Theme / race graphic
                <select
                  value={themeId}
                  onChange={(event) => {
                    dispatch({ themeId: event.target.value });
                  }}
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.label} — {theme.raceGraphic.variant} ({theme.orientation})
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={headToHead}
                  onChange={(event) => {
                    dispatch({ headToHead: event.target.checked });
                  }}
                />
                Head-to-head (two lanes)
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={laneColorsFlipped}
                  onChange={(event) => {
                    dispatch({ laneColorsFlipped: event.target.checked });
                  }}
                />
                Flip lane colors
              </label>
            </div>
          </Panel>

          <Panel title="Quick looks">
            <div className="button-row glow-lab__quick-looks">
              <Button variant="ghost" onClick={() => setBothGlows(0, 0)}>
                Both dark
              </Button>
              <Button variant="ghost" onClick={() => setBothGlows(1, 0)}>
                {racerA.name} leads
              </Button>
              <Button variant="ghost" onClick={() => setBothGlows(0, 1)} disabled={!headToHead}>
                {racerB.name} leads
              </Button>
              <Button variant="ghost" onClick={() => setBothGlows(0.5, 0.5)}>
                Both mid
              </Button>
            </div>
          </Panel>

          <Panel title="Flash quick looks">
            <div className="button-row glow-lab__quick-looks">
              <Button variant="ghost" onClick={() => setBothFlashes(0, 0)}>
                No flash
              </Button>
              <Button variant="ghost" onClick={() => setBothFlashes(1, 0)}>
                {racerA.name} passes
              </Button>
              <Button variant="ghost" onClick={() => setBothFlashes(0, 1)} disabled={!headToHead}>
                {racerB.name} passes
              </Button>
            </div>
          </Panel>

          <Panel title="Streak quick looks">
            <div className="button-row glow-lab__quick-looks">
              <Button variant="ghost" onClick={() => setBothStreaks(0, 0)}>
                Standstill
              </Button>
              <Button variant="ghost" onClick={() => setBothStreaks(1, 0.35)}>
                {racerA.name} flying
              </Button>
              <Button variant="ghost" onClick={() => setBothStreaks(1, 1)}>
                Both fast
              </Button>
            </div>
          </Panel>

          <RacerControls
            heading={`${racerA.name} (top lane)`}
            control={racerA}
            onPatch={(patch) => {
              dispatch({ racerA: patch });
            }}
          />

          {headToHead ? (
            <RacerControls
              heading={`${racerB.name} (bottom lane)`}
              control={racerB}
              onPatch={(patch) => {
                dispatch({ racerB: patch });
              }}
            />
          ) : null}

          <GlowDesignPanel
            design={design}
            onPatch={(patch) => {
              dispatch({ design: patch });
            }}
            onReset={() => {
              dispatch({ design: DEFAULT_DESIGN });
            }}
          />

          <FlashDesignPanel
            flashDesign={flashDesign}
            onPatch={(patch) => {
              dispatch({ flashDesign: patch });
            }}
            onReset={() => {
              dispatch({ flashDesign: DEFAULT_FLASH_DESIGN });
            }}
          />

          <StreakDesignPanel
            streakDesign={streakDesign}
            onPatch={(patch) => {
              dispatch({ streakDesign: patch });
            }}
            onReset={() => {
              dispatch({ streakDesign: DEFAULT_STREAK_DESIGN });
            }}
          />

          <Panel title="Future cues">
            <div className="stack-sm glow-lab__future">
              <p>
                Room for the companion indicators that build on the same foundation. Controls land
                here as each cue ships.
              </p>
              <ul>
                <li>Top-speed flare — flash on a new personal top speed</li>
              </ul>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
