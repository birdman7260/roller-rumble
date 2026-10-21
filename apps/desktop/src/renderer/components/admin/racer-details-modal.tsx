import type { RacerSummary } from "@roller-rumble/shared/types";
import { Button, Modal } from "@roller-rumble/shared-ui";
import { removeRacerFromUpcoming, signUpQueue, updateRacerPayment } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { formatBestFinish, formatPower, formatSpeed } from "../../lib/race-format";
import { paymentStatusLabels } from "./payment-status-labels";

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="racer-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ContactField({ label, value }: { label: string; value: string | null }) {
  // Contact details are optional, and a blank one reads the same as a missing one.
  const given = value?.trim() ? value : null;
  return (
    <div className="racer-profile__field">
      <dt>{label}</dt>
      <dd className={given ? undefined : "muted"}>{given ?? "Not given"}</dd>
    </div>
  );
}

function EntranceFeeActions({ entry }: { entry: RacerSummary }) {
  const racerId = entry.racer.id;
  const { status } = entry.payment;

  return (
    <section className="racer-profile__section">
      <h3>Entrance fee · {paymentStatusLabels[status]}</h3>
      <div className="racer-profile__actions">
        {status === "unpaid" || status === "refunded" ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                fireAndForget(updateRacerPayment(racerId, { status: "paid" }), "mark racer paid");
              }}
            >
              Mark Paid
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                fireAndForget(
                  updateRacerPayment(racerId, { status: "waived" }),
                  "waive racer payment"
                );
              }}
            >
              Waive
            </Button>
          </>
        ) : null}
        {status === "paid" ? (
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(updateRacerPayment(racerId, { status: "unpaid" }), "mark racer unpaid");
            }}
          >
            Unpaid
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Everything the operator knows about one racer, plus every action beyond the row's Queue button.
 * Payment changes keep it open so the new status shows; queue changes close it.
 */
export function RacerDetailsModal({
  entry,
  paymentRequiredForQueue,
  onClose
}: {
  entry: RacerSummary;
  paymentRequiredForQueue: boolean;
  onClose: () => void;
}) {
  const { racer, stats } = entry;

  return (
    <Modal
      open
      eyebrow="Racer"
      title={racer.displayName}
      className="confirm-modal--wide"
      dismissOnBackdropClick
      onDismiss={onClose}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="racer-profile">
        <dl className="racer-profile__contact">
          <ContactField label="Real name" value={racer.realName} />
          <ContactField label="Phone" value={racer.phone} />
          <ContactField label="Email" value={racer.email} />
        </dl>

        <section className="racer-profile__section">
          <h3>This event</h3>
          <div className="racer-detail-stat-grid">
            <DetailStat label="Races" value={String(stats.eventRaces)} />
            <DetailStat label="Wins" value={String(stats.eventWins)} />
            <DetailStat
              label="Fastest Time"
              value={formatBestFinish(stats.eventBestFinishTimeMs)}
            />
            <DetailStat label="Top Speed" value={formatSpeed(stats.eventTopSpeedKph)} />
            <DetailStat label="Average Speed" value={formatSpeed(stats.eventAverageSpeedKph)} />
            <DetailStat label="Max Power" value={formatPower(stats.eventMaxWattage)} />
          </div>
        </section>
        <p className="muted">
          Career: {stats.careerRaces} races across {stats.careerEventCount} events
        </p>

        {paymentRequiredForQueue ? <EntranceFeeActions entry={entry} /> : null}

        <section className="racer-profile__section">
          <h3>Queue</h3>
          <div className="racer-profile__actions">
            <Button
              variant="ghost"
              onClick={() => {
                fireAndForget(signUpQueue({ racerId: racer.id, requestedType: "solo" }));
                onClose();
              }}
            >
              Solo Run
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                fireAndForget(removeRacerFromUpcoming(racer.id));
                onClose();
              }}
            >
              Remove from Upcoming
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
