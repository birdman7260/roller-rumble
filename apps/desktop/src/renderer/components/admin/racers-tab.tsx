import type { Dispatch, SetStateAction } from "react";
import type { RacerSummary } from "@roller-rumble/shared/types";
import { Button, Panel, TextInput } from "@roller-rumble/shared-ui";
import { removeRacerFromUpcoming, signUpQueue, updateRacerPayment } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { useMasonryGrid } from "../../lib/use-masonry-grid";

export function RacersTab({
  filteredRacers,
  search,
  setSearch,
  racerName,
  setRacerName,
  racerEmail,
  setRacerEmail,
  racerPhone,
  setRacerPhone,
  onQuickAddRacer,
  paymentRequiredForQueue
}: {
  filteredRacers: RacerSummary[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  racerName: string;
  setRacerName: Dispatch<SetStateAction<string>>;
  racerEmail: string;
  setRacerEmail: Dispatch<SetStateAction<string>>;
  racerPhone: string;
  setRacerPhone: Dispatch<SetStateAction<string>>;
  onQuickAddRacer: () => void;
  paymentRequiredForQueue: boolean;
}) {
  const quickAddNameId = "quick-add-racer-name";
  const quickAddEmailId = "quick-add-racer-email";
  const quickAddPhoneId = "quick-add-racer-phone";
  const gridRef = useMasonryGrid();

  return (
    <div ref={gridRef} className="page-grid page-grid--masonry">
      <Panel title="Quick Add Racer">
        <div className="form-grid">
          <label htmlFor={quickAddNameId}>
            Name
            <TextInput
              id={quickAddNameId}
              value={racerName}
              onChange={(event) => {
                setRacerName(event.target.value);
              }}
              placeholder="Alex Fast"
            />
          </label>
          <label htmlFor={quickAddEmailId}>
            Email
            <TextInput
              id={quickAddEmailId}
              value={racerEmail}
              onChange={(event) => {
                setRacerEmail(event.target.value);
              }}
              placeholder="alex@example.com"
            />
          </label>
          <label htmlFor={quickAddPhoneId}>
            Phone
            <TextInput
              id={quickAddPhoneId}
              value={racerPhone}
              onChange={(event) => {
                setRacerPhone(event.target.value);
              }}
              placeholder="555-0100"
            />
          </label>
          <Button
            onClick={() => {
              onQuickAddRacer();
            }}
          >
            Add Racer
          </Button>
        </div>
      </Panel>

      <Panel title="Registered Racers">
        <div className="form-row">
          <TextInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Search racers"
          />
        </div>
        <div className="list">
          {filteredRacers.map((entry) => (
            <div key={entry.racer.id} className="list-row">
              <div>
                <strong>{entry.racer.displayName}</strong>
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
