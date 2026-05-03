import { motion, useReducedMotion } from "framer-motion";
import type { RaceMetricsSnapshot, RacerSummary, ThemeDefinition } from "@shared/types";
import { RaceSpriteAvatar } from "./race-sprite-avatar";

interface RaceGraphicProps {
  theme: ThemeDefinition;
  racers: RacerSummary[];
  metrics: RaceMetricsSnapshot[];
  targetDistanceMeters: number;
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

export function RaceGraphic({ theme, racers, metrics, targetDistanceMeters }: RaceGraphicProps) {
  const prefersReducedMotion = useReducedMotion();
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

  if (theme.graphicId === "summit-climb") {
    return (
      <div className="race-graphic race-graphic--vertical">
        {racers.map((entry) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          return (
            <div key={entry.racer.id} className="climb-lane">
              <div className="climb-lane__track">
                <motion.div
                  className="climb-lane__fill"
                  data-race-motion="true"
                  initial={false}
                  animate={{ height: percentageValue }}
                  transition={progressTransition}
                />
                <motion.div
                  className="climb-lane__rider"
                  data-race-motion="true"
                  initial={false}
                  animate={{ bottom: `calc(${percentageValue} - 1.625rem)` }}
                  transition={progressTransition}
                  style={{ bottom: `calc(${percentageValue} - 1.625rem)` }}
                >
                  <RaceSpriteAvatar label={entry.racer.displayName} metric={metric} theme={theme} />
                </motion.div>
              </div>
              <span className="climb-lane__name">{entry.racer.displayName}</span>
              <strong className="climb-lane__distance">
                {Math.round(metric?.distanceMeters ?? 0)} / {Math.round(targetDistanceMeters)}m
              </strong>
            </div>
          );
        })}
      </div>
    );
  }

  if (theme.graphicId === "trail-ledger") {
    // The DOS-inspired theme leans into a trail ledger/map readout instead of a modern progress bar.
    return (
      <div className="race-graphic race-graphic--ledger">
        {racers.map((entry, index) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          const trailRole =
            racers.length === 1 ? "Lead wagon" : index === 0 ? "Trail party A" : "Trail party B";

          return (
            <div key={entry.racer.id} className="ledger-lane">
              <div className="ledger-lane__header">
                <div className="ledger-lane__identity">
                  {entry.racer.avatarUrl ? (
                    <img
                      className="racer-avatar racer-avatar--small"
                      src={entry.racer.avatarUrl}
                      alt={entry.racer.displayName}
                    />
                  ) : (
                    <span className="racer-avatar racer-avatar--small">
                      {entry.racer.displayName[0]}
                    </span>
                  )}
                  <div className="ledger-lane__copy">
                    <strong>{entry.racer.displayName}</strong>
                    <span>{trailRole}</span>
                  </div>
                </div>
                <strong>
                  {Math.round(metric?.distanceMeters ?? 0)} / {Math.round(targetDistanceMeters)}m
                </strong>
              </div>
              <div className="ledger-lane__track">
                <div className="ledger-lane__sky" aria-hidden="true" />
                <div className="ledger-lane__terrain" aria-hidden="true" />
                <div className="ledger-lane__route" aria-hidden="true" />
                <div className="ledger-lane__mileposts" aria-hidden="true">
                  <span>INDEP.</span>
                  <span>FORT</span>
                  <span>OREGON</span>
                </div>
                <motion.div
                  className="ledger-lane__marker"
                  data-race-motion="true"
                  initial={false}
                  animate={{ left: `calc(${percentageValue} - 1.65rem)` }}
                  transition={progressTransition}
                  style={{ left: `calc(${percentageValue} - 1.65rem)` }}
                >
                  <RaceSpriteAvatar label={entry.racer.displayName} metric={metric} theme={theme} />
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (theme.graphicId === "wagon-trail") {
    return (
      <div className="race-graphic race-graphic--wagon">
        {racers.map((entry) => {
          const metric = resolveMetric(metrics, entry.racer.id);
          const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
          const percentageValue = `${percentage.toFixed(2)}%`;
          return (
            <div key={entry.racer.id} className="wagon-lane">
              <div className="wagon-lane__header">
                <div className="wagon-lane__identity">
                  {entry.racer.avatarUrl ? (
                    <img
                      className="racer-avatar racer-avatar--small"
                      src={entry.racer.avatarUrl}
                      alt={entry.racer.displayName}
                    />
                  ) : (
                    <span className="racer-avatar racer-avatar--small">
                      {entry.racer.displayName[0]}
                    </span>
                  )}
                  <div className="wagon-lane__copy">
                    <strong>{entry.racer.displayName}</strong>
                    <span>Heading west</span>
                  </div>
                </div>
                <strong>
                  {Math.round(metric?.distanceMeters ?? 0)} / {Math.round(targetDistanceMeters)}m
                </strong>
              </div>
              <div className="wagon-lane__track">
                <div className="wagon-lane__route" />
                <div className="wagon-lane__start">Camp</div>
                <div className="wagon-lane__finish">Fort</div>
                <div className="wagon-lane__milestones" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <motion.div
                  className="wagon-lane__marker"
                  data-race-motion="true"
                  initial={false}
                  animate={{ left: `calc(${percentageValue} - 1.625rem)` }}
                  transition={progressTransition}
                  style={{ left: `calc(${percentageValue} - 1.625rem)` }}
                >
                  <RaceSpriteAvatar label={entry.racer.displayName} metric={metric} theme={theme} />
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="race-graphic race-graphic--horizontal">
      {racers.map((entry) => {
        const metric = resolveMetric(metrics, entry.racer.id);
        const percentage = progress(metric?.distanceMeters ?? 0, targetDistanceMeters);
        const percentageValue = `${percentage.toFixed(2)}%`;
        return (
          <div key={entry.racer.id} className="track-lane">
            <div className="track-lane__header">
              <span>{entry.racer.displayName}</span>
              <strong>
                {Math.round(metric?.distanceMeters ?? 0)} / {Math.round(targetDistanceMeters)}m
              </strong>
            </div>
            <div className="track-lane__bar">
              <motion.div
                className="track-lane__fill"
                data-race-motion="true"
                initial={false}
                animate={{ width: percentageValue }}
                transition={progressTransition}
              />
              <motion.div
                className="track-lane__marker"
                data-race-motion="true"
                initial={false}
                animate={{ left: `calc(${percentageValue} - 1.625rem)` }}
                transition={progressTransition}
                style={{ left: `calc(${percentageValue} - 1.625rem)` }}
              >
                <RaceSpriteAvatar label={entry.racer.displayName} metric={metric} theme={theme} />
              </motion.div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
