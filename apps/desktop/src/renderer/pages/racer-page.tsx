import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AppSnapshot,
  BracketNode,
  ChallengeReplacementOption,
  NotificationConfig,
  PhotoBoothTokenResponse,
  RacerNotification,
  RoundRobinMatch,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import {
  EliminationBracketView,
  type BracketPresentationRequest
} from "../components/elimination-bracket-view";
import { TournamentBracketBoard } from "../components/admin/tournament-board";
import { getCurrentMatchNodeId } from "../components/tournament-flow-layout";
import { Button, EmptyState, Panel, SearchableSelect, TextInput } from "@roller-rumble/shared-ui";
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
const notificationQueuePromptStorageKey = "roller-rumble.notifications.queuePromptedAt";
type RacerTabId = "race" | "queue" | "tournament" | "racers" | "me";

interface ChallengeReplacementRequest {
  message: string;
  opponentRacerId: string;
  replaceableMatches: ChallengeReplacementOption[];
}

interface QueueIssueModal {
  eyebrow: string;
  title: string;
  message: string;
}

const racerTabs: Array<{ id: RacerTabId; label: string }> = [
  { id: "race", label: "Race" },
  { id: "queue", label: "Queue" },
  { id: "tournament", label: "Tournament" },
  { id: "racers", label: "Racers" },
  { id: "me", label: "Me" }
];

function normalizeRacerTab(tab: string | undefined): RacerTabId {
  return racerTabs.some((entry) => entry.id === tab) ? (tab as RacerTabId) : "race";
}

function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "fee not set";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

