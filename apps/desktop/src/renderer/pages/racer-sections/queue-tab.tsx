import type { AppSnapshot, QueueEntry, RacerSummary } from "@roller-rumble/shared/types";
import { EmptyState, Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import { describeQueueEntry, resolveRacerName } from "../../lib/snapshot-display";
import { QueueActions } from "./queue-actions";
import type { RacerQueueSignupInput, SectionMotionProps } from "./shared";

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
            <EmptyState
              title="Open queue paused"
              body="The event is currently running a tournament. The open queue is visible for reference, but racers cannot join it until tournament mode ends."
            />
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
              {upcoming.map((entry) => (
                <div key={entry.id} className="list-row">
                  <strong>
                    #{entry.position}{" "}
                    {entry.racerIds
                      .map((racerId) => resolveRacerName(liveSnapshot, racerId))
                      .join(" vs ")}
                  </strong>
                  <span>{describeQueueEntry(entry)}</span>
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
