import type {
  AppSnapshot,
  QueueEntry,
  RacerSummary,
  TournamentBundle,
  TournamentQueueEntry
} from "@roller-rumble/shared/types";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { Fragment, type ReactNode } from "react";
import { BikeName } from "../../components/racer-names-by-bike";
import {
  queueEntryBikeColors,
  tournamentEntryBikeColors,
  type BikeColor
} from "../../lib/bike-colors";
import {
  describeQueueEntry,
  isLeavableByRacer,
  resolveRacerName
} from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";
import type { RacerTabId } from "../racer-page";
import { getNextRaceTimingLabel } from "../../lib/queue-position-label";
import { RumbleQueuePanel, TournamentQueuePanel } from "./rumble-queue";
import { InlineTabLink } from "./inline-tab-link";

interface NextRaceRider {
  key: string;
  name: string;
  bikeColor: BikeColor | null;
}

/**
 * Split a race's racers into the signed-in racer's bike and their opponents, each with the bike they will
 * ride. An opponent the bracket hasn't decided reads as TBD and has no bike colour yet.
 */
function splitNextRaceRiders(
  liveSnapshot: AppSnapshot,
  racerIds: readonly (string | null)[],
  bikeColors: (BikeColor | null)[],
  selectedRacerId: string
): { ownBikeColor: BikeColor | null; opponents: NextRaceRider[] } {
  const ownIndex = racerIds.indexOf(selectedRacerId);
  return {
    ownBikeColor: bikeColors[ownIndex] ?? null,
    opponents: racerIds.flatMap((racerId, index) =>
      index === ownIndex
        ? []
        : [
            {
              key: racerId ?? `slot:${String(index)}`,
              name: resolveRacerName(liveSnapshot, racerId, "TBD"),
              bikeColor: bikeColors[index] ?? null
            }
          ]
    )
  };
}

function NextRaceCardView({
  children,
  matchLabel,
  opponents,
  ownBikeColor,
  position,
  timing
}: {
  children?: ReactNode;
  matchLabel: string;
  opponents: NextRaceRider[];
  /** The bike the signed-in racer will ride, so they can find it before they're called up. */
  ownBikeColor: BikeColor | null;
  position: number;
  timing: string;
}) {
  return (
    <Panel title="Your Next Race" aria-label="Your next race">
      <div className="stack-md">
        <div className="racer-state-card">
          <span>{matchLabel}</span>
          <strong>
            {opponents.length > 0 ? (
              <>
                <BikeName color={ownBikeColor}>You</BikeName> vs{" "}
                {opponents.map((opponent, index) => (
                  <Fragment key={opponent.key}>
                    {index > 0 ? " & " : null}
                    <BikeName color={opponent.bikeColor}>{opponent.name}</BikeName>
                  </Fragment>
                ))}
              </>
            ) : (
              <BikeName color={ownBikeColor}>Your run</BikeName>
            )}
          </strong>
          <p>
            #{position} in line · {timing}
          </p>
        </div>
        {children}
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

  return (
    <NextRaceCardView
      matchLabel={describeQueueEntry(nextEntry)}
      {...splitNextRaceRiders(
        liveSnapshot,
        nextEntry.racerIds,
        queueEntryBikeColors(liveSnapshot, nextEntry),
        selectedRacerId
      )}
      position={nextEntry.position}
      timing={getNextRaceTimingLabel(racesAhead, liveSnapshot.settings.queueMinutesPerRace)}
    >
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
    </NextRaceCardView>
  );
}

/**
 * The signed-in racer's next race in the `tournament queue`. Renders nothing once they have none.
 */
function TournamentNextRaceCard({
  liveSnapshot,
  selectedRacerId,
  tournamentQueue
}: {
  liveSnapshot: AppSnapshot;
  selectedRacerId: string;
  tournamentQueue: TournamentQueueEntry[];
}) {
  const racesAhead = tournamentQueue.findIndex((entry) => entry.racerIds.includes(selectedRacerId));
  const nextEntry = racesAhead === -1 ? null : tournamentQueue[racesAhead];

  if (!nextEntry) {
    return null;
  }

  return (
    <NextRaceCardView
      matchLabel={nextEntry.roundLabel ?? "Tourney race"}
      {...splitNextRaceRiders(
        liveSnapshot,
        nextEntry.racerIds,
        tournamentEntryBikeColors(liveSnapshot, nextEntry),
        selectedRacerId
      )}
      position={nextEntry.position}
      timing={getNextRaceTimingLabel(racesAhead, liveSnapshot.settings.queueMinutesPerRace)}
    />
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
    <Panel title="Tourney Spot">
      <div className="stack-sm">
        <div className="racer-section-heading">
          <strong>{visibleTournament.tournament.name}</strong>
          <p>You are seeded in this tourney.</p>
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
 * queue. During a tournament the open queue is paused, so it shows the tournament queue instead.
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
  tournamentQueue,
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
  /** The active tourney's `tournament queue`; empty outside a tourney. */
  tournamentQueue: TournamentQueueEntry[];
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
        {selectedRacer ? (
          <TournamentNextRaceCard
            liveSnapshot={liveSnapshot}
            selectedRacerId={selectedRacerId}
            tournamentQueue={tournamentQueue}
          />
        ) : null}
        {activeTournament ? (
          <TournamentQueuePanel
            footer={
              <InlineTabLink tabId="tournament" label="View tourney" onTabChange={onTabChange} />
            }
            liveSnapshot={liveSnapshot}
            selectedRacerId={selectedRacer ? selectedRacerId : ""}
            tournamentName={activeTournament.tournament.name}
            tournamentQueue={tournamentQueue}
          />
        ) : null}
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
