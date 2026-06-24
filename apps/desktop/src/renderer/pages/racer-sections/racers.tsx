import type {
  AppSnapshot,
  QueueEntry,
  RacerSummary,
  TournamentBundle
} from "@roller-rumble/shared/types";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import { resolveBackendAssetUrl } from "../../lib/assets";
import { ExpandedRacerStats } from "./stats";
import type { SectionMotionProps } from "./shared";

export function RacersTab({
  liveSnapshot,
  onChallengeRacer,
  reduceMotion,
  selectedRacer,
  selectedRacerId,
  setSelectedRacerDetailId,
  tournamentMode,
  upcoming,
  visibleSelectedRacerDetailId,
  visibleTournament,
  layoutTransition,
  supportingCardMotion
}: SectionMotionProps & {
  liveSnapshot: AppSnapshot;
  onChallengeRacer: (opponentRacerId: string) => void;
  reduceMotion: boolean;
  selectedRacer?: RacerSummary | null;
  selectedRacerId: string;
  setSelectedRacerDetailId: (racerId: string | null) => void;
  tournamentMode: boolean;
  upcoming: QueueEntry[];
  visibleSelectedRacerDetailId: string | null;
  visibleTournament: TournamentBundle | null;
}) {
  return (
    <m.div
      key="racer-list"
      layout="position"
      transition={layoutTransition}
      {...supportingCardMotion}
      className="racer-page-grid__card racer-page-grid__card--supporting"
    >
      <Panel title="Event Racers">
        <div className="list">
          {liveSnapshot.racers.map((entry) => {
            const isExpanded = visibleSelectedRacerDetailId === entry.racer.id;
            const rowAvatarUrl = resolveBackendAssetUrl(entry.racer.avatarUrl);
            return (
              <m.div
                key={entry.racer.id}
                layout="position"
                className={`list-row racer-list-row${
                  isExpanded ? " racer-list-row--expanded" : ""
                }`}
              >
                <div className="racer-list-row__header">
                  <button
                    type="button"
                    className="racer-list-row__main"
                    aria-expanded={isExpanded}
                    onClick={() => {
                      setSelectedRacerDetailId(isExpanded ? null : entry.racer.id);
                    }}
                  >
                    {rowAvatarUrl ? (
                      <m.img
                        layout
                        className={`racer-list-row__avatar${
                          isExpanded ? " racer-list-row__avatar--expanded" : ""
                        }`}
                        src={rowAvatarUrl}
                        alt={entry.racer.displayName}
                      />
                    ) : null}
                    <span className="racer-list-row__identity">
                      <strong>{entry.racer.displayName}</strong>
                      {!isExpanded ? (
                        <p>
                          {entry.stats.races} races - {entry.stats.topSpeedKph.toFixed(1)} km/h top
                          speed - {entry.stats.maxWattage.toFixed(0)}W peak
                        </p>
                      ) : null}
                    </span>
                  </button>
                  {selectedRacer && entry.racer.id !== selectedRacerId && !tournamentMode ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onChallengeRacer(entry.racer.id);
                      }}
                    >
                      Challenge
                    </Button>
                  ) : null}
                </div>
                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <m.div
                      key="expanded-racer-stats"
                      className="racer-list-row__expanded"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    >
                      <ExpandedRacerStats
                        entry={entry}
                        upcoming={upcoming}
                        visibleTournament={visibleTournament}
                      />
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </m.div>
            );
          })}
        </div>
      </Panel>
    </m.div>
  );
}
