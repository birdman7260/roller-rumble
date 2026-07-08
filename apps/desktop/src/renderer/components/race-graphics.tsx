import { m, type Transition, useReducedMotion } from "framer-motion";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type {
  RaceGlowMode,
  RaceMetricsSnapshot,
  RacerSummary,
  RaceState,
  ThemeDefinition
} from "@roller-rumble/shared/types";
import { resolveBackendAssetUrl } from "../lib/assets";
import { getMonogram } from "../lib/monogram";
import { useLaneGlow } from "../lib/use-lane-glow";
import { useLeadChangeFlash } from "../lib/use-lead-change-flash";
import { useSpeedStreaks } from "../lib/use-speed-streaks";
import { RaceSpriteAvatar } from "./race-sprite-avatar";
import {
  computeMarkerSizeRem,
  getRaceSpriteDisplaySize,
  MARKER_SIZE_MAX_REM
} from "./race-sprite-sizing";

interface RaceGraphicProps {
  theme: ThemeDefinition;
  racers: RacerSummary[];
  metrics: RaceMetricsSnapshot[];
  targetDistanceMeters: number;
  laneColorsFlipped: boolean;
  glowMode: RaceGlowMode;
  /**
   * Current race lifecycle state. Drives the elapsed clock: it stays at zero
   * until the race is {@link RaceState `active`}, ticks while active, and freezes
   * once the race is finished or interrupted.
   */
  raceState?: RaceState;
  /**
   * ISO timestamp of when the race went live. The elapsed clock counts up from
   * this instant while the race is active.
   */
  startedAt?: string | null;
  /**
   * When provided, these per-racer intensities drive the glow directly instead
   * of the derived signal. Used by the glow lab to dial in the look by hand; the
   * race display leaves it unset so the live {@link useLaneGlow} signal wins.
   */
  glowIntensityOverride?: Record<string, number>;
  /**
   * When provided, these per-racer intensities drive the lead-change flash
   * directly instead of the derived event. Used by the glow lab to dial in the
   * burst look by hand; the race display leaves it unset so the live
   * {@link useLeadChangeFlash} signal wins.
   */
  flashIntensityOverride?: Record<string, number>;
  /**
   * When provided, these per-racer intensities drive the speed streaks directly
   * instead of the derived signal. Used by the glow lab to dial in the streak
   * look by hand; the race display leaves it unset so the live
   * {@link useSpeedStreaks} signal wins.
   */
  streakIntensityOverride?: Record<string, number>;
}

type RaceLaneColor = "orange" | "purple";

const FALLBACK_MIN_NAME_FONT_SIZE_PX = 22;

function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 1080 : window.innerHeight
  );

  useEffect(() => {
    function handleResize(): void {
      setHeight(window.innerHeight);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return height;
}

/**
 * Sizes the rider marker on the horizontal track variant as a continuous
 * function of the race graphic's measured height and publishes the result as the
 * `--race-marker-size` CSS variable on the graphic root. The same rem value is
 * returned so the sprite and the marker's horizontal offset math read one source
 * of truth — the layout reserves exactly the space the sprite occupies, so they
 * cannot disagree. `active` gates the observer to the horizontal track variant
 * and re-establishes it if the variant changes; the effect (not a per-render
 * callback ref) keeps the observer stable across the frequent race re-renders.
 */
function useMeasuredMarkerSize(active: boolean): {
  graphicRootRef: RefObject<HTMLDivElement | null>;
  markerSizeRem: number;
} {
  const graphicRootRef = useRef<HTMLDivElement | null>(null);
  const [markerSizeRem, setMarkerSizeRem] = useState(MARKER_SIZE_MAX_REM);

  useLayoutEffect(() => {
    const node = graphicRootRef.current;
    if (!active || !node) {
      return;
    }

    const element = node;
    const rootFontSizePx =
      Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

    function publish(heightPx: number): void {
      const sizeRem = computeMarkerSizeRem(heightPx, rootFontSizePx);
      element.style.setProperty("--race-marker-size", `${sizeRem}rem`);
      setMarkerSizeRem((current) => (Math.abs(current - sizeRem) < 0.001 ? current : sizeRem));
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) {
        publish(entry.contentRect.height);
      }
    });
    observer.observe(element);
    publish(element.getBoundingClientRect().height);

    return () => {
      observer.disconnect();
    };
  }, [active]);

  return { graphicRootRef, markerSizeRem };
}

