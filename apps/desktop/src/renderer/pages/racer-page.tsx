import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PhotoBoothTokenResponse } from "@goldsprints/shared/types";
import { EliminationBracketView } from "../components/elimination-bracket-view";
import { TournamentBracketBoard } from "../components/admin/tournament-board";
import { Button, EmptyState, Panel, SearchableSelect, TextInput } from "@goldsprints/shared-ui";
import {
  ApiError,
  createAccountlessRacerSession,
  createRacerPhotoBoothToken,
  fetchRacerAuthSession,
  finishPasskeyRegistration,
  finishPasskeySignIn,
  forgetRacerSessionToken,
  rememberRacerSessionToken,
  signOutRacer,
  signUpRacerQueue,
  startPasskeyRegistration,
  startPasskeySignIn,
  uploadAvatar
} from "../lib/api";
import { describeQueueEntry, resolveRacerName } from "../lib/snapshot-display";
import { fireAndForget } from "../lib/ui-actions";
import { snapshotQueryKey, useSnapshotQuery } from "../lib/query";

type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]["optionsJSON"];

function PhotoBoothQr() {
  const [tokenResponse, setTokenResponse] = useState<PhotoBoothTokenResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | null = null;

    async function refreshToken(): Promise<void> {
      try {
        const nextToken = await createRacerPhotoBoothToken();
        if (cancelled) {
          return;
        }

        setTokenResponse(nextToken);
        setErrorMessage(null);
        const refreshInMs = Math.max(
          15_000,
          new Date(nextToken.expiresAt).getTime() - Date.now() - 30_000
        );
        refreshTimer = window.setTimeout(() => {
          fireAndForget(refreshToken(), "refresh photo booth QR");
        }, refreshInMs);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Could not load booth QR");
      }
    }

    fireAndForget(refreshToken(), "load photo booth QR");
    return () => {
      cancelled = true;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, []);

  return (
    <div className="photo-booth-qr">
      <div className="racer-section-heading">
        <strong>Kaleidoscope Photo Booth</strong>
        <p>Show this QR to the booth scanner to take or retake your event avatar.</p>
      </div>
      {tokenResponse ? (
        <img
          className="photo-booth-qr__image"
          src={tokenResponse.qrCodeDataUrl}
          alt="Photo booth QR code"
        />
      ) : (
        <div className="photo-booth-qr__placeholder">Preparing your booth QR…</div>
      )}
      <div className="photo-booth-qr__footer">
        <span>
          {tokenResponse
            ? `Refreshes automatically · expires ${new Date(
                tokenResponse.expiresAt
              ).toLocaleTimeString()}`
            : "Keep this page open while you walk up to the booth."}
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            fireAndForget(
              createRacerPhotoBoothToken().then((nextToken) => {
                setTokenResponse(nextToken);
                setErrorMessage(null);
              }),
              "manual photo booth QR refresh"
            );
          }}
        >
          Refresh QR
        </Button>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
    </div>
  );
}

