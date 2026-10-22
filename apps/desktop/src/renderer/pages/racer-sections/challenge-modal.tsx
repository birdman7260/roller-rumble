import type { Racer } from "@roller-rumble/shared/types";
import { Button, Modal, SearchableSelect } from "@roller-rumble/shared-ui";
import { useId, useState } from "react";

type ChallengeableRacer = Pick<Racer, "id" | "displayName">;

/** Mounted only while open, so every opening starts with no opponent picked. */
function ChallengeModalContent({
  racers,
  selectedRacerId,
  pendingOpponentRacerId,
  onCancel,
  onChallenge
}: ChallengeModalContentProps) {
  const inputId = useId();
  const [opponentRacerId, setOpponentRacerId] = useState("");
  const busy = pendingOpponentRacerId !== null;

  return (
    <Modal
      open
      className="racer-challenge-modal"
      eyebrow="Challenge"
      title="Who are you calling out?"
      dismissDisabled={busy}
      onDismiss={onCancel}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!opponentRacerId}
            busy={busy}
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
          disabled={busy}
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

interface ChallengeModalContentProps {
  racers: ChallengeableRacer[];
  selectedRacerId: string;
  /** The challenge still waiting on the server; the picker holds until it answers. */
  pendingOpponentRacerId: string | null;
  onCancel: () => void;
  onChallenge: (opponentRacerId: string) => void;
}

/** Picks the racer to challenge; the challenge itself is queued by `onChallenge`. */
export function ChallengeModal({ open, ...props }: ChallengeModalContentProps & { open: boolean }) {
  return open ? <ChallengeModalContent {...props} /> : null;
}
