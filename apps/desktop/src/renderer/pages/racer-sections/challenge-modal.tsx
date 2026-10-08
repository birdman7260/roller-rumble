import type { Racer } from "@roller-rumble/shared/types";
import { Button, Modal, SearchableSelect } from "@roller-rumble/shared-ui";
import { useId, useState } from "react";

type ChallengeableRacer = Pick<Racer, "id" | "displayName">;

/** Mounted only while open, so every opening starts with no opponent picked. */
function ChallengeModalContent({
  racers,
  selectedRacerId,
  onCancel,
  onChallenge
}: {
  racers: ChallengeableRacer[];
  selectedRacerId: string;
  onCancel: () => void;
  onChallenge: (opponentRacerId: string) => void;
}) {
  const inputId = useId();
  const [opponentRacerId, setOpponentRacerId] = useState("");

  return (
    <Modal
      open
      className="racer-challenge-modal"
      eyebrow="Challenge"
      title="Who are you calling out?"
      onDismiss={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!opponentRacerId}
            onClick={() => {
              onChallenge(opponentRacerId);
            }}
          >
            Challenge
          </Button>
        </>
      }
    >
      <div className="racer-challenge-modal__field">
        <label className="racer-picker-label" htmlFor={inputId}>
          Opponent
        </label>
        <SearchableSelect
          id={inputId}
          value={opponentRacerId}
          placeholder="Type a racer's name"
          options={racers.flatMap((racer) =>
            racer.id === selectedRacerId ? [] : [{ value: racer.id, label: racer.displayName }]
          )}
          onValueChange={setOpponentRacerId}
          noResultsText="No racers match that search"
        />
      </div>
    </Modal>
  );
}

/** Picks the racer to challenge; the challenge itself is queued by `onChallenge`. */
export function ChallengeModal({
  open,
  ...props
}: {
  open: boolean;
  racers: ChallengeableRacer[];
  selectedRacerId: string;
  onCancel: () => void;
  onChallenge: (opponentRacerId: string) => void;
}) {
  return open ? <ChallengeModalContent {...props} /> : null;
}