function progress(distanceMeters: number, targetDistanceMeters: number): number {
  return Math.max(0, Math.min(100, (distanceMeters / targetDistanceMeters) * 100));
}

function resolveMetric(
  metrics: RaceMetricsSnapshot[],
  racerId: string
): RaceMetricsSnapshot | undefined {
  return metrics.find((metric) => metric.racerId === racerId);
}

function formatRpm(rpm: number | undefined): string {
  return `${Math.round(rpm ?? 0)}`;
}

function formatRaceDistance(targetDistanceMeters: number): string {
  return `${Math.round(targetDistanceMeters)} m`;
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, elapsedMs) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/**
 * The live race clock. It reads zero until the race is `active`, ticks up from
 * `startedAt` while active, and freezes at the final elapsed time once the race
 * finishes or is interrupted. Isolating the ticking state here keeps the
 * per-frame re-render scoped to this text node instead of the whole graphic.
 */
function RaceElapsedClock({
  raceState,
  startedAt,
  frozenElapsedMs
}: {
  raceState?: RaceState;
  startedAt?: string | null;
  frozenElapsedMs: number;
}) {
  const startedAtMs = startedAt ? new Date(startedAt).getTime() : null;
  const isLive = raceState === "active" && startedAtMs != null && !Number.isNaN(startedAtMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLive]);

  let elapsedMs = 0;
  if (isLive) {
    elapsedMs = nowMs - startedAtMs;
  } else if (raceState === "finished" || raceState === "interrupted") {
    elapsedMs = frozenElapsedMs;
  }

  return <strong className="race-graphic__meta-value">{formatElapsedTime(elapsedMs)}</strong>;
}

/**
 * Distance (left) and elapsed time (right) shown inside the race box, above both
 * lanes. Distance is the static target for the race; time is the live clock.
 */
function RaceMetaHeader({
  targetDistanceMeters,
  raceState,
  startedAt,
  metrics
}: {
  targetDistanceMeters: number;
  raceState?: RaceState;
  startedAt?: string | null;
  metrics: RaceMetricsSnapshot[];
}) {
  const frozenElapsedMs = metrics.reduce((max, metric) => Math.max(max, metric.elapsedMs), 0);

  return (
    <div className="race-graphic__meta">
      <div className="race-graphic__meta-item race-graphic__meta-item--distance">
        <span className="race-graphic__meta-label">Distance</span>
        <strong className="race-graphic__meta-value">
          {formatRaceDistance(targetDistanceMeters)}
        </strong>
      </div>
      <div className="race-graphic__meta-item race-graphic__meta-item--time">
        <span className="race-graphic__meta-label">Time</span>
        <RaceElapsedClock
          raceState={raceState}
          startedAt={startedAt}
          frozenElapsedMs={frozenElapsedMs}
        />
      </div>
    </div>
  );
}

function getHorizontalMarkerPosition(percentageValue: string, spriteWidthRem: number): string {
  return `clamp(0rem, calc(${percentageValue} - ${spriteWidthRem / 2}rem), calc(100% - ${spriteWidthRem}rem))`;
}

function getVerticalMarkerPosition(percentageValue: string, spriteHeightRem: number): string {
  return `clamp(0rem, calc(${percentageValue} - ${spriteHeightRem / 2}rem), calc(100% - ${spriteHeightRem}rem))`;
}

function getLaneColor(index: number, laneColorsFlipped: boolean): RaceLaneColor {
  const topLaneColor: RaceLaneColor = laneColorsFlipped ? "purple" : "orange";
  const secondaryLaneColor: RaceLaneColor = laneColorsFlipped ? "orange" : "purple";
  return index === 0 ? topLaneColor : secondaryLaneColor;
}

