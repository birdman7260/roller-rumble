import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { EliminationBracketView } from "../components/elimination-bracket-view";
import { TournamentBracketBoard } from "../components/admin/tournament-board";
import { EmptyState, Panel, SearchableSelect } from "../components/ui";
import { registerRacer, signUpQueue, uploadAvatar } from "../lib/api";
import { describeQueueEntry, resolveRacerName } from "../lib/snapshot-display";
import { fireAndForget } from "../lib/ui-actions";
import { useSnapshotQuery } from "../lib/query";

export function RacerPage({ focusEventId }: { focusEventId?: string }) {
  const snapshotQuery = useSnapshotQuery();
  const snapshot = snapshotQuery.data;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const reduceMotion = useReducedMotion();
  const [selectedOpponent, setSelectedOpponent] = useState("");
  const [expandedBracketTournamentId, setExpandedBracketTournamentId] = useState<string | null>(
    null
  );
  const [selectedRacerId, setSelectedRacerId] = useState(
    localStorage.getItem("goldsprints.racerId") ?? ""
  );
  const [anonymousId] = useState(() => {
    const existing = localStorage.getItem("goldsprints.anonymousId");
    if (existing) {
      return existing;
    }

    const created = crypto.randomUUID();
    localStorage.setItem("goldsprints.anonymousId", created);
    return created;
  });

  async function handleRegisterRacer(): Promise<void> {
    const result = await registerRacer({
      displayName,
      email: email || undefined,
      phone: phone || undefined
    });
    localStorage.setItem("goldsprints.racerId", result.racer.id);
    setSelectedRacerId(result.racer.id);
  }

  async function handleContinueAnonymously(): Promise<void> {
    const result = await registerRacer({
      displayName: displayName || "Anonymous Racer",
      anonymousId
    });
    localStorage.setItem("goldsprints.racerId", result.racer.id);
    setSelectedRacerId(result.racer.id);
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file || !selectedRacerId) {
      return;
    }

    await uploadAvatar(selectedRacerId, file);
  }

  if (!snapshot) {
    return <p>Loading racer page…</p>;
  }

  const selectedRacer = snapshot.racers.find((entry) => entry.racer.id === selectedRacerId);
  const upcoming = focusEventId
    ? snapshot.queue.filter((entry) => entry.eventId === focusEventId)
    : snapshot.queue;
  const completedTournamentsForCurrentEvent = snapshot.tournaments.filter(
    (bundle) => bundle.tournament.status === "complete"
  );
  const tournamentFallbackPoolForCurrentEvent =
    completedTournamentsForCurrentEvent.length > 0
      ? completedTournamentsForCurrentEvent
      : snapshot.tournaments;
  const activeTournament = snapshot.tournaments.find(
    (bundle) => bundle.tournament.status === "active"
  );
  const mostRecentFinishedTournament = [...tournamentFallbackPoolForCurrentEvent]
    .sort((left, right) => right.tournament.updatedAt.localeCompare(left.tournament.updatedAt))
    .at(0);
  const visibleTournament = activeTournament ?? mostRecentFinishedTournament ?? null;
  // `snapshot.tournaments` is already limited to the current event, so this fallback stays within
  // the same event: show the active bracket when one exists, otherwise use the most recently
  // updated finished tournament instead of turning the racer surface into a history browser.
  const tournaments = visibleTournament === null ? [] : [visibleTournament];
  const bracketExpanded = tournaments.some(
    (bundle) =>
      bundle.tournament.id === expandedBracketTournamentId && bundle.bracketNodes.length > 0
  );
  const expandedBracketTournament = bracketExpanded
    ? (tournaments.find((bundle) => bundle.tournament.id === expandedBracketTournamentId) ?? null)
    : null;
  const supportingCardMotion = reduceMotion
    ? {
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        initial: { opacity: 0 }
      }
    : {
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: {
          opacity: 0,
          scale: 0.985,
          y: 18,
          transition: { duration: 0.16, ease: "easeOut" as const }
        },
        initial: { opacity: 0, scale: 0.99, y: 14 }
      };
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.92 };

  function canShowBracket(bundle: (typeof tournaments)[number]): boolean {
    return bundle.bracketNodes.length > 0;
  }

  return (
    <LayoutGroup id="racer-workspace">
      <div
        className={`page-grid racer-page-grid${
          bracketExpanded ? " racer-page-grid--bracket-expanded" : ""
        }`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {!bracketExpanded ? (
            <motion.div
              key="racer-identity"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="racer-page-grid__card racer-page-grid__card--supporting"
            >
              <Panel title={selectedRacer ? "Your Race Card" : "Register"}>
                {selectedRacer ? (
                  <div className="stack-md">
                    <div className="race-metric-card__header">
                      {selectedRacer.racer.avatarUrl ? (
                        <img
                          className="racer-avatar"
                          src={selectedRacer.racer.avatarUrl}
                          alt={selectedRacer.racer.displayName}
                        />
                      ) : (
                        <span className="racer-avatar">{selectedRacer.racer.displayName[0]}</span>
                      )}
                      <div>
                        <strong>{selectedRacer.racer.displayName}</strong>
                        <p>
                          {selectedRacer.stats.races} races · {selectedRacer.stats.wins} wins
                        </p>
                      </div>
                    </div>
                    <label>
                      Upload avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          fireAndForget(handleAvatarUpload(event));
                        }}
                      />
                    </label>
                    <div className="stack-sm">
                      <div className="racer-section-heading">
                        <strong>Quick Queue</strong>
                        <p>Jump into the next open time trial race with one tap.</p>
                      </div>
                      <div className="racer-action-grid">
                        <button
                          className="button"
                          onClick={() => {
                            fireAndForget(
                              signUpQueue({
                                racerId: selectedRacerId,
                                requestedType: "auto-match"
                              })
                            );
                          }}
                        >
                          Join Head-to-Head Queue
                        </button>
                        <button
                          className="button button--ghost"
                          onClick={() => {
                            fireAndForget(
                              signUpQueue({ racerId: selectedRacerId, requestedType: "solo" })
                            );
                          }}
                        >
                          Queue Solo Run
                        </button>
                      </div>
                    </div>
                    <div className="stack-sm">
                      <div className="racer-section-heading">
                        <strong>Challenge Another Racer</strong>
                        <p>Search for a specific opponent and lock in that matchup.</p>
                      </div>
                      <div className="racer-challenge-controls">
                        <label className="racer-picker-label">
                          Opponent
                          <SearchableSelect
                            value={selectedOpponent}
                            placeholder="Type to find an opponent"
                            options={snapshot.racers
                              .filter((entry) => entry.racer.id !== selectedRacerId)
                              .map((entry) => ({
                                value: entry.racer.id,
                                label: entry.racer.displayName
                              }))}
                            onValueChange={(nextOpponentId) => {
                              setSelectedOpponent(nextOpponentId);
                            }}
                            noResultsText="No racers match that search"
                          />
                        </label>
                        <button
                          className="button button--accent"
                          disabled={!selectedOpponent}
                          onClick={() => {
                            fireAndForget(
                              signUpQueue({
                                racerId: selectedRacerId,
                                opponentRacerId: selectedOpponent
                              })
                            );
                          }}
                        >
                          Challenge
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <label>
                      Display name
                      <input
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                        }}
                        placeholder="Racer name"
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                        }}
                        placeholder="email@example.com"
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        value={phone}
                        onChange={(event) => {
                          setPhone(event.target.value);
                        }}
                        placeholder="555-0100"
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="button"
                        onClick={() => {
                          fireAndForget(handleRegisterRacer());
                        }}
                      >
                        Register
                      </button>
                      <button
                        className="button button--ghost"
                        onClick={() => {
                          fireAndForget(handleContinueAnonymously());
                        }}
                      >
                        Continue anonymously
                      </button>
                    </div>
                  </div>
                )}
              </Panel>
            </motion.div>
          ) : null}

          {!bracketExpanded ? (
            <motion.div
              key="racer-upcoming"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="racer-page-grid__card racer-page-grid__card--supporting"
            >
              <Panel title="Upcoming Races">
                {upcoming.length === 0 ? (
                  <EmptyState
                    title="No upcoming races"
                    body="The queue is open. Be the first racer to jump in."
                  />
                ) : (
                  <div className="list">
                    {upcoming.map((entry) => (
                      <div key={entry.id} className="list-row">
                        <strong>
                          #{entry.position}{" "}
                          {entry.racerIds
                            .map((racerId) => resolveRacerName(snapshot, racerId))
                            .join(" vs ")}
                        </strong>
                        <span>{describeQueueEntry(entry)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </motion.div>
          ) : null}

          {!bracketExpanded ? (
            <motion.div
              key="racer-list"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="racer-page-grid__card racer-page-grid__card--supporting"
            >
              <Panel title="Event Racers">
                <div className="list">
                  {snapshot.racers.map((entry) => (
                    <div key={entry.racer.id} className="list-row">
                      <div>
                        <strong>{entry.racer.displayName}</strong>
                        <p>
                          {entry.stats.races} races · {entry.stats.topSpeedKph.toFixed(1)} km/h top
                          speed · {entry.stats.maxWattage.toFixed(0)}W peak
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout
          transition={{ layout: layoutTransition }}
          className={`racer-page-grid__card racer-page-grid__card--tournaments${
            bracketExpanded ? " racer-page-grid__card--bracket-expanded" : ""
          }`}
        >
          <Panel
            title={
              bracketExpanded && expandedBracketTournament
                ? expandedBracketTournament.tournament.name
                : "Tournament View"
            }
            className={`racer-page-grid__panel${
              bracketExpanded ? " racer-page-grid__panel--bracket-expanded" : ""
            }`}
          >
            {tournaments.length === 0 ? (
              <EmptyState
                title="No tournament active"
                body="When the hosts create a bracket, it will appear here with standings and matchups."
              />
            ) : bracketExpanded && expandedBracketTournament ? (
              // Keeping the tournament card mounted while only its layout/classes change lets
              // Framer Motion interpolate the same resize/takeover motion that the admin board uses.
              <TournamentBracketBoard
                snapshot={snapshot}
                bundle={expandedBracketTournament}
                canStageMatches={false}
                hintText="Follow the live elimination board here. Use the bracket controls to focus the active matchup or collapse back to the regular racer page."
                expanded
                onExpandedChange={(expanded) => {
                  setExpandedBracketTournamentId(
                    expanded ? expandedBracketTournament.tournament.id : null
                  );
                }}
                onStageMatch={() => {
                  // Racer view is read-only; the shared board component is reused here so the
                  // layout stays in lockstep with the admin bracket presentation.
                }}
              />
            ) : (
              <div className="stack-md racer-tournaments">
                <AnimatePresence initial={false} mode="popLayout">
                  {tournaments.map((bundle) => (
                    <motion.div
                      key={bundle.tournament.id}
                      layout
                      transition={{ layout: layoutTransition }}
                      className="tournament-card"
                    >
                      <div className="list-row">
                        <div>
                          <strong>{bundle.tournament.name}</strong>
                          <p>{bundle.tournament.preset}</p>
                        </div>
                      </div>
                      {canShowBracket(bundle) ? (
                        <EliminationBracketView
                          snapshot={snapshot}
                          bundle={bundle}
                          expandMode="container"
                          expanded={expandedBracketTournamentId === bundle.tournament.id}
                          onExpandedChange={(expanded) => {
                            setExpandedBracketTournamentId(expanded ? bundle.tournament.id : null);
                          }}
                        />
                      ) : bundle.standings.length > 0 ? (
                        <div className="standings-grid">
                          {bundle.standings.map((standing) => (
                            <div key={standing.racerId} className="standing-row">
                              <strong>#{standing.rank}</strong>
                              <span>{resolveRacerName(snapshot, standing.racerId)}</span>
                              <span>
                                {standing.wins}-{standing.losses}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : bundle.bracketNodes.length > 0 ? (
                        <div className="bracket-summary">
                          <strong>Elimination bracket ready</strong>
                          <span>Expand this tournament card to view the live bracket.</span>
                        </div>
                      ) : (
                        <EmptyState
                          title="Tournament board will appear here"
                          body="Round robin and group-stage tournaments show live standings and match lists instead of an elimination bracket."
                        />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Panel>
        </motion.div>
      </div>
    </LayoutGroup>
  );
}