function formatFinishTime(milliseconds: number | null | undefined): string {
  if (typeof milliseconds !== "number") {
    return "No finish yet";
  }

  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes)}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function getPasskeyUnavailableMessage(): string | null {
  if (!("PublicKeyCredential" in window)) {
    return "This browser does not support passkeys.";
  }

  if (!window.isSecureContext) {
    return "Passkeys require HTTPS or localhost. Use the Cloudflare tunnel link from the projector/admin QR for phone registration.";
  }

  return null;
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

type TournamentRaceCard =
  | {
      id: string;
      kind: "bracket";
      label: string;
      racerAId?: string | null;
      racerBId?: string | null;
      roundLabel: string;
      state: BracketNode["state"];
      winnerRacerId?: string | null;
    }
  | {
      id: string;
      kind: "group";
      label: string;
      racerAId: string;
      racerBId: string;
      roundLabel: string;
      state: "ready" | "finished";
      winnerRacerId?: string | null;
    };

function getBracketRoundLabel(node: BracketNode): string {
  const bracket = typeof node.meta.bracket === "string" ? node.meta.bracket : "winners";
  if (bracket === "grand-final") {
    return "Grand Final";
  }
  if (bracket === "reset") {
    return "Reset Match";
  }
  if (bracket === "losers") {
    return `Losers ${node.roundNumber}`;
  }
  return `Winners ${node.roundNumber}`;
}

function getStageOrder(bundle: TournamentBundle, stageId: string): number {
  return bundle.stages.find((stage) => stage.id === stageId)?.order ?? Number.MAX_SAFE_INTEGER;
}

function sortBracketNodesByStageRoundAndMatch(
  bundle: TournamentBundle,
  nodes: BracketNode[]
): BracketNode[] {
  return [...nodes].sort((left, right) => {
    const stageDelta = getStageOrder(bundle, left.stageId) - getStageOrder(bundle, right.stageId);
    if (stageDelta !== 0) {
      return stageDelta;
    }
    if (left.roundNumber !== right.roundNumber) {
      return left.roundNumber - right.roundNumber;
    }
    return left.matchNumber - right.matchNumber;
  });
}

function getCurrentTournamentRaceCards(
  snapshot: AppSnapshot,
  bundle: TournamentBundle
): TournamentRaceCard[] {
  const currentRace = snapshot.raceProjection.race;
  const currentRaceParticipantIds = currentRace?.participants.map(
    (participant) => participant.racerId
  );
  const currentBracketNode =
    currentRace?.tournamentId === bundle.tournament.id && currentRaceParticipantIds
      ? bundle.bracketNodes.find((node) => {
          const nodeIds = [node.racerAId, node.racerBId].filter(Boolean).sort();
          return (
            nodeIds.length === currentRaceParticipantIds.length &&
            nodeIds.every((id, index) => id === [...currentRaceParticipantIds].sort()[index])
          );
        })
      : null;

  const sortedBracketNodes = sortBracketNodesByStageRoundAndMatch(bundle, bundle.bracketNodes);
  const activeBracketNodes = sortedBracketNodes.filter(
    (node) => node.state !== "finished" && node.state !== "bye"
  );
  const firstReadyBracketNode = activeBracketNodes.find((node) => node.state === "ready");
  const currentStageId =
    currentBracketNode?.stageId ??
    firstReadyBracketNode?.stageId ??
    activeBracketNodes[0]?.stageId ??
    sortedBracketNodes[0]?.stageId ??
    null;
  const currentRoundNumber =
    currentBracketNode?.roundNumber ??
    firstReadyBracketNode?.roundNumber ??
    activeBracketNodes.find((node) => node.stageId === currentStageId)?.roundNumber ??
    sortedBracketNodes.find((node) => node.stageId === currentStageId)?.roundNumber ??
    null;
  const bracketNodes = currentStageId
    ? sortedBracketNodes.filter((node) => node.stageId === currentStageId)
    : [];
  const currentRoundBracketNodes = currentRoundNumber
    ? bracketNodes.filter((node) => node.roundNumber === currentRoundNumber)
    : [];

  if (currentRoundBracketNodes.length > 0) {
    return currentRoundBracketNodes.map((node) => ({
      id: node.id,
      kind: "bracket",
      label: node.slotLabel,
      racerAId: node.racerAId,
      racerBId: node.racerBId,
      roundLabel: getBracketRoundLabel(node),
      state: node.state,
      winnerRacerId: node.winnerRacerId
    }));
  }

  const unfinishedGroupMatches = bundle.groupMatches.filter((match) => !match.winnerRacerId);
  const groupMatches =
    unfinishedGroupMatches.length > 0 ? unfinishedGroupMatches : bundle.groupMatches;
  return groupMatches.map((match: RoundRobinMatch) => ({
    id: match.id,
    kind: "group",
    label: match.scoreLabel ?? "Tournament match",
    racerAId: match.racerAId,
    racerBId: match.racerBId,
    roundLabel: "Current Stage",
    state: match.winnerRacerId ? "finished" : "ready",
    winnerRacerId: match.winnerRacerId
  }));
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

function PhotoBoothCard() {
  return (
    <Panel title="Photo Booth">
      <PhotoBoothQr />
    </Panel>
  );
}

type RacerPageProps = {
  focusEventId?: string;
  initialTab?: string;
  source?: string;
};

export function RacerPage({ focusEventId, initialTab }: RacerPageProps) {
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
  const [queueIssueModal, setQueueIssueModal] = useState<QueueIssueModal | null>(null);
  const [challengeReplacementRequest, setChallengeReplacementRequest] =
    useState<ChallengeReplacementRequest | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
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
  const [bracketPresentationRequest, setBracketPresentationRequest] =
    useState<BracketPresentationRequest | null>(null);
  const racerContentRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<RacerTabId>(() => normalizeRacerTab(initialTab));
  const [selectedRacerDetailId, setSelectedRacerDetailId] = useState<string | null>(null);
  const [selectedRacerId, setSelectedRacerId] = useState(
    localStorage.getItem("roller-rumble.racerId") ?? ""
  );
  const paymentReturnState = new URLSearchParams(window.location.search).get("payment");
  const paymentReturnId = new URLSearchParams(window.location.search).get("payment_id");
  const launchedNotificationId = new URLSearchParams(window.location.search).get("notificationId");
  const [accountlessId] = useState(() => {
    const existing =
      localStorage.getItem("roller-rumble.accountlessId") ??
      localStorage.getItem("roller-rumble.anonymousId");
    if (existing) {
      localStorage.setItem("roller-rumble.accountlessId", existing);
      return existing;
    }

    const created = crypto.randomUUID();
    localStorage.setItem("roller-rumble.accountlessId", created);
    return created;
  });
  const racerNotificationsQuery = useRacerNotificationsQuery(Boolean(selectedRacerId));

  const refreshDeviceNotificationState = useCallback(async (): Promise<void> => {
    if (!isPushSupported() || Notification.permission !== "granted") {
      setDeviceNotificationsEnabled(false);
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    const subscriptions = await Promise.all(
      registrations.map((registration) => registration.pushManager.getSubscription())
    );
    setDeviceNotificationsEnabled(subscriptions.some(Boolean));
  }, []);

  useEffect(() => {
    setActiveTab(normalizeRacerTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (
      selectedRacerDetailId &&
      snapshot &&
      !snapshot.racers.some((entry) => entry.racer.id === selectedRacerDetailId)
    ) {
      setSelectedRacerDetailId(null);
    }
  }, [selectedRacerDetailId, snapshot]);

  useEffect(() => {
    if (
      snapshot &&
      !selectedRacerId &&
      !snapshot.settings.showPublicRacerInfoWithoutLogin &&
      activeTab !== "race"
    ) {
      setActiveTab("race");
    }
  }, [activeTab, selectedRacerId, snapshot]);

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
        localStorage.setItem("roller-rumble.racerId", result.racer.id);
        setSelectedRacerId(result.racer.id);
      } else {
        forgetRacerSessionToken();
        localStorage.removeItem("roller-rumble.racerId");
        setSelectedRacerId("");
      }
    }
    fireAndForget(hydrateSession(), "hydrate racer session");
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    fireAndForget(refreshDeviceNotificationState(), "check racer notification device state");

    function refreshOnVisible(): void {
      if (document.visibilityState === "visible") {
        fireAndForget(refreshDeviceNotificationState(), "refresh racer notification device state");
      }
    }

    window.addEventListener("focus", refreshOnVisible);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.removeEventListener("focus", refreshOnVisible);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refreshDeviceNotificationState]);

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
    snapshot?: AppSnapshot;
    sessionToken?: string | null;
  }): void {
    rememberRacerSessionToken(result.sessionToken);
    if (result.snapshot) {
      queryClient.setQueryData(snapshotQueryKey, result.snapshot);
    }
    localStorage.setItem("roller-rumble.racerId", result.racer.id);
    setSelectedRacerId(result.racer.id);
    setActiveTab("race");
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
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
    localStorage.removeItem("roller-rumble.racerId");
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
    setDeviceNotificationsEnabled(true);
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
      setDeviceNotificationsEnabled(false);
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
    replaceQueueEntryId?: string;
  }): Promise<void> {
    const maxActiveEntries = snapshot?.settings.maxActiveQueueEntriesPerRacer ?? 3;
    if (!input.opponentRacerId && selectedRacerQueueEntries.length >= maxActiveEntries) {
      setQueueIssueModal({
        eyebrow: "Queue Limit",
        title: "Already queued",
        message: `You are already queued ${String(maxActiveEntries)} time${
          maxActiveEntries === 1 ? "" : "s"
        }. Finish or leave one of those races before joining again.`
      });
      return;
    }

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
      if (result.status === "challenge_replacement_required") {
        setChallengeReplacementRequest({
          message: result.message,
          opponentRacerId: result.opponentRacerId,
          replaceableMatches: result.replaceableMatches
        });
        queryClient.setQueryData(snapshotQueryKey, result.snapshot);
        setQueueMessage(null);
        return;
      }
      queryClient.setQueryData(snapshotQueryKey, result.snapshot);
      setQueueMessage(null);
      setNotificationPromptVisible(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "payment_required") {
        setQueueMessage(error.message);
        return;
      }
      if (error instanceof ApiError && error.code === "max_active_queue_entries") {
        setQueueIssueModal({
          eyebrow: "Queue Limit",
          title: "Already queued",
          message: error.message
        });
        return;
      }
      if (error instanceof ApiError && error.code === "challenge_target_unavailable") {
        setQueueIssueModal({
          eyebrow: "Challenge Queue",
          title: "Challenge unavailable",
          message: error.message
        });
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

  const liveSnapshot = snapshot;
  const selectedRacer = liveSnapshot.racers.find((entry) => entry.racer.id === selectedRacerId);
  const selectedRacerQueueEntries = snapshot.queue.filter((entry) =>
    entry.racerIds.includes(selectedRacerId)
  );
  const selectedRacerNextQueueEntry = [...selectedRacerQueueEntries]
    .sort((left, right) => left.position - right.position)
    .at(0);
  const selectedRacerAvatarUrl = resolveBackendAssetUrl(selectedRacer?.racer.avatarUrl);
  const selectedRacerHasEmail = Boolean(
    selectedRacer?.racer.identities.some((identity) => identity.type === "email")
  );
  const canBrowsePublicRacerInfo =
    Boolean(selectedRacer) || snapshot.settings.showPublicRacerInfoWithoutLogin;
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
        animate: { opacity: 1, scale: 1 },
        exit: {
          opacity: 0,
          scale: 0.985,
          transition: { duration: 0.16, ease: "easeOut" as const }
        },
        initial: { opacity: 0, scale: 0.99 }
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
    !deviceNotificationsEnabled &&
    (notificationPromptVisible ||
      paymentReturnState === "success" ||
      selectedRacerQueueEntries.length > 0);
  const passkeyUnavailableMessage = getPasskeyUnavailableMessage();
  const currentRace = snapshot.raceProjection.race;
  const currentRaceNames = currentRace
    ? currentRace.participants
        .map((participant) => resolveRacerName(snapshot, participant.racerId))
        .join(" vs ")
    : null;
  const selectedRacerInCurrentRace = Boolean(
    selectedRacerId &&
    currentRace?.participants.some((participant) => participant.racerId === selectedRacerId)
  );
  const tournamentMode = Boolean(activeTournament);
  const selectedRacerIsInActiveTournament = Boolean(
    activeTournament &&
    selectedRacerId &&
    activeTournament.seeds.some((seed) => seed.racerId === selectedRacerId)
  );
  const tournamentRaceCards = activeTournament
    ? getCurrentTournamentRaceCards(snapshot, activeTournament)
    : [];
  const raceQueuePreviewEntries = tournamentMode ? [] : upcoming.slice(0, 3);
  const showFullQueueLink = !tournamentMode && upcoming.length > 3;
  const activeTabs = canBrowsePublicRacerInfo
    ? racerTabs
    : racerTabs.filter((tab) => tab.id === "race");
  const authOnlyMode = !selectedRacer && !canBrowsePublicRacerInfo && !bracketExpanded;
  const eventStatusLabel =
    currentRace?.state === "active"
      ? "Race live"
      : currentRace?.state === "countdown"
        ? "Countdown"
        : currentRace?.state === "staging"
          ? "Staging"
          : activeTournament
            ? "Tournament active"
            : upcoming.length > 0
              ? "Queue open"
              : "Open event";

  function canShowBracket(bundle: (typeof tournaments)[number]): boolean {
    return bundle.bracketNodes.length > 0;
  }

  function handleFocusCurrentBracketMatch(bundle: TournamentBundle): void {
    const currentMatchNodeId = getCurrentMatchNodeId(liveSnapshot, bundle);
    if (!currentMatchNodeId) {
      return;
    }

    setBracketPresentationRequest({
      durationMs: reduceMotion ? 0 : 900,
      key: `${bundle.tournament.id}:focus-current:${Date.now()}`,
      maxZoom: 1.22,
      nodeIds: [currentMatchNodeId],
      padding: 0.95,
      type: "focus-node"
    });
  }

  function renderBracketFocusAction(bundle: TournamentBundle): ReactElement {
    const currentMatchNodeId = getCurrentMatchNodeId(liveSnapshot, bundle);

    return (
      <Button
        variant="ghost"
        disabled={!currentMatchNodeId}
        onClick={() => {
          handleFocusCurrentBracketMatch(bundle);
        }}
      >
        Focus Current
      </Button>
    );
  }

  function handleTabChange(tabId: RacerTabId): void {
    if (tabId === activeTab) {
      return;
    }
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    if (tabId === "race") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tabId);
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function handleChallengeRacer(opponentRacerId: string): void {
    fireAndForget(handleQueueSignup({ opponentRacerId }), "challenge racer");
  }

  function renderInlineTabLink(tabId: RacerTabId, label: string): ReactElement {
    return (
      <button
        type="button"
        className="racer-inline-link"
        onClick={() => {
          handleTabChange(tabId);
        }}
      >
        {label}
      </button>
    );
  }

  function renderQueueActions(): ReactElement {
    return (
      <div className="stack-sm">
        <div className="racer-section-heading">
          <strong>Join the next race</strong>
          <p>
            {liveSnapshot.activeEvent.paymentRequiredForQueue
              ? `Entry is ${formatPaymentAmount(
                  liveSnapshot.activeEvent.paymentAmountCents,
                  liveSnapshot.activeEvent.paymentCurrency
                )}. Checkout will open if you have not paid yet.`
              : "Jump into the next open time trial race with one tap."}
          </p>
        </div>
        {paymentReturnState === "success" ? (
          <p className="form-success">
            {selectedRacer?.payment.status === "paid"
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
              fireAndForget(handleQueueSignup({ requestedType: "solo" }), "join solo queue");
            }}
          >
            Solo Run
          </Button>
        </div>
        <div className="racer-challenge-controls">
          <label className="racer-picker-label">
            Challenge
            <SearchableSelect
              value={selectedOpponent}
              placeholder="Type to find an opponent"
              options={liveSnapshot.racers
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
    );
  }

  function renderQueuePreviewPanel(): ReactElement | null {
    if (raceQueuePreviewEntries.length === 0) {
      return null;
    }

    return (
      <Panel title="Next Up">
        <div className="racer-race-preview stack-sm">
          <div className="racer-section-heading">
            <strong>Next up</strong>
            <p>The next few queue matches.</p>
          </div>
          <div className="list">
            {raceQueuePreviewEntries.map((entry) => (
              <div key={entry.id} className="list-row">
                <strong>
                  #{entry.position}{" "}
                  {entry.racerIds
                    .map((racerId) => resolveRacerName(liveSnapshot, racerId))
                    .join(" vs ")}
                </strong>
                <span>{describeQueueEntry(entry)}</span>
              </div>
            ))}
          </div>
          {showFullQueueLink ? renderInlineTabLink("queue", "View full queue") : null}
        </div>
      </Panel>
    );
  }

  function renderTournamentRaceCard(card: TournamentRaceCard): ReactElement {
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
      <div key={card.id} className={`tournament-match-node tournament-match-node--${card.state}`}>
        <div className="tournament-match-node__meta">
          <div>
            <p className="eyebrow">{card.roundLabel}</p>
            <strong className="tournament-match-node__label">{card.label}</strong>
          </div>
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

  function renderTournamentRacePreview(): ReactElement | null {
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
              {tournamentRaceCards.map((card) => renderTournamentRaceCard(card))}
            </div>
          ) : (
            <EmptyState
              title="No active tournament matches"
              body="The bracket will show the next stage as soon as the host advances the tournament."
            />
          )}
          {renderInlineTabLink("tournament", "View tournament")}
        </div>
      </Panel>
    );
  }

  function renderAuthForm(): ReactElement {
    return (
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
        {passkeyUnavailableMessage ? (
          <p className="form-error">{passkeyUnavailableMessage}</p>
        ) : null}
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
                Enter the name people should see on the race display. You can add email and a
                passkey later.
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
              disabled={!email || !displayName || authBusy || Boolean(passkeyUnavailableMessage)}
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
              disabled={!email || authBusy || Boolean(passkeyUnavailableMessage)}
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
    );
  }

  function renderRaceDashboard(): ReactElement {
    if (!selectedRacer) {
      if (!canBrowsePublicRacerInfo) {
        return (
          <div className="racer-card-stack">
            <Panel title="Register">{renderAuthForm()}</Panel>
          </div>
        );
      }

      if (tournamentMode) {
        return (
          <div className="racer-card-stack">
            {renderTournamentRacePreview()}
            <Panel title="Register">
              <div className="racer-signin-cta">
                <strong>Ready to ride?</strong>
                <Button
                  variant="accent"
                  onClick={() => {
                    handleTabChange("me");
                  }}
                >
                  Sign in or register
                </Button>
              </div>
            </Panel>
          </div>
        );
      }

      return (
        <div className="racer-card-stack">
          <Panel title="Race">
            <div className="stack-md">
              {canBrowsePublicRacerInfo ? (
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
              ) : (
                <EmptyState
                  title="Sign in to race"
                  body="Register or sign in before joining the queue, challenging another racer, or getting race alerts."
                />
              )}
              <div className="racer-signin-cta">
                <strong>Ready to ride?</strong>
                <Button
                  variant="accent"
                  onClick={() => {
                    handleTabChange("me");
                  }}
                >
                  Sign in or register
                </Button>
              </div>
            </div>
          </Panel>
          {renderQueuePreviewPanel()}
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
                    fireAndForget(handleTournamentOptOut(), "opt out of tournament");
                  }}
                >
                  {tournamentOptOutBusy ? "Opting out..." : "Opt out"}
                </Button>
                {tournamentOptOutMessage ? <p>{tournamentOptOutMessage}</p> : null}
              </div>
            </Panel>
          ) : null}
          {renderTournamentRacePreview()}
        </div>
      );
    }

    return (
      <div className="racer-card-stack">
        <Panel title="Race">
          <div className="stack-md">
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
            ) : null}

            {!selectedRacerInCurrentRace ? renderQueueActions() : null}

            {liveSnapshot.activeEvent.paymentRequiredForQueue ? (
              <div className="racer-payment-summary">
                <span>Payment</span>
                <strong>{selectedRacer.payment.status}</strong>
                <p>
                  {formatPaymentAmount(
                    liveSnapshot.activeEvent.paymentAmountCents,
                    liveSnapshot.activeEvent.paymentCurrency
                  )}
                </p>
              </div>
            ) : null}

            {selectedRacerIsInActiveTournament && visibleTournament ? (
              <div className="racer-state-card">
                <span>Tournament</span>
                <strong>{visibleTournament.tournament.name}</strong>
                <p>{visibleTournament.tournament.status}</p>
              </div>
            ) : null}
          </div>
        </Panel>
        {renderQueuePreviewPanel()}
      </div>
    );
  }

  function renderRacerStat(label: string, value: string, detail?: string): ReactElement {
    return (
      <div className="racer-detail-stat">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    );
  }

  function renderExpandedRacerStats(entry: (typeof liveSnapshot.racers)[number]): ReactElement {
    const racerQueueEntries = upcoming
      .filter((queueEntry) => queueEntry.racerIds.includes(entry.racer.id))
      .sort((left, right) => left.position - right.position);
    const tournamentSeed = visibleTournament?.seeds.find((seed) => seed.racerId === entry.racer.id);

    return (
      <div className="racer-detail stack-md">
        <div className="racer-detail-stat-grid">
          {renderRacerStat(
            "Event Record",
            `${entry.stats.eventWins}-${Math.max(0, entry.stats.eventRaces - entry.stats.eventWins)}`,
            `${entry.stats.eventRaces} event races`
          )}
          {renderRacerStat(
            "Career Record",
            `${entry.stats.wins}-${Math.max(0, entry.stats.races - entry.stats.wins)}`,
            `${entry.stats.careerRaces} total races`
          )}
          {renderRacerStat("Best Finish", formatFinishTime(entry.stats.bestFinishTimeMs))}
          {renderRacerStat("Top Speed", `${entry.stats.topSpeedKph.toFixed(1)} km/h`)}
          {renderRacerStat("Average Speed", `${entry.stats.averageSpeedKph.toFixed(1)} km/h`)}
          {renderRacerStat("Peak Power", `${entry.stats.maxWattage.toFixed(0)}W`)}
          {renderRacerStat("Events Raced", String(entry.stats.careerEventCount))}
        </div>

        <div className="racer-detail-section">
          <h3>Queue</h3>
          {racerQueueEntries.length === 0 ? (
            <p>No active queue entries.</p>
          ) : (
            <div className="list">
              {racerQueueEntries.map((queueEntry) => (
                <div key={queueEntry.id} className="list-row">
                  <strong>Position #{queueEntry.position}</strong>
                  <span>{describeQueueEntry(queueEntry)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {visibleTournament ? (
          <div className="racer-detail-section">
            <h3>Tournament</h3>
            {tournamentSeed ? (
              <p>
                Seed #{tournamentSeed.seed} in {visibleTournament.tournament.name} ·{" "}
                {visibleTournament.tournament.status}
              </p>
            ) : (
              <p>Not seeded in {visibleTournament.tournament.name}.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <LayoutGroup id="racer-workspace">
      <div
        className={`racer-page-shell${bracketExpanded ? " racer-page-shell--expanded" : ""}${
          authOnlyMode ? " racer-page-shell--auth-only" : ""
        }`}
      >
        {!bracketExpanded ? (
          <header className="racer-event-bar">
            <div>
              <span>{eventStatusLabel}</span>
              <strong>{snapshot.activeEvent.name}</strong>
            </div>
            <div className="racer-event-bar__meta">
              {selectedRacer ? (
                <span>{selectedRacer.racer.displayName}</span>
              ) : (
                <span>{canBrowsePublicRacerInfo ? "Viewing event info" : "Sign in to race"}</span>
              )}
              {snapshot.activeEvent.paymentRequiredForQueue ? (
                <span>
                  {formatPaymentAmount(
                    snapshot.activeEvent.paymentAmountCents,
                    snapshot.activeEvent.paymentCurrency
                  )}
                </span>
              ) : null}
            </div>
          </header>
        ) : null}

        <div
          key={bracketExpanded ? "bracket-expanded" : activeTab}
          ref={racerContentRef}
          className={`page-grid racer-page-grid${
            bracketExpanded ? " racer-page-grid--bracket-expanded" : ""
          }`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {!bracketExpanded && activeTab === "race" ? (
              <motion.div
                key="racer-race-dashboard"
                layout="position"
                transition={{ layout: layoutTransition }}
                {...supportingCardMotion}
                className="racer-page-grid__card racer-page-grid__card--supporting"
              >
                {renderRaceDashboard()}
              </motion.div>
            ) : null}

            {!bracketExpanded && activeTab === "me" ? (
              <motion.div
                key="racer-identity"
                layout="position"
                transition={{ layout: layoutTransition }}
                {...supportingCardMotion}
                className="racer-page-grid__card racer-page-grid__card--supporting stack-md"
              >
                <Panel title={selectedRacer ? "Your Race Card" : "Register"}>
                  {selectedRacer ? (
                    <div className="stack-md">
                      <div className="race-metric-card__header">
                        {selectedRacerAvatarUrl ? (
                          <div className="racer-avatar-frame">
                            <img
                              className="racer-avatar racer-avatar--large"
                              src={selectedRacerAvatarUrl}
                              alt={selectedRacer.racer.displayName}
                            />
                            <label
                              className={`racer-avatar-edit-button${
                                avatarUploadBusy ? " is-disabled" : ""
                              }`}
                              aria-label="Upload new avatar"
                              title="Upload new avatar"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                                <path d="M4 20h4l11-11-4-4L4 16v4z" />
                                <path d="M14 6l4 4" />
                              </svg>
                              <input
                                className="racer-avatar-edit-button__input"
                                type="file"
                                accept="image/*"
                                disabled={avatarUploadBusy}
                                onChange={(event) => {
                                  fireAndForget(handleAvatarUpload(event));
                                }}
                              />
                            </label>
                          </div>
                        ) : (
                          <span className="racer-avatar racer-avatar--large">
                            {selectedRacer.racer.displayName[0]}
                          </span>
                        )}
                        <div>
                          <strong>{selectedRacer.racer.displayName}</strong>
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
                      {selectedRacerAvatarUrl && avatarUploadMessage ? (
                        <p>{avatarUploadMessage}</p>
                      ) : null}
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
                      {!deviceNotificationsEnabled ? (
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
                                  fireAndForget(
                                    handleEnableNotifications(),
                                    "enable notifications"
                                  );
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
                                  fireAndForget(
                                    handleEnableNotifications(),
                                    "enable notifications"
                                  );
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
                                          markRacerNotificationRead(
                                            notification.notificationId
                                          ).then((nextNotifications) => {
                                            queryClient.setQueryData(
                                              racerNotificationsQueryKey,
                                              nextNotifications
                                            );
                                          }),
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
                      ) : null}
                      {!selectedRacerAvatarUrl ? (
                        <>
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
                        </>
                      ) : null}
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
                    </div>
                  ) : (
                    renderAuthForm()
                  )}
                </Panel>
                {selectedRacer && !selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
                {selectedRacer ? (
                  <Panel title="Your Stats">{renderExpandedRacerStats(selectedRacer)}</Panel>
                ) : null}
                {selectedRacer && selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
              </motion.div>
            ) : null}

            {!bracketExpanded && activeTab === "queue" && canBrowsePublicRacerInfo ? (
              <>
                {tournamentMode ? (
                  <motion.div
                    key="racer-queue-paused"
                    layout="position"
                    transition={{ layout: layoutTransition }}
                    {...supportingCardMotion}
                    className="racer-page-grid__card racer-page-grid__card--supporting"
                  >
                    <Panel title="Tournament Mode">
                      <EmptyState
                        title="Open queue paused"
                        body="The event is currently running a tournament. The open queue is visible for reference, but racers cannot join it until tournament mode ends."
                      />
                    </Panel>
                  </motion.div>
                ) : null}
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
                        body={
                          tournamentMode
                            ? "Open race queueing is paused while the tournament is active."
                            : "The queue is open. Be the first racer to jump in."
                        }
                      />
                    ) : (
                      <div className={`list${tournamentMode ? " racer-queue-list--paused" : ""}`}>
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
                {selectedRacer && !tournamentMode ? (
                  <motion.div
                    key="racer-queue-controls"
                    layout="position"
                    transition={{ layout: layoutTransition }}
                    {...supportingCardMotion}
                    className="racer-page-grid__card racer-page-grid__card--supporting"
                  >
                    <Panel title="Queue Controls">{renderQueueActions()}</Panel>
                  </motion.div>
                ) : null}
              </>
            ) : null}

            {!bracketExpanded && activeTab === "racers" && canBrowsePublicRacerInfo ? (
              <motion.div
                key="racer-list"
                layout="position"
                transition={{ layout: layoutTransition }}
                {...supportingCardMotion}
                className="racer-page-grid__card racer-page-grid__card--supporting"
              >
                <Panel title="Event Racers">
                  <div className="list">
                    {snapshot.racers.map((entry) => {
                      const isExpanded = selectedRacerDetailId === entry.racer.id;
                      const rowAvatarUrl = resolveBackendAssetUrl(entry.racer.avatarUrl);
                      return (
                        <motion.div
                          key={entry.racer.id}
                          layout="position"
                          className={`list-row racer-list-row${
                            isExpanded ? " racer-list-row--expanded" : ""
                          }`}
                        >
                          <div className="racer-list-row__header">
                            <button
                              type="button"
                              className="racer-list-row__main"
                              aria-expanded={isExpanded}
                              onClick={() => {
                                setSelectedRacerDetailId(isExpanded ? null : entry.racer.id);
                              }}
                            >
                              {rowAvatarUrl ? (
                                <motion.img
                                  layout
                                  className={`racer-list-row__avatar${
                                    isExpanded ? " racer-list-row__avatar--expanded" : ""
                                  }`}
                                  src={rowAvatarUrl}
                                  alt={entry.racer.displayName}
                                />
                              ) : null}
                              <span className="racer-list-row__identity">
                                <strong>{entry.racer.displayName}</strong>
                                {!isExpanded ? (
                                  <p>
                                    {entry.stats.races} races · {entry.stats.topSpeedKph.toFixed(1)}{" "}
                                    km/h top speed · {entry.stats.maxWattage.toFixed(0)}W peak
                                  </p>
                                ) : null}
                              </span>
                            </button>
                            {selectedRacer &&
                            entry.racer.id !== selectedRacerId &&
                            !tournamentMode ? (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  handleChallengeRacer(entry.racer.id);
                                }}
                              >
                                Challenge
                              </Button>
                            ) : null}
                          </div>
                          <AnimatePresence initial={false}>
                            {isExpanded ? (
                              <motion.div
                                key="expanded-racer-stats"
                                className="racer-list-row__expanded"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                              >
                                {renderExpandedRacerStats(entry)}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </Panel>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {bracketExpanded || (activeTab === "tournament" && canBrowsePublicRacerInfo) ? (
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
                actions={
                  bracketExpanded && expandedBracketTournament
                    ? renderBracketFocusAction(expandedBracketTournament)
                    : undefined
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
                    hintText="Follow the live elimination board here."
                    expanded
                    onExpandedChange={(expanded) => {
                      setExpandedBracketTournamentId(
                        expanded ? expandedBracketTournament.tournament.id : null
                      );
                    }}
                    presentationRequest={bracketPresentationRequest}
                    showViewportControls={false}
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
                            <div className="button-row">
                              {canShowBracket(bundle) ? renderBracketFocusAction(bundle) : null}
                              {selectedRacerCanOptOutOfVisibleTournament &&
                              bundle.tournament.id === visibleTournament?.tournament.id ? (
                                <Button
                                  variant="ghost"
                                  disabled={tournamentOptOutBusy}
                                  onClick={() => {
                                    fireAndForget(
                                      handleTournamentOptOut(),
                                      "opt out of tournament"
                                    );
                                  }}
                                >
                                  {tournamentOptOutBusy ? "Opting out..." : "Opt out"}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          {tournamentOptOutMessage ? <p>{tournamentOptOutMessage}</p> : null}
                          {canShowBracket(bundle) ? (
                            <EliminationBracketView
                              snapshot={snapshot}
                              bundle={bundle}
                              expandMode="container"
                              expanded={expandedBracketTournamentId === bundle.tournament.id}
                              onExpandedChange={(expanded) => {
                                setExpandedBracketTournamentId(
                                  expanded ? bundle.tournament.id : null
                                );
                              }}
                              presentationRequest={bracketPresentationRequest}
                              showViewportControls={false}
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
          ) : null}
        </div>

        {!bracketExpanded && activeTabs.length > 1 ? (
          <nav className="racer-bottom-tabs" aria-label="Racer sections">
            {activeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`racer-bottom-tab${activeTab === tab.id ? " is-active" : ""}`}
                disabled={activeTab === tab.id}
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => {
                  handleTabChange(tab.id);
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
      <AnimatePresence>
        {challengeReplacementRequest ? (
          <motion.div
            className="racer-notification-modal racer-notification-modal--challenge-replacement"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="racer-challenge-replacement-modal-title"
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
                  setChallengeReplacementRequest(null);
                }}
              >
                Close
              </button>
              <span className="racer-notification-modal__eyebrow">Challenge Queue</span>
              <h2 id="racer-challenge-replacement-modal-title">Pick a challenge to replace</h2>
              <p>{challengeReplacementRequest.message}</p>
              <div className="racer-notification-modal__match-list">
                {challengeReplacementRequest.replaceableMatches.map((match) => (
                  <button
                    key={match.queueEntryId}
                    type="button"
                    className="racer-notification-modal__match-option"
                    onClick={() => {
                      const opponentRacerId = challengeReplacementRequest.opponentRacerId;
                      setChallengeReplacementRequest(null);
                      fireAndForget(
                        handleQueueSignup({
                          opponentRacerId,
                          replaceQueueEntryId: match.queueEntryId
                        }),
                        "replace challenge queue match"
                      );
                    }}
                  >
                    <span>Queue #{match.position}</span>
                    <strong>vs {match.opponentDisplayName}</strong>
                  </button>
                ))}
              </div>
              <div className="racer-notification-modal__actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setChallengeReplacementRequest(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {queueIssueModal ? (
          <motion.div
            className="racer-notification-modal racer-notification-modal--queue-limit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="racer-queue-limit-modal-title"
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
                  setQueueIssueModal(null);
                }}
              >
                Close
              </button>
              <span className="racer-notification-modal__eyebrow">{queueIssueModal.eyebrow}</span>
              <h2 id="racer-queue-limit-modal-title">{queueIssueModal.title}</h2>
              <p>{queueIssueModal.message}</p>
              <div className="racer-notification-modal__actions">
                <Button
                  variant="accent"
                  onClick={() => {
                    setQueueIssueModal(null);
                  }}
                >
                  Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
