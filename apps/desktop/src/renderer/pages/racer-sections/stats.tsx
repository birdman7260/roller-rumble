import type { QueueEntry, RacerSummary, TournamentBundle } from "@roller-rumble/shared/types";
import { describeQueueEntry } from "../../lib/snapshot-display";
import { formatFinishTime } from "./shared";

function RacerStat({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="racer-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function ExpandedRacerStats({
  entry,
  upcoming,
  visibleTournament
}: {
  entry: RacerSummary;
  upcoming: QueueEntry[];
  visibleTournament: TournamentBundle | null;
}) {
  const racerQueueEntries = upcoming
    .filter((queueEntry) => queueEntry.racerIds.includes(entry.racer.id))
    .toSorted((left, right) => left.position - right.position);
  const tournamentSeed = visibleTournament?.seeds.find((seed) => seed.racerId === entry.racer.id);

  return (
    <div className="racer-detail stack-md">
      <div className="racer-detail-stat-grid">
        <RacerStat
          label="Event Record"
          value={`${entry.stats.eventWins}-${Math.max(0, entry.stats.eventRaces - entry.stats.eventWins)}`}
          detail={`${entry.stats.eventRaces} event races`}
        />
        <RacerStat
          label="Career Record"
          value={`${entry.stats.wins}-${Math.max(0, entry.stats.races - entry.stats.wins)}`}
          detail={`${entry.stats.careerRaces} total races`}
        />
        <RacerStat label="Best Finish" value={formatFinishTime(entry.stats.bestFinishTimeMs)} />
        <RacerStat label="Top Speed" value={`${entry.stats.topSpeedKph.toFixed(1)} km/h`} />
        <RacerStat label="Average Speed" value={`${entry.stats.averageSpeedKph.toFixed(1)} km/h`} />
        <RacerStat label="Peak Power" value={`${entry.stats.maxWattage.toFixed(0)}W`} />
        <RacerStat label="Events Raced" value={String(entry.stats.careerEventCount)} />
      </div>

      <div className="racer-detail-section">
        <h3>Queue</h3>
        {racerQueueEntries.length === 0 ? (
          <p>No active queue entries.</p>
        ) : (
          <div className="list">
            {racerQueueEntries.map((queueEntry) => (
              <div key={queueEntry.id} className="list-row">
                <strong>Position #{queueEntry.position}</strong>
                <span>{describeQueueEntry(queueEntry)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {visibleTournament ? (
        <div className="racer-detail-section">
          <h3>Tournament</h3>
          {tournamentSeed ? (
            <p>
              Seed #{tournamentSeed.seed} in {visibleTournament.tournament.name} ·{" "}
              {visibleTournament.tournament.status}
            </p>
          ) : (
            <p>Not seeded in {visibleTournament.tournament.name}.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
