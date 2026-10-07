import type { Dispatch, SetStateAction } from "react";
import type { RacerSummary } from "@roller-rumble/shared/types";
import { Button, Panel, TextInput } from "@roller-rumble/shared-ui";
import { removeRacerFromUpcoming, signUpQueue, updateRacerPayment } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { useMasonryGrid } from "../../lib/use-masonry-grid";
import { QuickAddRacerPanel } from "./quick-add-racer";

/** Operator-only `contact details`; racer phones never receive these. */
function RacerContactDetails({ racer }: { racer: RacerSummary["racer"] }) {
  const details = [racer.realName, racer.phone, racer.email].filter(Boolean);
  return details.length > 0 ? <p className="muted">{details.join(" · ")}</p> : null;
}

export function RacersTab({
  filteredRacers,
  search,
  setSearch,
  paymentRequiredForQueue
}: {
  filteredRacers: RacerSummary[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  paymentRequiredForQueue: boolean;
}) {
  const gridRef = useMasonryGrid();

  return (
    <div ref={gridRef} className="page-grid page-grid--masonry">
      <QuickAddRacerPanel />

      <Panel title="Registered Racers">
        <div className="form-row">
          <TextInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Search name, phone, or email"
            aria-label="Search racers"
          />
        </div>
        <div className="list">
          {filteredRacers.map((entry) => (
            <div key={entry.racer.id} className="list-row">
              <div>
                <strong>{entry.racer.displayName}</strong>
                <RacerContactDetails racer={entry.racer} />
                <p>
                  {entry.stats.races} races · {entry.stats.wins} wins
                </p>
                {paymentRequiredForQueue ? <p>Entrance fee: {entry.payment.status}</p> : null}
              </div>
              <div className="button-row">
                {paymentRequiredForQueue ? (
                  <>
                    {entry.payment.status === "unpaid" ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            fireAndForget(
                              updateRacerPayment(entry.racer.id, { status: "paid" }),
                              "mark racer paid"
                            );
                          }}
                        >
                          Mark Paid
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            fireAndForget(
                              updateRacerPayment(entry.racer.id, { status: "waived" }),
                              "waive racer payment"
                            );
                          }}
                        >
                          Waive
                        </Button>
                      </>
                    ) : null}
                    {entry.payment.status === "paid" ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          fireAndForget(
                            updateRacerPayment(entry.racer.id, { status: "unpaid" }),
                            "mark racer unpaid"
                          );
                        }}
                      >
                        Unpaid
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  onClick={() => {
                    fireAndForget(
                      signUpQueue({ racerId: entry.racer.id, requestedType: "auto-match" })
                    );
                  }}
                >
                  Add To Queue
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    fireAndForget(signUpQueue({ racerId: entry.racer.id, requestedType: "solo" }));
                  }}
                >
                  Solo Run
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    fireAndForget(removeRacerFromUpcoming(entry.racer.id));
                  }}
                >
                  Remove from Upcoming
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
