import type {
  RaceMetricsSnapshot,
  RaceParticipant,
  RaceRecord,
  RacerSummary
} from "@goldsprints/shared/types";
import { Panel } from "@goldsprints/shared-ui";
import { motion } from "framer-motion";

function formatSpeed(value: number | undefined): string {
  return `${(value ?? 0).toFixed(1)} km/h`;
}

function formatWattage(value: number | undefined): string {
  return `${Math.round(value ?? 0)} W`;
}

function formatPukeFactor(metric: RaceMetricsSnapshot | undefined): string {
  if (!metric) {
    return "0.0 / 10";
  }

  // Puke factor is intentionally a show-friendly effort score, not a physiological diagnosis.
  // It weights sustained pace, peak speed, and peak wattage into a capped 10-point scale.
  const effortScore =
    metric.averageSpeedKph * 0.09 + metric.topSpeedKph * 0.035 + metric.maxWattage * 0.004;
  return `${Math.max(0, Math.min(10, effortScore)).toFixed(1)} / 10`;
}

function getMetricForRacer(
  metrics: RaceMetricsSnapshot[],
  racerId: string
): RaceMetricsSnapshot | undefined {
  return metrics.find((metric) => metric.racerId === racerId);
}

function getParticipantLaneClass(participant: RaceParticipant): string {
  if (participant.lane === "right") {
    return "race-page__result-card--right";
  }

  return "race-page__result-card--left";
}

function getOrderedResultParticipants(race: RaceRecord): RaceParticipant[] {
  const laneOrder: Record<RaceParticipant["lane"], number> = {
    left: 0,
    solo: 0,
    right: 1
  };

  return [...race.participants].sort((left, right) => laneOrder[left.lane] - laneOrder[right.lane]);
}

export function RaceResultsOverlay({
  race,
  racers,
  winnerRacerId
}: {
  race: RaceRecord;
  racers: RacerSummary[];
  winnerRacerId: string;
}) {
  const resultParticipants = getOrderedResultParticipants(race);

  return (
    <motion.div
      className="race-page__results-overlay"
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -12 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="race-page__results-modal">
        <h2>WINNER!</h2>
        <div
          className={`race-page__results-grid ${
            resultParticipants.length === 1 ? "race-page__results-grid--solo" : ""
          }`}
        >
          {resultParticipants.map((participant) => {
            const racerSummary = racers.find((entry) => entry.racer.id === participant.racerId);
            const metric = getMetricForRacer(race.metrics, participant.racerId);
            const isWinner = participant.racerId === winnerRacerId;
            const stats = racerSummary?.stats;
            const isRaceAlreadyCounted = race.state === "finished" || race.finishedAt != null;
            const todayRaces =
              (stats?.eventRaces ?? stats?.races ?? 0) + (isRaceAlreadyCounted ? 0 : 1);
            const todayWins =
              (stats?.eventWins ?? stats?.wins ?? 0) + (!isRaceAlreadyCounted && isWinner ? 1 : 0);
            const careerRaces =
              (stats?.careerRaces ?? stats?.races ?? 0) + (isRaceAlreadyCounted ? 0 : 1);
            const careerEventCount = stats?.careerEventCount ?? 1;

            return (
              <Panel
                key={participant.racerId}
                className={`panel--glass race-page__result-card ${getParticipantLaneClass(
                  participant
                )} ${isWinner ? "race-page__result-card--winner" : ""}`}
              >
                <div className="race-page__result-identity">
                  {racerSummary?.racer.avatarUrl ? (
                    <img
                      className="race-page__result-avatar"
                      src={racerSummary.racer.avatarUrl}
                      alt={racerSummary.racer.displayName}
                    />
                  ) : (
                    <span className="race-page__result-avatar">
                      {racerSummary?.racer.displayName[0] ?? "?"}
                    </span>
                  )}
                  <div>
                    <span>
                      {isWinner ? "Winner" : participant.lane === "solo" ? "Solo Run" : "Racer"}
                    </span>
                    <strong>{racerSummary?.racer.displayName ?? "Unknown Racer"}</strong>
                  </div>
                </div>
                <dl className="race-page__result-stats">
                  <div>
                    <dt>Top Speed</dt>
                    <dd>{formatSpeed(metric?.topSpeedKph)}</dd>
                  </div>
                  <div>
                    <dt>Avg Speed</dt>
                    <dd>{formatSpeed(metric?.averageSpeedKph)}</dd>
                  </div>
                  <div>
                    <dt>Puke Factor</dt>
                    <dd>{formatPukeFactor(metric)}</dd>
                  </div>
                  <div>
                    <dt>Wattage</dt>
                    <dd>{formatWattage(metric?.maxWattage)}</dd>
                  </div>
                  <div>
                    <dt>Races Today</dt>
                    <dd>{todayRaces}</dd>
                  </div>
                  <div>
                    <dt>Wins Today</dt>
                    <dd>{todayWins}</dd>
                  </div>
                  {careerEventCount > 1 ? (
                    <div>
                      <dt>Career Races</dt>
                      <dd>{careerRaces}</dd>
                    </div>
                  ) : null}
                </dl>
              </Panel>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
