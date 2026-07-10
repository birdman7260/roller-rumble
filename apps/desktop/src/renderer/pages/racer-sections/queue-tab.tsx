import type { AppSnapshot, QueueEntry, RacerSummary } from "@roller-rumble/shared/types";
import { EmptyState, Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import { resolveRacerName } from "../../lib/snapshot-display";
import { QueueActions } from "./queue-actions";
import type { RacerQueueSignupInput, SectionMotionProps } from "./shared";

function getQueuePositionLabel(index: number): string {
  switch (index) {
    case 0:
      return "NOW!";
    case 1:
      return "In 2 minutes";
    case 2:
      return "In 4 minutes";
    case 3:
      return "Get the mind right";
    case 4:
      return "Start stretching";
    default:
      return "";
  }
}

export function QueueTab({
  liveSnapshot,
  onQueueSignup,
  paymentReturnState,
  queueMessage,
  selectedOpponent,
  selectedRacer,
  selectedRacerId,
  setSelectedOpponent,
  tournamentMode,
  upcoming,
  layoutTransition,
  supportingCardMotion
}: SectionMotionProps & {
  liveSnapshot: AppSnapshot;
  onQueueSignup: (input: RacerQueueSignupInput) => Promise<void>;
  paymentReturnState: string | null;
  queueMessage: string | null;
  selectedOpponent: string;
  selectedRacer?: RacerSummary | null;
  selectedRacerId: string;
  setSelectedOpponent: (value: string) => void;
  tournamentMode: boolean;
  upcoming: QueueEntry[];
}) {
  return (
    <>
      {tournamentMode ? (
        <m.div
          key="racer-queue-paused"
          layout="position"
          transition={layoutTransition}
          {...supportingCardMotion}
          className="racer-page-grid__card racer-page-grid__card--supporting"
        >
          <Panel title="Tournament Mode">
            <EmptyState title="Open queue paused" body="Tourney in progress" />
          </Panel>
        </m.div>
      ) : null}
      <m.div
        key="racer-upcoming"
        layout="position"
        transition={layoutTransition}
        {...supportingCardMotion}
        className="racer-page-grid__card racer-page-grid__card--supporting"
      >
        <Panel title="Upcoming Races">
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming races"
              body={
                tournamentMode
                  ? "Open race queueing is paused while the tournament is active."
                  : "The queue is open. Be the first racer to jump in."
              }
            />
          ) : (
            <div className={`list${tournamentMode ? " racer-queue-list--paused" : ""}`}>
              {upcoming.map((entry, index) => (
                <div key={entry.id} className="list-row">
                  <strong>
                    #{entry.position}{" "}
                    {entry.racerIds
                      .map((racerId) => resolveRacerName(liveSnapshot, racerId))
                      .join(" vs ")}
                  </strong>
                  <span>{getQueuePositionLabel(index)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </m.div>
      {selectedRacer && !tournamentMode ? (
        <m.div
          key="racer-queue-controls"
          layout="position"
          transition={layoutTransition}
          {...supportingCardMotion}
          className="racer-page-grid__card racer-page-grid__card--supporting"
        >
          <Panel title="Queue Controls">
            <QueueActions
              liveSnapshot={liveSnapshot}
              onQueueSignup={onQueueSignup}
              paymentReturnState={paymentReturnState}
              queueMessage={queueMessage}
              selectedOpponent={selectedOpponent}
              selectedRacer={selectedRacer}
              selectedRacerId={selectedRacerId}
              setSelectedOpponent={setSelectedOpponent}
            />
          </Panel>
        </m.div>
      ) : null}
    </>
  );
}