function getLaneClassName(
  baseClassName: string,
  index: number,
  laneColorsFlipped: boolean
): string {
  return `${baseClassName} race-lane race-lane--${getLaneColor(index, laneColorsFlipped)}`;
}

/** Merge the per-lane cue intensities into a marker's inline style as CSS variables. */
function withCueIntensities(
  base: CSSProperties,
  glowIntensity: number,
  flashIntensity: number,
  streakIntensity: number
): CSSProperties {
  return {
    ...base,
    "--lane-glow-intensity": glowIntensity,
    "--lane-flash-intensity": flashIntensity,
    "--lane-streak-intensity": streakIntensity
  } as CSSProperties;
}

/**
 * The leading-edge glow that attaches to a rider marker. It is a screen-blended
 * halo whose brightness is the lane's glow intensity, fed through the
 * `--lane-glow-intensity` CSS variable on the marker. Direction and shape are
 * styled per race-graphic variant in CSS, not here.
 */
function LaneGlow() {
  return <span className="race-lane__glow" aria-hidden="true" />;
}

/**
 * The lead-change flash that attaches to a rider marker. It is a screen-blended
 * burst in the lane's identity color whose brightness is the lane's flash
 * intensity, fed through the `--lane-flash-intensity` CSS variable on the marker.
 * It fires the instant the lane overtakes the other on distance (issue #7).
 */
function LaneFlash() {
  return <span className="race-lane__flash" aria-hidden="true" />;
}

/**
 * The speed streaks that attach to a rider marker. Motion lines trailing the
 * rider in the direction of travel, whose length and opacity scale with the
 * lane's *absolute* speed via the `--lane-streak-intensity` CSS variable on the
 * marker (issue #9). Direction is styled per race-graphic variant in CSS, not
 * here. This is the companion cue that carries raw speed, the dimension the
 * relative leading-edge glow deliberately omits.
 */
function LaneStreak() {
  return <span className="race-lane__streak" aria-hidden="true" />;
}

/**
 * The cue overlays and sprite that ride on a lane's progress marker. Every race
 * graphic variant renders the same cluster inside its marker, so it lives here
 * once instead of being repeated per variant.
 */
function LaneMarkerContent({
  entry,
  metric,
  spriteDisplayHeightRem,
  theme
}: {
  entry: RacerSummary;
  metric?: RaceMetricsSnapshot;
  spriteDisplayHeightRem: number;
  theme: ThemeDefinition;
}) {
  return (
    <>
      <LaneStreak />
      <LaneGlow />
      <LaneFlash />
      <RaceSpriteAvatar
        displayHeightRem={spriteDisplayHeightRem}
        label={entry.racer.displayName}
        metric={metric}
        theme={theme}
      />
    </>
  );
}

function AutoFitRacerName({ name }: { name: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const measuringRef = useRef<HTMLSpanElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measuringText = measuringRef.current;
    if (!container || !measuringText) {
      return;
    }

    const nameContainer = container;
    const nameMeasuringText = measuringText;
    let animationFrame = 0;
    let disposed = false;

    function fitName(): void {
      const availableWidth = nameContainer.getBoundingClientRect().width;
      const naturalWidth = nameMeasuringText.getBoundingClientRect().width;
      if (availableWidth <= 0 || naturalWidth <= 0) {
        return;
      }

      // Measure the name at its theme-defined max size, then shrink only as far
      // as needed before the normal CSS ellipsis takes over.
      const styles = window.getComputedStyle(nameMeasuringText);
      const maxFontSize = Number.parseFloat(styles.fontSize);
      const configuredMinimum = Number.parseFloat(
        styles.getPropertyValue("--race-lane-name-min-size-px")
      );
      const minFontSize = Number.isFinite(configuredMinimum)
        ? configuredMinimum
        : FALLBACK_MIN_NAME_FONT_SIZE_PX;
      const nextFontSize =
        naturalWidth > availableWidth
          ? Math.max(minFontSize, maxFontSize * (availableWidth / naturalWidth))
          : maxFontSize;

      setFontSizePx((current) =>
        current != null && Math.abs(current - nextFontSize) < 0.5 ? current : nextFontSize
      );
    }

    function queueFit(): void {
      if (disposed) {
        return;
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fitName);
    }

    const resizeObserver = new ResizeObserver(queueFit);
    resizeObserver.observe(nameContainer);
    queueFit();
    void document.fonts.ready.then(queueFit);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [name]);

  return (
    <span ref={containerRef} className="race-lane__name-wrap">
      <strong
        className="race-lane__name"
        style={fontSizePx == null ? undefined : { fontSize: `${fontSizePx}px` }}
        title={name}
      >
        {name}
      </strong>
      <span ref={measuringRef} className="race-lane__name-measure" aria-hidden="true">
        {name}
      </span>
    </span>
  );
}

