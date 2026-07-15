import type { AppSnapshot, QueueEntry, RacerSummary } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import { isLeavableByRacer, resolveRacerName } from "../../lib/snapshot-display";
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
  onRequestLeaveEntry,
  onRequestLeaveQueue,
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
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  onRequestLeaveQueue: () => void;
  paymentReturnState: string | null;
  queueMessage: string | null;
  selectedOpponent: string;
  selectedRacer?: RacerSummary | null;
  selectedRacerId: string;
  setSelectedOpponent: (value: string) => void;
  tournamentMode: boolean;
  upcoming: QueueEntry[];
}) {
  // Leaving is frozen during a tournament pause but stays available under a
  // closed queue — getting out is the opposite of joining (issue #28).
  const canLeave = Boolean(selectedRacer) && !tournamentMode;
  const hasQueuedSpot =
    canLeave && upcoming.some((entry) => isLeavableByRacer(entry, selectedRacerId));

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
                  {canLeave && isLeavableByRacer(entry, selectedRacerId) ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onRequestLeaveEntry(entry);
                      }}
                    >
                      Leave
                    </Button>
                  ) : null}
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
            {hasQueuedSpot ? (
              <div className="racer-queue-leave-all">
                <Button
                  variant="ghost"
                  onClick={() => {
                    onRequestLeaveQueue();
                  }}
                >
                  Leave the queue entirely
                </Button>
              </div>
            ) : null}
          </Panel>
        </m.div>
      ) : null}
    </>
  );
}