export function RacerPage({ focusEventId }: { focusEventId?: string }) {
  const snapshotQuery = useSnapshotQuery();
  const queryClient = useQueryClient();
  const snapshot = snapshotQuery.data;
  const [displayName, setDisplayName] = useState("");
  const [accountlessDisplayName, setAccountlessDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [authMode, setAuthMode] = useState<"email" | "register" | "host-assist">("email");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradeDisplayName, setUpgradeDisplayName] = useState("");
  const reduceMotion = useReducedMotion();
  const [selectedOpponent, setSelectedOpponent] = useState("");
  const [expandedBracketTournamentId, setExpandedBracketTournamentId] = useState<string | null>(
    null
  );
  const [selectedRacerId, setSelectedRacerId] = useState(
    localStorage.getItem("goldsprints.racerId") ?? ""
  );
  const [accountlessId] = useState(() => {
    const existing =
      localStorage.getItem("goldsprints.accountlessId") ??
      localStorage.getItem("goldsprints.anonymousId");
    if (existing) {
      localStorage.setItem("goldsprints.accountlessId", existing);
      return existing;
    }

    const created = crypto.randomUUID();
    localStorage.setItem("goldsprints.accountlessId", created);
    return created;
  });

  useEffect(() => {
    let cancelled = false;
    async function hydrateSession(): Promise<void> {
      const result = await fetchRacerAuthSession();
      if (cancelled) {
        return;
      }
      queryClient.setQueryData(snapshotQueryKey, result.snapshot);
      if (result.racer) {
        rememberRacerSessionToken(result.sessionToken);
        localStorage.setItem("goldsprints.racerId", result.racer.id);
        setSelectedRacerId(result.racer.id);
      } else {
        forgetRacerSessionToken();
        localStorage.removeItem("goldsprints.racerId");
        setSelectedRacerId("");
      }
    }
    fireAndForget(hydrateSession(), "hydrate racer session");
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  function rememberSignedInRacer(result: {
    racer: { id: string; displayName: string };
    sessionToken?: string | null;
  }): void {
    rememberRacerSessionToken(result.sessionToken);
    localStorage.setItem("goldsprints.racerId", result.racer.id);
    setSelectedRacerId(result.racer.id);
    setAuthMessage(null);
    setQueueMessage(null);
  }

  async function handleEmailSignIn(): Promise<void> {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const result = await startPasskeySignIn(email);
      if (result.status === "register_required") {
        setAuthMode("register");
        setDisplayName("");
        return;
      }
      if (result.status === "host_assist") {
        setAuthMode("host-assist");
        setAuthMessage(result.message);
        return;
      }

      const credential = await startAuthentication({
        optionsJSON: result.options as AuthenticationOptionsJSON
      });
      const signedIn = await finishPasskeySignIn({
        challengeId: result.challengeId,
        response: credential
      });
      rememberSignedInRacer(signedIn);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasskeyRegistration(input: {
    email: string;
    displayName: string;
    phone?: string;
  }): Promise<void> {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const result = await startPasskeyRegistration(input);
      if (result.status === "host_assist") {
        setAuthMode("host-assist");
        setAuthMessage(result.message);
        return;
      }

      const credential = await startRegistration({
        optionsJSON: result.options as RegistrationOptionsJSON
      });
      const registered = await finishPasskeyRegistration({
        challengeId: result.challengeId,
        response: credential
      });
      rememberSignedInRacer(registered);
      setAuthMode("email");
      setUpgradeEmail("");
      setUpgradeDisplayName("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not register passkey.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleContinueAccountless(): Promise<void> {
    const result = await createAccountlessRacerSession({
      displayName: accountlessDisplayName.trim(),
      accountlessId
    });
    rememberSignedInRacer(result);
  }

  async function handleSignOut(): Promise<void> {
    await signOutRacer();
    forgetRacerSessionToken();
    localStorage.removeItem("goldsprints.racerId");
    setSelectedRacerId("");
  }

  async function handleQueueSignup(input: {
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
  }): Promise<void> {
    try {
      await signUpRacerQueue(input);
      setQueueMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === "payment_required") {
        setQueueMessage(error.message);
        return;
      }
      throw error;
    }
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
  const selectedRacerHasEmail = Boolean(
    selectedRacer?.racer.identities.some((identity) => identity.type === "email")
  );
  const canContinueAccountless = snapshot.settings.allowAccountlessRacerSignup;
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
                        {snapshot.settings.paymentRequiredForQueue ? (
                          <p>Entrance fee: {selectedRacer.payment.status}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="button-row">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          fireAndForget(handleSignOut(), "sign out racer");
                        }}
                      >
                        Sign out
                      </Button>
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
                    <PhotoBoothQr />
                    {!selectedRacerHasEmail ? (
                      <div className="stack-sm">
                        <div className="racer-section-heading">
                          <strong>Secure This Account</strong>
                          <p>Add an email and passkey so this racer profile can come with you.</p>
                        </div>
                        <label>
                          Email
                          <TextInput
                            value={upgradeEmail}
                            onChange={(event) => {
                              setUpgradeEmail(event.target.value);
                            }}
                            placeholder="email@example.com"
                          />
                        </label>
                        <label>
                          Display name
                          <TextInput
                            value={upgradeDisplayName}
                            onChange={(event) => {
                              setUpgradeDisplayName(event.target.value);
                            }}
                            placeholder={selectedRacer.racer.displayName}
                          />
                        </label>
                        <Button
                          disabled={!upgradeEmail || authBusy}
                          onClick={() => {
                            fireAndForget(
                              handlePasskeyRegistration({
                                email: upgradeEmail,
                                displayName:
                                  upgradeDisplayName.trim() || selectedRacer.racer.displayName
                              }),
                              "upgrade accountless racer"
                            );
                          }}
                        >
                          Create Passkey
                        </Button>
                        {authMessage ? <p className="form-error">{authMessage}</p> : null}
                      </div>
                    ) : null}
                    <div className="stack-sm">
                      <div className="racer-section-heading">
                        <strong>Quick Queue</strong>
                        <p>Jump into the next open time trial race with one tap.</p>
                      </div>
                      {queueMessage ? <p className="form-error">{queueMessage}</p> : null}
                      <div className="racer-action-grid">
                        <Button
                          onClick={() => {
                            fireAndForget(
                              handleQueueSignup({
                                requestedType: "auto-match"
                              }),
                              "join queue"
                            );
                          }}
                        >
                          Join Head-to-Head Queue
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            fireAndForget(
                              handleQueueSignup({ requestedType: "solo" }),
                              "join solo queue"
                            );
                          }}
                        >
                          Queue Solo Run
                        </Button>
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
                        <Button
                          variant="accent"
                          disabled={!selectedOpponent}
                          onClick={() => {
                            fireAndForget(
                              handleQueueSignup({
                                opponentRacerId: selectedOpponent
                              }),
                              "challenge racer"
                            );
                          }}
                        >
                          Challenge
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <label>
                      Email
                      <TextInput
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setAuthMode("email");
                          setAuthMessage(null);
                        }}
                        placeholder="email@example.com"
                      />
                    </label>
                    {authMode === "register" ? (
                      <>
                        <label>
                          Display name
                          <TextInput
                            value={displayName}
                            onChange={(event) => {
                              setDisplayName(event.target.value);
                            }}
                            placeholder="Racer name"
                          />
                        </label>
                        <label>
                          Phone
                          <TextInput
                            value={phone}
                            onChange={(event) => {
                              setPhone(event.target.value);
                            }}
                            placeholder="555-0100"
                          />
                        </label>
                      </>
                    ) : null}
                    {authMessage ? <p className="form-error">{authMessage}</p> : null}
                    {authMode === "host-assist" ? (
                      <EmptyState
                        title="See the host"
                        body="This email is already registered, but it does not have a passkey yet. A host can help attach one safely."
                      />
                    ) : null}
                    {canContinueAccountless ? (
                      <div className="accountless-racer-signup stack-sm">
                        <div className="racer-section-heading">
                          <strong>Continue without an account</strong>
                          <p>
                            Enter the name people should see on the race display. You can add email
                            and a passkey later.
                          </p>
                        </div>
                        <label>
                          Display name
                          <TextInput
                            value={accountlessDisplayName}
                            onChange={(event) => {
                              setAccountlessDisplayName(event.target.value);
                            }}
                            placeholder="Racer name"
                          />
                        </label>
                      </div>
                    ) : null}
                    <div className="button-row">
                      {authMode === "register" ? (
                        <Button
                          disabled={!email || !displayName || authBusy}
                          onClick={() => {
                            fireAndForget(
                              handlePasskeyRegistration({
                                email,
                                displayName,
                                phone: phone || undefined
                              }),
                              "register passkey"
                            );
                          }}
                        >
                          {displayName ? `Register ${displayName}` : "Register"}
                        </Button>
                      ) : (
                        <Button
                          disabled={!email || authBusy}
                          onClick={() => {
                            fireAndForget(handleEmailSignIn(), "passkey sign in");
                          }}
                        >
                          Sign in
                        </Button>
                      )}
                      {authMode !== "email" ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setAuthMode("email");
                            setAuthMessage(null);
                          }}
                        >
                          Back
                        </Button>
                      ) : null}
                      {canContinueAccountless ? (
                        <Button
                          variant="ghost"
                          disabled={!accountlessDisplayName.trim() || authBusy}
                          onClick={() => {
                            fireAndForget(handleContinueAccountless(), "accountless racer session");
                          }}
                        >
                          Continue accountless
                        </Button>
                      ) : null}
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
