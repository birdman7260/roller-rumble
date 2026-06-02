import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AppSnapshot,
  NotificationConfig,
  PhotoBoothTokenResponse,
  RacerNotification,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@goldsprints/shared/types";
import { EliminationBracketView } from "../components/elimination-bracket-view";
import { TournamentBracketBoard } from "../components/admin/tournament-board";
import { Button, EmptyState, Panel, SearchableSelect, TextInput } from "@goldsprints/shared-ui";
import {
  ApiError,
  cancelRacerCheckoutPayment,
  createAccountlessRacerSession,
  createRacerPhotoBoothToken,
  fetchRacerAuthSession,
  fetchNotificationConfig,
  finishPasskeyRegistration,
  finishPasskeySignIn,
  forgetRacerSessionToken,
  markRacerNotificationRead,
  rememberRacerSessionToken,
  optOutOfCurrentTournament,
  saveRacerPushSubscription,
  signOutRacer,
  signUpRacerQueue,
  startPasskeyRegistration,
  startPasskeySignIn,
  uploadAvatar
} from "../lib/api";
import { resolveBackendAssetUrl } from "../lib/assets";
import { describeQueueEntry, resolveRacerName } from "../lib/snapshot-display";
import { fireAndForget } from "../lib/ui-actions";
import {
  racerNotificationsQueryKey,
  snapshotQueryKey,
  useNotificationConfigQuery,
  useRacerNotificationsQuery,
  useSnapshotQuery
} from "../lib/query";

type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]["optionsJSON"];
const notificationQueuePromptStorageKey = "goldsprints.notifications.queuePromptedAt";

function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "fee not set";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

function pushSubscriptionToInput(subscription: PushSubscription): WebPushSubscriptionInput {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Browser did not return a complete push subscription.");
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }
  };
}

async function getPushConfig(
  cachedConfig: NotificationConfig | undefined
): Promise<NotificationConfig> {
  return cachedConfig ?? fetchNotificationConfig();
}

function clearNotificationLaunchParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("notificationId")) {
    return;
  }

  url.searchParams.delete("notificationId");
  window.history.replaceState(window.history.state, "", url);
}

function getNotificationModalLabel(notification: RacerNotification): string {
  switch (notification.type) {
    case "queue_get_ready":
      return "Race Coming Up";
    case "tournament_started":
      return "Tournament Check-In";
    case "admin_message":
      return "Host Message";
    default:
      return "Race Update";
  }
}