function LaneIdentity({ racer }: { racer: RacerSummary["racer"] }) {
  const avatarUrl = resolveBackendAssetUrl(racer.avatarUrl);

  return (
    <div className="race-lane__identity">
      {avatarUrl ? (
        <img className="race-lane__avatar" src={avatarUrl} alt={racer.displayName} />
      ) : (
        <span className="race-lane__monogram" aria-hidden="true">
          {getMonogram(racer.displayName)}
        </span>
      )}
      <AutoFitRacerName name={racer.displayName} />
    </div>
  );
}

function LaneReadout({ metric }: { metric?: RaceMetricsSnapshot }) {
  return (
    <div className="race-lane__readout">
      <div className="race-lane__readout-item race-lane__readout-item--rpm">
        <span>RPM</span>
        <strong>{formatRpm(metric?.rpm)}</strong>
      </div>
    </div>
  );
}

/** Per-lane cue intensities (0..1) keyed by racer id, fed to a marker's overlays. */
interface CueIntensityMaps {
  flash: Record<string, number>;
  glow: Record<string, number>;
  streak: Record<string, number>;
}

/**
 * The horizontal track variant (issue #21). Each lane is a lane card above a
 * course — a marker zone stacked on the track bar — with the rider marker
 * bottom-anchored to the bar. `markerSizeRem` is the single measured size that
 * drives both the sprite and the offset math, so the reserved marker zone and
 * the sprite always agree.
 */
