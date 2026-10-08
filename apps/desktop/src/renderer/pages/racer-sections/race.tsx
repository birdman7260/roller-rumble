import { DEFAULT_QUEUE_CLOSED_MESSAGE } from "@roller-rumble/shared/constants";
import type {
  AppSnapshot,
  QueueEntry,
  RaceRecord,
  RacerSummary,
  TournamentBundle
} from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import type { ReactNode } from "react";
import {
  describeQueueEntry,
  isLeavableByRacer,
  resolveRacerName
} from "../../lib/snapshot-display";
import { resolveBackendAssetUrl } from "../../lib/assets";
import { fireAndForget } from "../../lib/ui-actions";
import type { RacerTabId } from "../racer-page";
import { QueuePreviewPanel } from "./queue";
import { InlineTabLink } from "./inline-tab-link";
import type { TournamentRaceCard } from "./shared";

function TournamentRaceCardView({
  card,
  liveSnapshot
}: {
  card: TournamentRaceCard;
  liveSnapshot: AppSnapshot;
}) {
  const participants = [
    {
      id: card.racerAId ?? null,
      name: card.racerAId ? resolveRacerName(liveSnapshot, card.racerAId) : "TBD"
    },
    {
      id: card.racerBId ?? null,
      name: card.racerBId ? resolveRacerName(liveSnapshot, card.racerBId) : "TBD"
    }
  ];

  return (
    <div className={`tournament-match-node tournament-match-node--${card.state}`}>
      <div className="tournament-match-node__meta">
        {card.roundLabel || card.kind === "group" ? (
          <div>
            {card.roundLabel ? <p className="eyebrow">{card.roundLabel}</p> : null}
            {card.kind === "group" ? (
              <strong className="tournament-match-node__label">{card.label}</strong>
            ) : null}
          </div>
        ) : null}
        <span className="tournament-match-node__status">{card.state}</span>
      </div>
      <div className="tournament-match-node__body">
        {participants.map((participant, index) => {
          const racer = participant.id
            ? (liveSnapshot.racers.find((entry) => entry.racer.id === participant.id)?.racer ??
              null)
            : null;
          const avatarUrl = resolveBackendAssetUrl(racer?.avatarUrl);
          const participantName = participant.id ? participant.name : "TBD";
          return (
            <div
              key={participant.id ?? `${card.id}:${String(index)}`}
              className={`tournament-match-node__participant${
                participant.id && participant.id === card.winnerRacerId ? " winner" : ""
              }`}
            >
              <div className="tournament-match-node__identity">
                {avatarUrl ? (
                  <img
                    className="tournament-match-node__avatar"
                    src={avatarUrl}
                    alt={participantName}
                  />
                ) : (
                  <span className="tournament-match-node__avatar tournament-match-node__avatar--placeholder">
                    {participantName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="tournament-match-node__name">{participantName}</span>
              </div>
              <span className="tournament-match-node__result">
                {participant.id && participant.id === card.winnerRacerId
                  ? card.state === "bye"
                    ? "BYE"
                    : "ADV"
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TournamentRacePreview({
  activeTournament,
  liveSnapshot,
  onTabChange,
  tournamentRaceCards
}: {
  activeTournament: TournamentBundle | null;
  liveSnapshot: AppSnapshot;
  onTabChange: (tabId: RacerTabId) => void;
  tournamentRaceCards: TournamentRaceCard[];
}) {
  if (!activeTournament) {
    return null;
  }

  return (
    <Panel title="Current Matches">
      <div className="racer-tournament-preview stack-sm">
        <div className="racer-section-heading">
          <strong>{activeTournament.tournament.name}</strong>
          <p>Current stage matchups</p>
        </div>
        {tournamentRaceCards.length > 0 ? (
          <div className="racer-tournament-match-grid">
            {tournamentRaceCards.map((card) => (
              <TournamentRaceCardView key={card.id} card={card} liveSnapshot={liveSnapshot} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active tournament matches"
            body="The bracket will show the next stage as soon as the host advances the tournament."
          />
        )}
        <InlineTabLink tabId="tournament" label="View tournament" onTabChange={onTabChange} />
      </div>
    </Panel>
  );
}

export function RaceDashboard({
  activeTournament,
  canBrowsePublicRacerInfo,
  currentRace,
  currentRaceNames,
  liveSnapshot,
  onRequestLeaveQueue,
  onTabChange,
  onTournamentOptOut,
  paymentReturnState,
  queuePreviewEntries,
  selectedRacer,
  selectedRacerCanOptOutOfVisibleTournament,
  selectedRacerId,
  selectedRacerInCurrentRace,
  selectedRacerIsInActiveTournament,
  selectedRacerNextQueueEntry,
  showFullQueueLink,
  tournamentMode,
  tournamentOptOutBusy,
  tournamentOptOutMessage,
  tournamentRaceCards,
  upcoming,
  registration,
  visibleTournament
}: {
  activeTournament: TournamentBundle | null;
  canBrowsePublicRacerInfo: boolean;
  currentRace: RaceRecord | null;
  currentRaceNames: string | null;
  liveSnapshot: AppSnapshot;
  onRequestLeaveQueue: () => void;
  onTabChange: (tabId: RacerTabId) => void;
  onTournamentOptOut: () => Promise<void>;
  /** Set when a queue checkout returns to the racer page (`?payment=success|cancelled`). */
  paymentReturnState: string | null;
  queuePreviewEntries: QueueEntry[];
  /** The registration wizard, shown while this phone has no racer signed in. */
  registration: ReactNode;
  selectedRacer?: RacerSummary | null;
  selectedRacerCanOptOutOfVisibleTournament: boolean;
  selectedRacerId: string;
  selectedRacerInCurrentRace: boolean;
  selectedRacerIsInActiveTournament: boolean;
  selectedRacerNextQueueEntry?: QueueEntry | null;
  showFullQueueLink: boolean;
  tournamentMode: boolean;
  tournamentOptOutBusy: boolean;
  tournamentOptOutMessage: string | null;
  tournamentRaceCards: TournamentRaceCard[];
  upcoming: QueueEntry[];
  visibleTournament: TournamentBundle | null;
}) {
  // Leaving stays available under a closed queue, unlike joining (issue #28).
  const hasQueuedSpot =
    Boolean(selectedRacer) && upcoming.some((entry) => isLeavableByRacer(entry, selectedRacerId));
  const leaveQueueControl = hasQueuedSpot ? (
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
  ) : null;
  const tournamentPreview = (
    <TournamentRacePreview
      activeTournament={activeTournament}
      liveSnapshot={liveSnapshot}
      onTabChange={onTabChange}
      tournamentRaceCards={tournamentRaceCards}
    />
  );
  const queuePreview = (
    <QueuePreviewPanel
      entries={queuePreviewEntries}
      liveSnapshot={liveSnapshot}
      onTabChange={onTabChange}
      showFullQueueLink={showFullQueueLink}
    />
  );

  if (!selectedRacer) {
    if (!canBrowsePublicRacerInfo) {
      return <div className="racer-card-stack">{registration}</div>;
    }

    if (tournamentMode) {
      return (
        <div className="racer-card-stack">
          {tournamentPreview}
          <Panel title="Register">
            <div className="racer-signin-cta">
              <strong>Ready to ride?</strong>
              <Button variant="accent" onClick={() => onTabChange("me")}>
                Register
              </Button>
            </div>
          </Panel>
        </div>
      );
    }

    return (
      <div className="racer-card-stack">
        <Panel title="Roller Rumble">
          <div className="stack-md">
            <div className="racer-public-summary">
              <div>
                <span>Current race</span>
                <strong>{currentRaceNames ?? "No race staged"}</strong>
              </div>
              <div>
                <span>Queue</span>
                <strong>{upcoming.length} upcoming</strong>
              </div>
              <div>
                <span>Racers</span>
                <strong>{liveSnapshot.racers.length} checked in</strong>
              </div>
            </div>
            <div className="racer-signin-cta">
              <strong>Ready to ride?</strong>
              <Button variant="accent" onClick={() => onTabChange("me")}>
                Register
              </Button>
            </div>
          </div>
        </Panel>
        {queuePreview}
      </div>
    );
  }

  if (tournamentMode) {
    return (
      <div className="racer-card-stack">
        {selectedRacerIsInActiveTournament &&
        visibleTournament &&
        selectedRacerCanOptOutOfVisibleTournament ? (
          <Panel title="Tournament Spot">
            <div className="stack-sm">
              <div className="racer-section-heading">
                <strong>{visibleTournament.tournament.name}</strong>
                <p>You are seeded in this tournament.</p>
              </div>
              <Button
                variant="ghost"
                disabled={tournamentOptOutBusy}
                onClick={() => {
                  fireAndForget(onTournamentOptOut(), "opt out of tournament");
                }}
              >
                {tournamentOptOutBusy ? "Opting out..." : "Opt out"}
              </Button>
              {tournamentOptOutMessage ? <p>{tournamentOptOutMessage}</p> : null}
            </div>
          </Panel>
        ) : null}
        {tournamentPreview}
      </div>
    );
  }

  return (
    <div className="racer-card-stack">
      <Panel title="Roller Rumble">
        <div className="stack-md">
          {paymentReturnState === "success" ? (
            <p className="form-success">
              {selectedRacer.payment.status === "paid"
                ? "Payment confirmed. You are ready to race."
                : "Payment is processing. This updates as soon as Stripe confirms it."}
            </p>
          ) : null}
          {paymentReturnState === "cancelled" ? (
            <p className="form-error">Checkout was cancelled. You can try again.</p>
          ) : null}
          {selectedRacerInCurrentRace && currentRace ? (
            <div className="racer-state-card racer-state-card--urgent">
              <span>You're up</span>
              <strong>Go to the bikes</strong>
              <p>
                {currentRaceNames} · {currentRace.state}
              </p>
            </div>
          ) : selectedRacerNextQueueEntry ? (
            <div className="racer-state-card">
              <span>You're in the queue</span>
              <strong>Position #{selectedRacerNextQueueEntry.position}</strong>
              <p>{describeQueueEntry(selectedRacerNextQueueEntry)}</p>
            </div>
          ) : (
            <div className="racer-state-card">
              <span>Ready to ride</span>
              <strong>Not in the queue yet</strong>
              <p>
                {liveSnapshot.settings.queueOpen
                  ? "Tap Queue up below to get in the next race, or Challenge to pick your opponent."
                  : liveSnapshot.settings.queueClosedMessage.trim() || DEFAULT_QUEUE_CLOSED_MESSAGE}
              </p>
            </div>
          )}

          {selectedRacerIsInActiveTournament && visibleTournament ? (
            <div className="racer-state-card">
              <span>Tournament</span>
              <strong>{visibleTournament.tournament.name}</strong>
              <p>{visibleTournament.tournament.status}</p>
            </div>
          ) : null}

          {leaveQueueControl}
        </div>
      </Panel>
      {queuePreview}
    </div>
  );
}
