import { type CSSProperties, useEffect, useReducer } from "react";
import type {
  RaceMetricsSnapshot,
  RacerSummary,
  ThemeDefinition
} from "@roller-rumble/shared/types";
import { themes } from "@roller-rumble/shared/themes";
import { applyThemeToDocument } from "@roller-rumble/shared-ui/theme";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { RaceGraphic } from "../components/race-graphics";

// The lab feeds RaceGraphic synthetic racers/metrics and drives the glow by hand
// (glowIntensityOverride), so position and brightness are decoupled from the live
// speed signal. Future indicator cues (lead-change flash, top-speed flare, speed
// streaks) get their own control sections here as they land.

const TARGET_DISTANCE_METERS = 1000;
const SPRITE_PEDAL_SPEED_KPH = 22;
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
  corePct: number;
  edgePct: number;
}

const DEFAULT_DESIGN: GlowDesign = {
  lengthRem: 11,
  girthRem: 6,
  blurRem: 0.5,
  scaleBase: 0.6,
  scaleGain: 0.75,
  opacity: 1,
  corePct: 26,
  edgePct: 74
};

interface RacerControl {
  name: string;
  positionPct: number;
  glow: number;
}

interface GlowLabState {
  themeId: string;
  laneColorsFlipped: boolean;
  headToHead: boolean;
  racerA: RacerControl;
  racerB: RacerControl;
  design: GlowDesign;
}

const initialState: GlowLabState = {
  themeId: themes[0]?.id ?? "",
  laneColorsFlipped: false,
  headToHead: true,
  racerA: { name: "Orange", positionPct: 62, glow: 0.85 },
  racerB: { name: "Purple", positionPct: 48, glow: 0 },
  design: DEFAULT_DESIGN
};

type GlowLabPatch =
  | Partial<Omit<GlowLabState, "racerA" | "racerB" | "design">>
  | { racerA: Partial<RacerControl> }
  | { racerB: Partial<RacerControl> }
  | { design: Partial<GlowDesign> };

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
    currentSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    topSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    averageSpeedKph: SPRITE_PEDAL_SPEED_KPH,
    wattage: 0,
    maxWattage: 0,
    finishedAtMs: null
  };
}

function designToStyle(design: GlowDesign): CSSProperties {
  return {
    "--rr-glow-length": `${design.lengthRem}rem`,
    "--rr-glow-girth": `${design.girthRem}rem`,
    "--rr-glow-blur": `${design.blurRem}rem`,
    "--rr-glow-scale-base": design.scaleBase,
    "--rr-glow-scale-gain": design.scaleGain,
    "--rr-glow-opacity": design.opacity,
    "--rr-glow-core": `${design.corePct}%`,
    "--rr-glow-edge": `${design.edgePct}%`
  } as CSSProperties;
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
    `  --rr-glow-core: ${design.corePct}%;`,
    `  --rr-glow-edge: ${design.edgePct}%;`,
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
      </div>
    </Panel>
  );
}

export function GlowLabPage() {
  const [state, dispatch] = useReducer(glowLabReducer, initialState);
  const { themeId, laneColorsFlipped, headToHead, racerA, racerB, design } = state;
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

  function setBothGlows(a: number, b: number): void {
    dispatch({ racerA: { glow: a } });
    dispatch({ racerB: { glow: b } });
  }

  return (
    <div className="glow-lab">
      <header className="glow-lab__header">
        <div>
          <h1>Glow Lab</h1>
          <p>
            Dial in the leading-edge glow by hand across every race graphic. Position each racer,
            set each lane&apos;s glow level, and tune the shape live. The relative-speed signal that
            drives the glow in real races is covered separately by the reducer unit tests.
          </p>
        </div>
      </header>

      <div className="glow-lab__body">
        <div
          className={`glow-lab__stage race-page race-page--${orientation}`}
          style={designToStyle(design)}
        >
          <RaceGraphic
            theme={selectedTheme}
            racers={racers}
            metrics={metrics}
            targetDistanceMeters={TARGET_DISTANCE_METERS}
            laneColorsFlipped={laneColorsFlipped}
            glowMode="rivalry"
            glowIntensityOverride={glowIntensityOverride}
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

          <Panel
            title="Glow design"
            actions={
              <div className="panel-action-row">
                <Button
                  variant="ghost"
                  onClick={() => {
                    dispatch({ design: DEFAULT_DESIGN });
                  }}
                >
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
                label="Length (along travel)"
                value={design.lengthRem}
                min={2}
                max={20}
                step={0.5}
                suffix="rem"
                onChange={(lengthRem) => {
                  dispatch({ design: { lengthRem } });
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
                  dispatch({ design: { girthRem } });
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
                  dispatch({ design: { blurRem } });
                }}
              />
              <RangeField
                label="Scale at zero"
                value={design.scaleBase}
                min={0}
                max={2}
                step={0.05}
                onChange={(scaleBase) => {
                  dispatch({ design: { scaleBase } });
                }}
              />
              <RangeField
                label="Scale gain"
                value={design.scaleGain}
                min={0}
                max={2}
                step={0.05}
                onChange={(scaleGain) => {
                  dispatch({ design: { scaleGain } });
                }}
              />
              <RangeField
                label="Opacity ceiling"
                value={design.opacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(opacity) => {
                  dispatch({ design: { opacity } });
                }}
              />
              <RangeField
                label="Core (clear center)"
                value={design.corePct}
                min={0}
                max={60}
                step={1}
                suffix="%"
                onChange={(corePct) => {
                  dispatch({ design: { corePct } });
                }}
              />
              <RangeField
                label="Edge (fade out)"
                value={design.edgePct}
                min={40}
                max={100}
                step={1}
                suffix="%"
                onChange={(edgePct) => {
                  dispatch({ design: { edgePct } });
                }}
              />
              <pre className="glow-lab__css-readout">{designToCss(design)}</pre>
            </div>
          </Panel>

          <Panel title="Future cues">
            <div className="stack-sm glow-lab__future">
              <p>
                Room for the companion indicators that build on the same foundation. Controls land
                here as each cue ships.
              </p>
              <ul>
                <li>Lead-change flash — burst when the distance lead flips</li>
                <li>Top-speed flare — flash on a new personal top speed</li>
                <li>Speed streaks — motion lines scaled to absolute speed</li>
              </ul>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
