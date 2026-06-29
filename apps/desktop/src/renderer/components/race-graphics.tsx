import { m, useReducedMotion } from "framer-motion";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  RaceGlowMode,
  RaceMetricsSnapshot,
  RacerSummary,
  ThemeDefinition
} from "@roller-rumble/shared/types";
import { resolveBackendAssetUrl } from "../lib/assets";
import { useLaneGlow } from "../lib/use-lane-glow";
import { RaceSpriteAvatar } from "./race-sprite-avatar";
import { getRaceSpriteDisplaySize } from "./race-sprite-sizing";

interface RaceGraphicProps {
  theme: ThemeDefinition;
  racers: RacerSummary[];
  metrics: RaceMetricsSnapshot[];
  targetDistanceMeters: number;
  laneColorsFlipped: boolean;
  glowMode: RaceGlowMode;
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

function progress(distanceMeters: number, targetDistanceMeters: number): number {
  return Math.max(0, Math.min(100, (distanceMeters / targetDistanceMeters) * 100));
}

function resolveMetric(
  metrics: RaceMetricsSnapshot[],
  racerId: string
): RaceMetricsSnapshot | undefined {
  return metrics.find((metric) => metric.racerId === racerId);
}

function formatSpeed(value: number | undefined): string {
  return `${(value ?? 0).toFixed(1)} km/h`;
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

/** Merge the per-lane glow intensity into a marker's inline style as a CSS variable. */
function withGlowIntensity(base: CSSProperties, intensity: number): CSSProperties {
  return { ...base, "--lane-glow-intensity": intensity } as CSSProperties;
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
      ) : null}
      <AutoFitRacerName name={racer.displayName} />
    </div>
  );
}

function LaneReadout({
  metric,
  targetDistanceMeters
}: {
  metric?: RaceMetricsSnapshot;
  targetDistanceMeters: number;
}) {
  return (
    <div className="race-lane__readout">
      <div className="race-lane__readout-item race-lane__readout-item--distance">
        <span>Distance</span>
        <strong>
          {Math.round(metric?.distanceMeters ?? 0)} / {Math.round(targetDistanceMeters)}m
        </strong>
      </div>
      <div className="race-lane__readout-item">
        <span>Speed</span>
        <strong>{formatSpeed(metric?.currentSpeedKph)}</strong>
      </div>
      <div className="race-lane__readout-item">
        <span>Top</span>
        <strong>{formatSpeed(metric?.topSpeedKph)}</strong>
      </div>
    </div>
  );
}

export function RaceGraphic({
  theme,
  racers,
  metrics,
  targetDistanceMeters,
  laneColorsFlipped,
  glowMode
}: RaceGraphicProps) {
  const prefersReducedMotion = useReducedMotion();
  const glowIntensityByRacerId = useLaneGlow({
    metrics,
    mode: glowMode,
    prefersReducedMotion: prefersReducedMotion ?? false
  });
  const viewportHeight = useViewportHeight();
  const { raceGraphic } = theme;
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
                  style={withGlowIntensity(
                    { bottom: markerBottom },
                    glowIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneGlow />
                  <RaceSpriteAvatar
                    displayHeightRem={spriteDisplayHeightRem}
                    label={entry.racer.displayName}
                    metric={metric}
                    theme={theme}
                  />
                </m.div>
              </div>
              <div className="climb-lane__summary">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} targetDistanceMeters={targetDistanceMeters} />
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
              <div className="ledger-lane__header race-lane__header">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} targetDistanceMeters={targetDistanceMeters} />
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
                  style={withGlowIntensity(
                    { left: markerLeft },
                    glowIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneGlow />
                  <RaceSpriteAvatar
                    displayHeightRem={spriteDisplayHeightRem}
                    label={entry.racer.displayName}
                    metric={metric}
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
              <div className="wagon-lane__header race-lane__header">
                <LaneIdentity racer={entry.racer} />
                <LaneReadout metric={metric} targetDistanceMeters={targetDistanceMeters} />
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
                  style={withGlowIntensity(
                    { left: markerLeft },
                    glowIntensityByRacerId[entry.racer.id] ?? 0
                  )}
                >
                  <LaneGlow />
                  <RaceSpriteAvatar
                    displayHeightRem={spriteDisplayHeightRem}
                    label={entry.racer.displayName}
                    metric={metric}
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
    <div className="race-graphic race-graphic--horizontal">
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
            className={getLaneClassName("track-lane", index, laneColorsFlipped)}
          >
            <div className="track-lane__header race-lane__header">
              <LaneIdentity racer={entry.racer} />
              <LaneReadout metric={metric} targetDistanceMeters={targetDistanceMeters} />
            </div>
            <div className="track-lane__bar">
              <m.div
                className="track-lane__fill"
                data-race-motion="true"
                initial={false}
                animate={{ width: percentageValue }}
                transition={progressTransition}
              />
              <m.div
                className="track-lane__marker"
                data-race-motion="true"
                initial={false}
                animate={{ left: markerLeft }}
                transition={progressTransition}
                style={withGlowIntensity(
                  { left: markerLeft },
                  glowIntensityByRacerId[entry.racer.id] ?? 0
                )}
              >
                <LaneGlow />
                <RaceSpriteAvatar
                  displayHeightRem={spriteDisplayHeightRem}
                  label={entry.racer.displayName}
                  metric={metric}
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
