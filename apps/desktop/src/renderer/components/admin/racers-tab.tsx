import type { Dispatch, SetStateAction } from "react";
import type { RacerSummary } from "@goldsprints/shared/types";
import { Button, Panel, TextInput } from "@goldsprints/shared-ui";
import { removeRacerFromUpcoming, signUpQueue, updateRacerPayment } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";

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
  return (
    <div className="page-grid">
      <Panel title="Quick Add Racer">
        <div className="form-grid">
          <label>
            Name
            <TextInput
              value={racerName}
              onChange={(event) => {
                setRacerName(event.target.value);
              }}
              placeholder="Alex Fast"
            />
          </label>
          <label>
            Email
            <TextInput
              value={racerEmail}
              onChange={(event) => {
                setRacerEmail(event.target.value);
              }}
              placeholder="alex@example.com"
            />
          </label>
          <label>
            Phone
            <TextInput
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
                  {entry.stats.races} races · {entry.stats.wins} wins ·{" "}
                  {entry.stats.topSpeedKph.toFixed(1)} km/h top
                </p>
                {paymentRequiredForQueue ? <p>Entrance fee: {entry.payment.status}</p> : null}
              </div>
              <div className="button-row">
                {paymentRequiredForQueue ? (
                  <>
                    <Button
                      variant={entry.payment.status === "paid" ? "accent" : "ghost"}
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
                      variant={entry.payment.status === "waived" ? "accent" : "ghost"}
                      onClick={() => {
                        fireAndForget(
                          updateRacerPayment(entry.racer.id, { status: "waived" }),
                          "waive racer payment"
                        );
                      }}
                    >
                      Waive
                    </Button>
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