function canRacerOptOutFromTournament(
  snapshot: AppSnapshot,
  bundle: TournamentBundle,
  racerId: string
): boolean {
  if (
    bundle.tournament.status !== "active" ||
    !bundle.seeds.some((seed) => seed.racerId === racerId)
  ) {
    return false;
  }

  const activeRace = snapshot.raceProjection.race;
  const racerIsInActiveRace = activeRace?.participants.some(
    (participant) => participant.racerId === racerId
  );
  if (
    activeRace?.tournamentId === bundle.tournament.id &&
    racerIsInActiveRace &&
    !["scheduled", "staging"].includes(activeRace.state)
  ) {
    return false;
  }

  return true;
}

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
  const notificationConfigQuery = useNotificationConfigQuery();
  const [displayName, setDisplayName] = useState("");
  const [accountlessDisplayName, setAccountlessDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [authMode, setAuthMode] = useState<"email" | "register" | "host-assist">("email");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);
  const [modalNotifications, setModalNotifications] = useState<RacerNotification[]>([]);
  const [modalActionMessage, setModalActionMessage] = useState<string | null>(null);
  const [tournamentOptOutBusy, setTournamentOptOutBusy] = useState(false);
  const [tournamentOptOutMessage, setTournamentOptOutMessage] = useState<string | null>(null);
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);
  const [avatarUploadMessage, setAvatarUploadMessage] = useState<string | null>(null);
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);
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
  const paymentReturnState = new URLSearchParams(window.location.search).get("payment");
  const paymentReturnId = new URLSearchParams(window.location.search).get("payment_id");
  const launchedNotificationId = new URLSearchParams(window.location.search).get("notificationId");
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
  const racerNotificationsQuery = useRacerNotificationsQuery(Boolean(selectedRacerId));

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

  useEffect(() => {
    if (paymentReturnState !== "cancelled" || !paymentReturnId) {
      return;
    }

    fireAndForget(cancelRacerCheckoutPayment(paymentReturnId), "cancel checkout payment");
  }, [paymentReturnId, paymentReturnState]);

  useEffect(() => {
    const notifications = racerNotificationsQuery.data;
    if (!notifications) {
      return;
    }

    let modalTimer: number | null = null;
    function scheduleModalNotifications(
      notificationsToShow: RacerNotification[],
      replaceCurrentNotifications = false
    ): void {
      modalTimer = window.setTimeout(() => {
        setModalActionMessage(null);
        setModalNotifications((currentNotifications) => {
          const queuedIds = new Set(
            currentNotifications.map((notification) => notification.notificationId)
          );
          const nextNotifications = notificationsToShow.filter(
            (notification) =>
              replaceCurrentNotifications || !queuedIds.has(notification.notificationId)
          );
          return replaceCurrentNotifications
            ? nextNotifications
            : [...currentNotifications, ...nextNotifications];
        });
      }, 0);
    }

    if (knownNotificationIdsRef.current === null) {
      knownNotificationIdsRef.current = new Set(
        notifications.map((notification) => notification.notificationId)
      );
      const launchedNotification = launchedNotificationId
        ? notifications.find(
            (notification) =>
              notification.notificationId === launchedNotificationId && !notification.readAt
          )
        : null;
      if (launchedNotification) {
        scheduleModalNotifications([launchedNotification], true);
        clearNotificationLaunchParam();
      }
      return () => {
        if (modalTimer !== null) {
          window.clearTimeout(modalTimer);
        }
      };
    }

    const newUnreadNotifications = notifications.filter(
      (notification) =>
        !notification.readAt && !knownNotificationIdsRef.current?.has(notification.notificationId)
    );
    notifications.forEach((notification) => {
      knownNotificationIdsRef.current?.add(notification.notificationId);
    });
    if (newUnreadNotifications.length === 0) {
      return;
    }

    scheduleModalNotifications([...newUnreadNotifications].reverse());
    return () => {
      if (modalTimer !== null) {
        window.clearTimeout(modalTimer);
      }
    };
  }, [launchedNotificationId, racerNotificationsQuery.data]);

  function rememberSignedInRacer(result: {
    racer: { id: string; displayName: string };
    sessionToken?: string | null;
  }): void {
    rememberRacerSessionToken(result.sessionToken);
    localStorage.setItem("goldsprints.racerId", result.racer.id);
    setSelectedRacerId(result.racer.id);
    setAuthMessage(null);
    setQueueMessage(null);
    setAvatarUploadMessage(null);
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
    setAvatarUploadMessage(null);
    setNotificationPromptVisible(false);
    setNotificationMessage(null);
    setTournamentOptOutMessage(null);
  }

  async function saveGrantedNotificationSubscription(
    cachedConfig?: NotificationConfig
  ): Promise<void> {
    const config = await getPushConfig(cachedConfig ?? notificationConfigQuery.data);
    if (!config.configured || !config.publicKey) {
      setNotificationMessage(config.message);
      setNotificationPromptVisible(true);
      return;
    }

    const registration = await navigator.serviceWorker.register("/racer-notifications-sw.js");
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(config.publicKey)
      }));

    await saveRacerPushSubscription(pushSubscriptionToInput(subscription));
    setNotificationPromptVisible(false);
    setNotificationMessage("Notifications enabled for this device.");
  }

  async function handleEnableNotifications(): Promise<void> {
    setNotificationMessage(null);
    if (!isPushSupported()) {
      setNotificationMessage("This browser does not support Web Push notifications.");
      return;
    }

    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      setNotificationMessage(
        "Notifications were not enabled. Race updates will still appear here."
      );
      return;
    }

    await saveGrantedNotificationSubscription();
  }

  async function promptForNotificationsOnFirstQueueAttempt(): Promise<void> {
    if (
      localStorage.getItem(notificationQueuePromptStorageKey) ||
      !isPushSupported() ||
      Notification.permission !== "default"
    ) {
      return;
    }

    localStorage.setItem(notificationQueuePromptStorageKey, new Date().toISOString());
    setNotificationMessage(null);
    // Ask for permission immediately from the queue button gesture; browser permission prompts can
    // be blocked if we wait until after the queue/payment request finishes.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setNotificationMessage(
        "Notifications were not enabled. Race updates will still appear here."
      );
      setNotificationPromptVisible(true);
      return;
    }

    await saveGrantedNotificationSubscription();
  }

  async function handleQueueSignup(input: {
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
  }): Promise<void> {
    try {
      await promptForNotificationsOnFirstQueueAttempt();
    } catch (error) {
      setNotificationMessage(
        error instanceof Error ? error.message : "Could not enable notifications on this device."
      );
      setNotificationPromptVisible(true);
    }

    try {
      const result = await signUpRacerQueue(input);
      if (result.status === "checkout_required") {
        setQueueMessage("Opening secure Stripe Checkout...");
        window.location.assign(result.checkoutUrl);
        return;
      }
      setQueueMessage(null);
      setNotificationPromptVisible(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "payment_required") {
        setQueueMessage(error.message);
        return;
      }
      throw error;
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file || !selectedRacerId) {
      return;
    }

    setAvatarUploadBusy(true);
    setAvatarUploadMessage(null);
    try {
      const nextSnapshot = await uploadAvatar(selectedRacerId, file);
      queryClient.setQueryData(snapshotQueryKey, nextSnapshot);
      input.value = "";
      setAvatarUploadMessage("Avatar updated.");
    } catch (error) {
      setAvatarUploadMessage(error instanceof Error ? error.message : "Could not upload avatar.");
    } finally {
      setAvatarUploadBusy(false);
    }
  }

  async function dismissNotificationModal(notification: RacerNotification): Promise<void> {
    setModalActionMessage(null);
    setModalNotifications((currentNotifications) =>
      currentNotifications.filter((entry) => entry.notificationId !== notification.notificationId)
    );
    const nextNotifications = await markRacerNotificationRead(notification.notificationId);
    queryClient.setQueryData(racerNotificationsQueryKey, nextNotifications);
  }

  async function handleTournamentOptOut(): Promise<void> {
    setTournamentOptOutBusy(true);
    setTournamentOptOutMessage(null);
    setModalActionMessage(null);
    try {
      const result = await optOutOfCurrentTournament();
      queryClient.setQueryData(snapshotQueryKey, result.snapshot);
      setTournamentOptOutMessage(result.message);
      setModalActionMessage(result.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not opt out of the tournament.";
      setTournamentOptOutMessage(message);
      setModalActionMessage(message);
    } finally {
      setTournamentOptOutBusy(false);
    }
  }

  if (!snapshot) {
    return <p>Loading racer page…</p>;
  }

  const selectedRacer = snapshot.racers.find((entry) => entry.racer.id === selectedRacerId);
  const selectedRacerQueueEntries = snapshot.queue.filter((entry) =>
    entry.racerIds.includes(selectedRacerId)
  );
  const selectedRacerAvatarUrl = resolveBackendAssetUrl(selectedRacer?.racer.avatarUrl);
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
  const selectedRacerCanOptOutOfVisibleTournament = Boolean(
    selectedRacerId &&
    visibleTournament &&
    canRacerOptOutFromTournament(snapshot, visibleTournament, selectedRacerId)
  );
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
  const racerNotifications = racerNotificationsQuery.data ?? [];
  const unreadNotificationCount = racerNotifications.filter(
    (notification) => !notification.readAt
  ).length;
  const activeModalNotification = modalNotifications.length > 0 ? modalNotifications[0] : null;
  const shouldShowNotificationPrompt =
    notificationPromptVisible ||
    paymentReturnState === "success" ||
    selectedRacerQueueEntries.length > 0;

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
                      {selectedRacerAvatarUrl ? (
                        <img
                          className="racer-avatar"
                          src={selectedRacerAvatarUrl}
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
                        {snapshot.activeEvent.paymentRequiredForQueue ? (
                          <p>
                            Entrance fee: {selectedRacer.payment.status} ·{" "}
                            {formatPaymentAmount(
                              snapshot.activeEvent.paymentAmountCents,
                              snapshot.activeEvent.paymentCurrency
                            )}
                          </p>
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
                    <div className="racer-notification-center stack-sm">
                      <div className="racer-section-heading">
                        <strong>Race Notifications</strong>
                        <p>
                          {unreadNotificationCount > 0
                            ? `${unreadNotificationCount} unread update${
                                unreadNotificationCount === 1 ? "" : "s"
                              }.`
                            : "Get phone alerts when your race or tournament is coming up."}
                        </p>
                      </div>
                      {shouldShowNotificationPrompt ? (
                        <div className="racer-notification-callout">
                          <span>
                            {notificationConfigQuery.data?.configured
                              ? "Enable notifications on this phone so you do not miss your race."
                              : (notificationConfigQuery.data?.message ??
                                "Notification setup is still loading.")}
                          </span>
                          <Button
                            variant="accent"
                            disabled={!notificationConfigQuery.data?.configured}
                            onClick={() => {
                              fireAndForget(handleEnableNotifications(), "enable notifications");
                            }}
                          >
                            Enable Notifications
                          </Button>
                        </div>
                      ) : (
                        <div className="button-row">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              fireAndForget(handleEnableNotifications(), "enable notifications");
                            }}
                          >
                            Enable Notifications
                          </Button>
                        </div>
                      )}
                      {notificationMessage ? <p>{notificationMessage}</p> : null}
                      {snapshot.settings.showRacerNotificationDebugList &&
                      racerNotifications.length > 0 ? (
                        <div className="racer-notification-list">
                          {racerNotifications.slice(0, 5).map((notification) => (
                            <article
                              key={notification.id}
                              className={`racer-notification-item${
                                notification.readAt ? "" : " racer-notification-item--unread"
                              }`}
                            >
                              <div>
                                <strong>{notification.title}</strong>
                                <p>{notification.body}</p>
                              </div>
                              {!notification.readAt ? (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    fireAndForget(
                                      markRacerNotificationRead(notification.notificationId).then(
                                        (nextNotifications) => {
                                          queryClient.setQueryData(
                                            racerNotificationsQueryKey,
                                            nextNotifications
                                          );
                                        }
                                      ),
                                      "mark notification read"
                                    );
                                  }}
                                >
                                  Mark read
                                </Button>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <label>
                      Upload avatar
                      <input
                        type="file"
                        accept="image/*"
                        disabled={avatarUploadBusy}
                        onChange={(event) => {
                          fireAndForget(handleAvatarUpload(event));
                        }}
                      />
                    </label>
                    {avatarUploadMessage ? <p>{avatarUploadMessage}</p> : null}
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
                        <p>
                          {snapshot.activeEvent.paymentRequiredForQueue
                            ? `Entry is ${formatPaymentAmount(
                                snapshot.activeEvent.paymentAmountCents,
                                snapshot.activeEvent.paymentCurrency
                              )}. Checkout will open if you have not paid yet.`
                            : "Jump into the next open time trial race with one tap."}
                        </p>
                      </div>
                      {paymentReturnState === "success" ? (
                        <p className="form-success">
                          {selectedRacer.payment.status === "paid"
                            ? "Payment confirmed. You are ready to race."
                            : "Payment is processing. This card will update as soon as Stripe confirms it."}
                        </p>
                      ) : null}
                      {paymentReturnState === "cancelled" ? (
                        <p className="form-error">Checkout was cancelled. You can try again.</p>
                      ) : null}
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
                        {selectedRacerCanOptOutOfVisibleTournament &&
                        bundle.tournament.id === visibleTournament?.tournament.id ? (
                          <Button
                            variant="ghost"
                            disabled={tournamentOptOutBusy}
                            onClick={() => {
                              fireAndForget(handleTournamentOptOut(), "opt out of tournament");
                            }}
                          >
                            {tournamentOptOutBusy ? "Opting out..." : "Opt out"}
                          </Button>
                        ) : null}
                      </div>
                      {tournamentOptOutMessage ? <p>{tournamentOptOutMessage}</p> : null}
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
      <AnimatePresence>
        {activeModalNotification ? (
          <motion.div
            className={`racer-notification-modal racer-notification-modal--${activeModalNotification.type}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="racer-notification-modal-title"
          >
            <motion.div
              className="racer-notification-modal__card"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
            >
              <button
                type="button"
                className="racer-notification-modal__close"
                onClick={() => {
                  fireAndForget(
                    dismissNotificationModal(activeModalNotification),
                    "close racer notification"
                  );
                }}
              >
                Close
              </button>
              <span className="racer-notification-modal__eyebrow">
                {getNotificationModalLabel(activeModalNotification)}
              </span>
              <h2 id="racer-notification-modal-title">{activeModalNotification.title}</h2>
              <p>{activeModalNotification.body}</p>
              {modalActionMessage ? (
                <p className="racer-notification-modal__action-message">{modalActionMessage}</p>
              ) : null}
              <div className="racer-notification-modal__actions">
                {activeModalNotification.type === "tournament_started" ? (
                  <>
                    <Button
                      variant="ghost"
                      disabled={tournamentOptOutBusy}
                      onClick={() => {
                        fireAndForget(handleTournamentOptOut(), "opt out of tournament");
                      }}
                    >
                      {tournamentOptOutBusy ? "Removing..." : "Remove Me"}
                    </Button>
                    <Button
                      variant="accent"
                      onClick={() => {
                        fireAndForget(
                          dismissNotificationModal(activeModalNotification),
                          "accept tournament notification"
                        );
                      }}
                    >
                      Accept Spot
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="accent"
                    onClick={() => {
                      fireAndForget(
                        dismissNotificationModal(activeModalNotification),
                        "dismiss racer notification"
                      );
                    }}
                  >
                    {activeModalNotification.type === "queue_get_ready"
                      ? "I'm On My Way"
                      : "Dismiss"}
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </LayoutGroup>
  );
}