function HorizontalTrackRace({
  cueIntensities,
  graphicRootRef,
  laneColorsFlipped,
  markerSizeRem,
  metaHeader,
  metrics,
  progressTransition,
  racers,
  targetDistanceMeters,
  theme
}: {
  cueIntensities: CueIntensityMaps;
  graphicRootRef: RefObject<HTMLDivElement | null>;
  laneColorsFlipped: boolean;
  markerSizeRem: number;
  metaHeader: ReactNode;
  metrics: RaceMetricsSnapshot[];
  progressTransition: Transition;
  racers: RacerSummary[];
  targetDistanceMeters: number;
  theme: ThemeDefinition;
}) {
  return (
    <div ref={graphicRootRef} className="race-graphic race-graphic--horizontal">
      {metaHeader}
      {racers.map((entry, index) => {
        const metric = resolveMetric(metrics, entry.racer.id);
        const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
        const percentageValue = `${percentage.toFixed(2)}%`;
        const spriteSize = getRaceSpriteDisplaySize({
          displayHeightRem: markerSizeRem,
          metric,
          theme
        });
        const markerLeft = getHorizontalMarkerPosition(percentageValue, spriteSize.widthRem);
        return (
          <div
            key={entry.racer.id}
            className={getLaneClassName("track-lane", index, laneColorsFlipped)}
          >
            <div className="track-lane__card race-lane__card">
              <LaneIdentity racer={entry.racer} />
              <LaneReadout metric={metric} />
            </div>
            <div className="track-lane__course">
              <div className="track-lane__marker-zone" aria-hidden="true" />
              <div className="track-lane__bar">
                <m.div
                  className="track-lane__fill"
                  data-race-motion="true"
                  initial={false}
                  animate={{ width: percentageValue }}
                  transition={progressTransition}
                />
              </div>
              <m.div
                className="track-lane__marker"
                data-race-motion="true"
                initial={false}
                animate={{ left: markerLeft }}
                transition={progressTransition}
                style={withCueIntensities(
                  { left: markerLeft },
                  cueIntensities.glow[entry.racer.id] ?? 0,
                  cueIntensities.flash[entry.racer.id] ?? 0,
                  cueIntensities.streak[entry.racer.id] ?? 0
                )}
              >
                <LaneMarkerContent
                  entry={entry}
                  metric={metric}
                  spriteDisplayHeightRem={markerSizeRem}
                  theme={theme}
                />
              </m.div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RaceGraphic({
  theme,
  racers,
  metrics,
  targetDistanceMeters,
  laneColorsFlipped,
  glowMode,
  raceState,
  startedAt,
  glowIntensityOverride,
  flashIntensityOverride,
  streakIntensityOverride
}: RaceGraphicProps) {
  const metaHeader = (
    <RaceMetaHeader
      targetDistanceMeters={targetDistanceMeters}
      raceState={raceState}
      startedAt={startedAt}
      metrics={metrics}
    />
  );
  const prefersReducedMotion = useReducedMotion();
  const derivedGlowIntensity = useLaneGlow({
    metrics,
    mode: glowMode,
    prefersReducedMotion: prefersReducedMotion ?? false
  });
  const derivedFlashIntensity = useLeadChangeFlash({
    metrics,
    prefersReducedMotion: prefersReducedMotion ?? false
  });
  const derivedStreakIntensity = useSpeedStreaks({
    metrics,
    prefersReducedMotion: prefersReducedMotion ?? false
  });
  const glowIntensityByRacerId = glowIntensityOverride ?? derivedGlowIntensity;
  const flashIntensityByRacerId = flashIntensityOverride ?? derivedFlashIntensity;
  const streakIntensityByRacerId = streakIntensityOverride ?? derivedStreakIntensity;
  const viewportHeight = useViewportHeight();
  const { raceGraphic } = theme;
  // The final fallthrough branch renders the horizontal track variant — every
  // other variant (vertical, ledger, wagon/trail) returns earlier.
  const isHorizontalTrack =
    theme.orientation !== "vertical" &&
    raceGraphic.variant !== "ledger" &&
    raceGraphic.variant !== "trail";
  const { graphicRootRef, markerSizeRem: trackMarkerSizeRem } =
    useMeasuredMarkerSize(isHorizontalTrack);
  const spriteScale = viewportHeight <= 720 ? 0.72 : viewportHeight <= 820 ? 0.84 : 1;
  const spriteDisplayHeightRem = (theme.orientation === "vertical" ? 4.5 : 5.4) * spriteScale;
  // Keep one shared motion profile across themes so each graphic can style itself
  // differently without feeling like a completely different timing system.
  const progressTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        type: "spring" as const,
        stiffness: 180,
        damping: 24,
        mass: 0.8
      };

  if (theme.orientation === "vertical") {
    return (
      <div className={`race-graphic race-graphic--vertical race-graphic--${raceGraphic.variant}`}>
        {metaHeader}
        {racers.map((entry, index) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          const spriteSize = getRaceSpriteDisplaySize({
            displayHeightRem: spriteDisplayHeightRem,
            metric,
            theme
          });
          const markerBottom = getVerticalMarkerPosition(percentageValue, spriteSize.heightRem);
          return (
            <div
              key={entry.racer.id}
              className={getLaneClassName("climb-lane", index, laneColorsFlipped)}
            >
              <div className="climb-lane__track">
                <m.div
                  className="climb-lane__fill"
                  data-race-motion="true"
                  initial={false}
                  animate={{ height: percentageValue }}
                  transition={progressTransition}
                />
                <m.div
                  className="climb-lane__rider"
                  data-race-motion="true"
                  initial={false}
                  animate={{ bottom: markerBottom }}
                  transition={progressTransition}
                  style={withCueIntensities(
                    { bottom: markerBottom },
                    glowIntensityByRacerId[entry.racer.id] ?? 0,
                    flashIntensityByRacerId[entry.racer.id] ?? 0,
                    streakIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneMarkerContent
                    entry={entry}
                    metric={metric}
                    spriteDisplayHeightRem={spriteDisplayHeightRem}
                    theme={theme}
                  />
                </m.div>
              </div>
              <div className="climb-lane__summary">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (raceGraphic.variant === "ledger") {
    // Ledger-style themes present the race as a map readout while reusing the same live metrics.
    return (
      <div className="race-graphic race-graphic--ledger">
        {metaHeader}
        {racers.map((entry, index) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          const spriteSize = getRaceSpriteDisplaySize({
            displayHeightRem: spriteDisplayHeightRem,
            metric,
            theme
          });
          const markerLeft = getHorizontalMarkerPosition(percentageValue, spriteSize.widthRem);

          return (
            <div
              key={entry.racer.id}
              className={getLaneClassName("ledger-lane", index, laneColorsFlipped)}
            >
              <div className="ledger-lane__card race-lane__card">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} />
              </div>
              <div className="ledger-lane__track">
                <div className="ledger-lane__sky" aria-hidden="true" />
                <div className="ledger-lane__terrain" aria-hidden="true" />
                <div className="ledger-lane__route" aria-hidden="true" />
                <div className="ledger-lane__mileposts" aria-hidden="true">
                  <span>{raceGraphic.markers?.start ?? "Start"}</span>
                  <span>{raceGraphic.markers?.middle ?? "Mid"}</span>
                  <span>{raceGraphic.markers?.finish ?? "Finish"}</span>
                </div>
                <m.div
                  className="ledger-lane__marker"
                  data-race-motion="true"
                  initial={false}
                  animate={{ left: markerLeft }}
                  transition={progressTransition}
                  style={withCueIntensities(
                    { left: markerLeft },
                    glowIntensityByRacerId[entry.racer.id] ?? 0,
                    flashIntensityByRacerId[entry.racer.id] ?? 0,
                    streakIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneMarkerContent
                    entry={entry}
                    metric={metric}
                    spriteDisplayHeightRem={spriteDisplayHeightRem}
                    theme={theme}
                  />
                </m.div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (raceGraphic.variant === "trail") {
    return (
      <div className="race-graphic race-graphic--wagon">
        {metaHeader}
        {racers.map((entry, index) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          const spriteSize = getRaceSpriteDisplaySize({
            displayHeightRem: spriteDisplayHeightRem,
            metric,
            theme
          });
          const markerLeft = getHorizontalMarkerPosition(percentageValue, spriteSize.widthRem);
          return (
            <div
              key={entry.racer.id}
              className={getLaneClassName("wagon-lane", index, laneColorsFlipped)}
            >
              <div className="wagon-lane__card race-lane__card">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} />
              </div>
              <div className="wagon-lane__track">
                <div className="wagon-lane__route" />
                <div className="wagon-lane__start">{raceGraphic.markers?.start ?? "Start"}</div>
                <div className="wagon-lane__finish">{raceGraphic.markers?.finish ?? "Finish"}</div>
                <div className="wagon-lane__milestones" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <m.div
                  className="wagon-lane__marker"
                  data-race-motion="true"
                  initial={false}
                  animate={{ left: markerLeft }}
                  transition={progressTransition}
                  style={withCueIntensities(
                    { left: markerLeft },
                    glowIntensityByRacerId[entry.racer.id] ?? 0,
                    flashIntensityByRacerId[entry.racer.id] ?? 0,
                    streakIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneMarkerContent
                    entry={entry}
                    metric={metric}
                    spriteDisplayHeightRem={spriteDisplayHeightRem}
                    theme={theme}
                  />
                </m.div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <HorizontalTrackRace
      cueIntensities={{
        flash: flashIntensityByRacerId,
        glow: glowIntensityByRacerId,
        streak: streakIntensityByRacerId
      }}
      graphicRootRef={graphicRootRef}
      laneColorsFlipped={laneColorsFlipped}
      markerSizeRem={trackMarkerSizeRem}
      metaHeader={metaHeader}
      metrics={metrics}
      progressTransition={progressTransition}
      racers={racers}
      targetDistanceMeters={targetDistanceMeters}
      theme={theme}
    />
  );
}
