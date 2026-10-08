import type {
  AppSnapshot,
  QueueEntry,
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
import { getQueuePositionLabel } from "./queue-position-label";
import { RumbleQueuePanel } from "./rumble-queue";
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

/**
 * The signed-in racer's first spot in the queue. Renders nothing while they aren't in it.
 */
function NextRaceCard({
  liveSnapshot,
  onRequestLeaveQueue,
  selectedRacerId,
  upcoming
}: {
  liveSnapshot: AppSnapshot;
  onRequestLeaveQueue: () => void;
  selectedRacerId: string;
  upcoming: QueueEntry[];
}) {
  const racesAhead = upcoming.findIndex((entry) => entry.racerIds.includes(selectedRacerId));
  const nextEntry = racesAhead === -1 ? null : upcoming[racesAhead];
  // Leaving stays available under a closed queue, unlike joining (issue #28).
  const hasQueuedSpot = upcoming.some((entry) => isLeavableByRacer(entry, selectedRacerId));

  if (!nextEntry) {
    return null;
  }

  const opponentNames = nextEntry.racerIds.flatMap((racerId) =>
    racerId === selectedRacerId ? [] : [resolveRacerName(liveSnapshot, racerId)]
  );
  const timing = getQueuePositionLabel(racesAhead) || `${String(racesAhead)} races ahead`;

  return (
    <Panel title="Your Next Race" aria-label="Your next race">
      <div className="stack-md">
        <div className="racer-state-card">
          <span>{describeQueueEntry(nextEntry)}</span>
          <strong>
            {opponentNames.length > 0 ? `vs ${opponentNames.join(" & ")}` : "Your run"}
          </strong>
          <p>
            #{nextEntry.position} in line · {timing}
          </p>
        </div>
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
      </div>
    </Panel>
  );
}

function RegisterCta({ onTabChange }: { onTabChange: (tabId: RacerTabId) => void }) {
  return (
    <div className="racer-signin-cta">
      <strong>Ready to ride?</strong>
      <Button variant="accent" onClick={() => onTabChange("me")}>
        Register
      </Button>
    </div>
  );
}

function PublicSummaryPanel({
  currentRaceNames,
  liveSnapshot,
  onTabChange,
  upcomingCount
}: {
  currentRaceNames: string | null;
  liveSnapshot: AppSnapshot;
  onTabChange: (tabId: RacerTabId) => void;
  upcomingCount: number;
}) {
  return (
    <Panel title="Roller Rumble">
      <div className="stack-md">
        <div className="racer-public-summary">
          <div>
            <span>Current race</span>
            <strong>{currentRaceNames ?? "No race staged"}</strong>
          </div>
          <div>
            <span>Queue</span>
            <strong>{upcomingCount} upcoming</strong>
          </div>
          <div>
            <span>Racers</span>
            <strong>{liveSnapshot.racers.length} checked in</strong>
          </div>
        </div>
        <RegisterCta onTabChange={onTabChange} />
      </div>
    </Panel>
  );
}

function TournamentSpotPanel({
  onTournamentOptOut,
  tournamentOptOutBusy,
  tournamentOptOutMessage,
  visibleTournament
}: {
  onTournamentOptOut: () => Promise<void>;
  tournamentOptOutBusy: boolean;
  tournamentOptOutMessage: string | null;
  visibleTournament: TournamentBundle;
}) {
  return (
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
  );
}

function PaymentReturnNotice({
  paymentReturnState,
  selectedRacer
}: {
  paymentReturnState: string | null;
  selectedRacer: RacerSummary;
}) {
  if (paymentReturnState === "success") {
    return (
      <p className="form-success">
        {selectedRacer.payment.status === "paid"
          ? "Payment confirmed. You are ready to race."
          : "Payment is processing. This updates as soon as Stripe confirms it."}
      </p>
    );
  }

  if (paymentReturnState === "cancelled") {
    return <p className="form-error">Checkout was cancelled. You can try again.</p>;
  }

  return null;
}

/**
 * The racer page's home tab: the racer's next race (while they have one) above the open race
 * queue. During a tournament the open queue is paused, so it shows the current matches instead.
 */
export function RumbleTab({
  activeTournament,
  canBrowsePublicRacerInfo,
  currentRaceNames,
  liveSnapshot,
  onRequestLeaveEntry,
  onRequestLeaveQueue,
  onTabChange,
  onTournamentOptOut,
  paymentReturnState,
  registration,
  selectedRacer,
  selectedRacerCanOptOutOfVisibleTournament,
  selectedRacerId,
  selectedRacerIsInActiveTournament,
  tournamentMode,
  tournamentOptOutBusy,
  tournamentOptOutMessage,
  tournamentRaceCards,
  upcoming,
  visibleTournament
}: {
  activeTournament: TournamentBundle | null;
  canBrowsePublicRacerInfo: boolean;
  currentRaceNames: string | null;
  liveSnapshot: AppSnapshot;
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  onRequestLeaveQueue: () => void;
  onTabChange: (tabId: RacerTabId) => void;
  onTournamentOptOut: () => Promise<void>;
  /** Set when a queue checkout returns to the racer page (`?payment=success|cancelled`). */
  paymentReturnState: string | null;
  /** The registration wizard, shown while this phone has no racer signed in. */
  registration: ReactNode;
  selectedRacer?: RacerSummary | null;
  selectedRacerCanOptOutOfVisibleTournament: boolean;
  selectedRacerId: string;
  selectedRacerIsInActiveTournament: boolean;
  tournamentMode: boolean;
  tournamentOptOutBusy: boolean;
  tournamentOptOutMessage: string | null;
  tournamentRaceCards: TournamentRaceCard[];
  upcoming: QueueEntry[];
  visibleTournament: TournamentBundle | null;
}) {
  if (!selectedRacer && !canBrowsePublicRacerInfo) {
    return <div className="racer-card-stack">{registration}</div>;
  }

  if (tournamentMode) {
    return (
      <div className="racer-card-stack">
        {selectedRacer &&
        selectedRacerIsInActiveTournament &&
        visibleTournament &&
        selectedRacerCanOptOutOfVisibleTournament ? (
          <TournamentSpotPanel
            onTournamentOptOut={onTournamentOptOut}
            tournamentOptOutBusy={tournamentOptOutBusy}
            tournamentOptOutMessage={tournamentOptOutMessage}
            visibleTournament={visibleTournament}
          />
        ) : null}
        <TournamentRacePreview
          activeTournament={activeTournament}
          liveSnapshot={liveSnapshot}
          onTabChange={onTabChange}
          tournamentRaceCards={tournamentRaceCards}
        />
        {selectedRacer ? null : (
          <Panel title="Register">
            <RegisterCta onTabChange={onTabChange} />
          </Panel>
        )}
      </div>
    );
  }

  const queuePanel = (
    <RumbleQueuePanel
      liveSnapshot={liveSnapshot}
      onRequestLeaveEntry={onRequestLeaveEntry}
      selectedRacerId={selectedRacer ? selectedRacerId : ""}
      upcoming={upcoming}
    />
  );

  if (!selectedRacer) {
    return (
      <div className="racer-card-stack">
        <PublicSummaryPanel
          currentRaceNames={currentRaceNames}
          liveSnapshot={liveSnapshot}
          onTabChange={onTabChange}
          upcomingCount={upcoming.length}
        />
        {queuePanel}
      </div>
    );
  }

  return (
    <div className="racer-card-stack">
      <PaymentReturnNotice paymentReturnState={paymentReturnState} selectedRacer={selectedRacer} />
      <NextRaceCard
        liveSnapshot={liveSnapshot}
        onRequestLeaveQueue={onRequestLeaveQueue}
        selectedRacerId={selectedRacerId}
        upcoming={upcoming}
      />
      {queuePanel}
    </div>
  );
}
