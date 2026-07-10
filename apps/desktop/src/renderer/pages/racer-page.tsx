import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AppSnapshot,
  BracketNode,
  NotificationConfig,
  RacerNotification,
  RoundRobinMatch,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import type { BracketPresentationRequest } from "../components/elimination-bracket-view";
import {
  ApiError,
  cancelRacerCheckoutPayment,
  createAccountlessRacerSession,
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
import { resolveRacerName } from "../lib/snapshot-display";
import { fireAndForget } from "../lib/ui-actions";
import {
  racerNotificationsQueryKey,
  snapshotQueryKey,
  useNotificationConfigQuery,
  useRacerNotificationsQuery,
  useSnapshotQuery
} from "../lib/query";
import type { AuthFormProps } from "./racer-sections/auth";
import { MeTab } from "./racer-sections/me";
import {
  ChallengeReplacementModal,
  QueueIssueModalView,
  RacerNotificationModal
} from "./racer-sections/modals";
import { QueueTab } from "./racer-sections/queue";
import { RaceDashboard } from "./racer-sections/race";
import { RacersTab } from "./racer-sections/racers";
import type {
  ChallengeReplacementRequest,
  QueueIssueModal,
  TournamentRaceCard
} from "./racer-sections/shared";
import { RacerBottomTabs } from "./racer-sections/tabs";
import { TournamentTab } from "./racer-sections/tournament";
import { TournamentOptOutConfirmModal } from "./racer-sections/tournament-opt-out-confirm-modal";

type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]["optionsJSON"];
const notificationQueuePromptStorageKey = "roller-rumble.notifications.queuePromptedAt";
export type RacerTabId = "race" | "queue" | "tournament" | "racers" | "me";

const racerTabs: { id: RacerTabId; label: string }[] = [
  { id: "race", label: "Race" },
  { id: "queue", label: "Queue" },
  { id: "tournament", label: "Tournament" },
  { id: "racers", label: "Racers" },
  { id: "me", label: "Me" }
];

const usdPaymentAmountFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD"
});

function normalizeRacerTab(tab: string | undefined): RacerTabId {
  return racerTabs.some((entry) => entry.id === tab) ? (tab as RacerTabId) : "race";
}

function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "fee not set";
  }

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "USD") {
    return usdPaymentAmountFormatter.format(amountCents / 100);
  }

  return `${normalizedCurrency} ${(amountCents / 100).toFixed(2)}`;
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
  return nodes.toSorted((left, right) => {
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
  const currentRaceParticipantIds = currentRace?.participants
    .map((participant) => participant.racerId)
    .toSorted();
  const currentBracketNode =
    currentRace?.tournamentId === bundle.tournament.id && currentRaceParticipantIds
      ? bundle.bracketNodes.find((node) => {
          const nodeIds = [node.racerAId, node.racerBId].filter(Boolean).toSorted();
          return (
            nodeIds.length === currentRaceParticipantIds.length &&
            nodeIds.every((id, index) => id === currentRaceParticipantIds[index])
          );
        })
      : null;

  const sortedBracketNodes = sortBracketNodesByStageRoundAndMatch(bundle, bundle.bracketNodes);
  const activeBracketNodes = sortedBracketNodes.filter(
    (node) => node.state !== "finished" && node.state !== "bye"
  );
  const firstReadyBracketNode = activeBracketNodes.find((node) => node.state === "ready");
  const currentStageId =
    [
      currentBracketNode?.stageId,
      firstReadyBracketNode?.stageId,
      activeBracketNodes[0]?.stageId,
      sortedBracketNodes[0]?.stageId
    ].find((stageId) => stageId !== undefined) ?? null;
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

interface RacerPageProps {
  focusEventId?: string;
  initialTab?: string;
  source?: string;
}

interface RacerPageState {
  accountlessDisplayName: string;
  activeTab: RacerTabId;
  authBusy: boolean;
  authMessage: string | null;
  authMode: "email" | "register" | "host-assist";
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  bracketPresentationRequest: BracketPresentationRequest | null;
  challengeReplacementRequest: ChallengeReplacementRequest | null;
  deviceNotificationsEnabled: boolean;
  displayName: string;
  email: string;
  expandedBracketTournamentId: string | null;
  modalActionMessage: string | null;
  modalNotifications: RacerNotification[];
  notificationMessage: string | null;
  notificationPromptVisible: boolean;
  phone: string;
  queueIssueModal: QueueIssueModal | null;
  queueMessage: string | null;
  selectedOpponent: string;
  selectedRacerDetailId: string | null;
  selectedRacerId: string;
  tournamentOptOutBusy: boolean;
  tournamentOptOutConfirmOpen: boolean;
  tournamentOptOutMessage: string | null;
  upgradeDisplayName: string;
  upgradeEmail: string;
}

function createInitialRacerPageState(initialTab: string | undefined): RacerPageState {
  return {
    accountlessDisplayName: "",
    activeTab: normalizeRacerTab(initialTab),
    authBusy: false,
    authMessage: null,
    authMode: "email",
    avatarUploadBusy: false,
    avatarUploadMessage: null,
    bracketPresentationRequest: null,
    challengeReplacementRequest: null,
    deviceNotificationsEnabled: false,
    displayName: "",
    email: "",
    expandedBracketTournamentId: null,
    modalActionMessage: null,
    modalNotifications: [],
    notificationMessage: null,
    notificationPromptVisible: false,
    phone: "",
    queueIssueModal: null,
    queueMessage: null,
    selectedOpponent: "",
    selectedRacerDetailId: null,
    selectedRacerId: localStorage.getItem("roller-rumble.racerId") ?? "",
    tournamentOptOutBusy: false,
    tournamentOptOutConfirmOpen: false,
    tournamentOptOutMessage: null,
    upgradeDisplayName: "",
    upgradeEmail: ""
  };
}

function racerPageReducer(state: RacerPageState, patch: Partial<RacerPageState>): RacerPageState {
  return { ...state, ...patch };
}

function resolveStateAction<T>(action: SetStateAction<T>, currentValue: T): T {
  return typeof action === "function" ? (action as (value: T) => T)(currentValue) : action;
}

interface RacerPageViewFlags {
  authOnlyMode: boolean;
  bracketExpanded: boolean;
  canBrowsePublicRacerInfo: boolean;
  deviceNotificationsEnabled: boolean;
  notificationConfigured: boolean;
  selectedRacerCanOptOutOfVisibleTournament: boolean;
  selectedRacerHasEmail: boolean;
  selectedRacerInCurrentRace: boolean;
  selectedRacerIsInActiveTournament: boolean;
  shouldShowNotificationPrompt: boolean;
  showFullQueueLink: boolean;
  showNotificationDebugList: boolean;
  tournamentMode: boolean;
  tournamentOptOutBusy: boolean;
}

interface RacerPageViewProps {
  activeModalNotification: RacerNotification | null;
  activeTabs: { id: RacerTabId; label: string }[];
  activeTournament: TournamentBundle | undefined;
  authBusy: boolean;
  authFormProps: AuthFormProps;
  authMessage: string | null;
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  bracketPresentationRequest: BracketPresentationRequest | null;
  cancelTournamentOptOut: () => void;
  challengeReplacementRequest: ChallengeReplacementRequest | null;
  currentRace: AppSnapshot["raceProjection"]["race"] | null;
  currentRaceNames: string | null;
  dismissNotificationModal: (notification: RacerNotification) => Promise<void>;
  eventStatusLabel: string;
  expandedBracketTournament: TournamentBundle | null;
  expandedBracketTournamentId: string | null;
  flags: RacerPageViewFlags;
  handleAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleChallengeRacer: (opponentRacerId: string) => void;
  handleEnableNotifications: () => Promise<void>;
  handlePasskeyRegistration: (input: {
    displayName: string;
    email: string;
    phone?: string;
  }) => Promise<void>;
  handleQueueSignup: (input: {
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
    replaceQueueEntryId?: string;
  }) => Promise<void>;
  handleSignOut: () => Promise<void>;
  handleTabChange: (tabId: RacerTabId) => void;
  handleTournamentOptOut: () => Promise<void>;
  layoutTransition: MotionProps["transition"];
  liveSnapshot: AppSnapshot;
  modalActionMessage: string | null;
  notificationConfigMessage: string | null | undefined;
  notificationMessage: string | null;
  onMarkNotificationRead: (notification: RacerNotification) => Promise<void>;
  paymentReturnState: string | null;
  queueIssueModal: QueueIssueModal | null;
  queueMessage: string | null;
  raceQueuePreviewEntries: AppSnapshot["queue"];
  racerContentRef: RefObject<HTMLDivElement | null>;
  racerNotifications: RacerNotification[];
  reduceMotion: boolean;
  requestTournamentOptOut: () => Promise<void>;
  selectedOpponent: string;
  selectedRacer: AppSnapshot["racers"][number] | undefined;
  selectedRacerAvatarUrl: string | null;
  selectedRacerId: string;
  selectedRacerNextQueueEntry: AppSnapshot["queue"][number] | undefined;
  setBracketPresentationRequest: Dispatch<SetStateAction<BracketPresentationRequest | null>>;
  setChallengeReplacementRequest: Dispatch<SetStateAction<ChallengeReplacementRequest | null>>;
  setExpandedBracketTournamentId: Dispatch<SetStateAction<string | null>>;
  setQueueIssueModal: Dispatch<SetStateAction<QueueIssueModal | null>>;
  setSelectedOpponent: Dispatch<SetStateAction<string>>;
  setSelectedRacerDetailId: Dispatch<SetStateAction<string | null>>;
  setUpgradeDisplayName: Dispatch<SetStateAction<string>>;
  setUpgradeEmail: Dispatch<SetStateAction<string>>;
  supportingCardMotion: MotionProps;
  tournamentOptOutConfirmOpen: boolean;
  tournamentOptOutMessage: string | null;
  tournamentRaceCards: TournamentRaceCard[];
  tournaments: TournamentBundle[];
  unreadNotificationCount: number;
  upcoming: AppSnapshot["queue"];
  upgradeDisplayName: string;
  upgradeEmail: string;
  visibleActiveTab: RacerTabId;
  visibleSelectedRacerDetailId: string | null;
  visibleTournament: TournamentBundle | null;
}

function useRacerPageViewModel({
  focusEventId,
  initialTab
}: RacerPageProps): RacerPageViewProps | null {
  const snapshotQuery = useSnapshotQuery();
  const queryClient = useQueryClient();
  const snapshot = snapshotQuery.data;
  const notificationConfigQuery = useNotificationConfigQuery();
  const [state, setState] = useReducer(racerPageReducer, initialTab, createInitialRacerPageState);
  const {
    accountlessDisplayName,
    activeTab,
    authBusy,
    authMessage,
    authMode,
    avatarUploadBusy,
    avatarUploadMessage,
    bracketPresentationRequest,
    challengeReplacementRequest,
    deviceNotificationsEnabled,
    displayName,
    email,
    expandedBracketTournamentId,
    modalActionMessage,
    modalNotifications,
    notificationMessage,
    notificationPromptVisible,
    phone,
    queueIssueModal,
    queueMessage,
    selectedOpponent,
    selectedRacerDetailId,
    selectedRacerId,
    tournamentOptOutBusy,
    tournamentOptOutConfirmOpen,
    tournamentOptOutMessage,
    upgradeDisplayName,
    upgradeEmail
  } = state;
  function patchState<Key extends keyof RacerPageState>(
    key: Key,
    action: SetStateAction<RacerPageState[Key]>
  ): void {
    setState({ [key]: resolveStateAction(action, state[key]) });
  }
  const setDisplayName: Dispatch<SetStateAction<string>> = (action) => {
    patchState("displayName", action);
  };
  const setAccountlessDisplayName: Dispatch<SetStateAction<string>> = (action) => {
    patchState("accountlessDisplayName", action);
  };
  const setEmail: Dispatch<SetStateAction<string>> = (action) => {
    patchState("email", action);
  };
  const setPhone: Dispatch<SetStateAction<string>> = (action) => {
    patchState("phone", action);
  };
  const setAuthMode: Dispatch<SetStateAction<RacerPageState["authMode"]>> = (action) => {
    patchState("authMode", action);
  };
  const setAuthBusy: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("authBusy", action);
  };
  const setAuthMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("authMessage", action);
  };
  const setQueueMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("queueMessage", action);
  };
  const setQueueIssueModal: Dispatch<SetStateAction<QueueIssueModal | null>> = (action) => {
    patchState("queueIssueModal", action);
  };
  const setChallengeReplacementRequest: Dispatch<
    SetStateAction<ChallengeReplacementRequest | null>
  > = (action) => {
    patchState("challengeReplacementRequest", action);
  };
  const setNotificationMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("notificationMessage", action);
  };
  const setNotificationPromptVisible: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("notificationPromptVisible", action);
  };
  const setDeviceNotificationsEnabled: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("deviceNotificationsEnabled", action);
  };
  const setModalNotifications: Dispatch<SetStateAction<RacerNotification[]>> = (action) => {
    patchState("modalNotifications", action);
  };
  const setModalActionMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("modalActionMessage", action);
  };
  const setTournamentOptOutBusy: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("tournamentOptOutBusy", action);
  };
  const setTournamentOptOutConfirmOpen: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("tournamentOptOutConfirmOpen", action);
  };
  const setTournamentOptOutMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("tournamentOptOutMessage", action);
  };
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);
  const setAvatarUploadMessage: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("avatarUploadMessage", action);
  };
  const setAvatarUploadBusy: Dispatch<SetStateAction<boolean>> = (action) => {
    patchState("avatarUploadBusy", action);
  };
  const setUpgradeEmail: Dispatch<SetStateAction<string>> = (action) => {
    patchState("upgradeEmail", action);
  };
  const setUpgradeDisplayName: Dispatch<SetStateAction<string>> = (action) => {
    patchState("upgradeDisplayName", action);
  };
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = prefersReducedMotion === true;
  const setSelectedOpponent: Dispatch<SetStateAction<string>> = (action) => {
    patchState("selectedOpponent", action);
  };
  const setExpandedBracketTournamentId: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("expandedBracketTournamentId", action);
  };
  const setBracketPresentationRequest: Dispatch<
    SetStateAction<BracketPresentationRequest | null>
  > = (action) => {
    patchState("bracketPresentationRequest", action);
  };
  const racerContentRef = useRef<HTMLDivElement | null>(null);
  const setActiveTab: Dispatch<SetStateAction<RacerTabId>> = (action) => {
    patchState("activeTab", action);
  };
  const setSelectedRacerDetailId: Dispatch<SetStateAction<string | null>> = (action) => {
    patchState("selectedRacerDetailId", action);
  };
  const setSelectedRacerId: Dispatch<SetStateAction<string>> = (action) => {
    patchState("selectedRacerId", action);
  };
  const paymentReturnState = new URLSearchParams(window.location.search).get("payment");
  const paymentReturnId = new URLSearchParams(window.location.search).get("payment_id");
  const launchedNotificationId = new URLSearchParams(window.location.search).get("notificationId");
  const [accountlessId, setAccountlessId] = useState(() => {
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

  function rotateAccountlessId(): void {
    const created = crypto.randomUUID();
    localStorage.setItem("roller-rumble.accountlessId", created);
    localStorage.removeItem("roller-rumble.anonymousId");
    setAccountlessId(created);
  }
  const racerNotificationsQuery = useRacerNotificationsQuery(Boolean(selectedRacerId));

  const refreshDeviceNotificationState = useEffectEvent(async (): Promise<void> => {
    if (!isPushSupported() || Notification.permission !== "granted") {
      setDeviceNotificationsEnabled(false);
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    const subscriptions = await Promise.all(
      registrations.map((registration) => registration.pushManager.getSubscription())
    );
    setDeviceNotificationsEnabled(subscriptions.some(Boolean));
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
        localStorage.setItem("roller-rumble.racerId", result.racer.id);
        setState({ selectedRacerId: result.racer.id });
      } else {
        forgetRacerSessionToken();
        localStorage.removeItem("roller-rumble.racerId");
        setState({ selectedRacerId: "" });
      }
    }
    fireAndForget(hydrateSession(), "hydrate racer session");
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    function refreshOnVisible(): void {
      if (document.visibilityState === "visible") {
        fireAndForget(refreshDeviceNotificationState(), "refresh racer notification device state");
      }
    }

    const initialRefreshTimer = window.setTimeout(refreshOnVisible, 0);
    window.addEventListener("focus", refreshOnVisible);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.removeEventListener("focus", refreshOnVisible);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, []);

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
        const queuedIds = new Set(
          modalNotifications.map((notification) => notification.notificationId)
        );
        const nextNotifications = notificationsToShow.filter(
          (notification) =>
            replaceCurrentNotifications || !queuedIds.has(notification.notificationId)
        );
        setState({
          modalActionMessage: null,
          modalNotifications: replaceCurrentNotifications
            ? nextNotifications
            : [...modalNotifications, ...nextNotifications]
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
  }, [launchedNotificationId, modalNotifications, racerNotificationsQuery.data]);

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
    // Rotate the device's accountless identity so registering again creates a new
    // racer instead of renaming the one that just signed out.
    rotateAccountlessId();
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

  function requestTournamentOptOut(): Promise<void> {
    setTournamentOptOutMessage(null);
    setTournamentOptOutConfirmOpen(true);
    return Promise.resolve();
  }

  function cancelTournamentOptOut(): void {
    setTournamentOptOutConfirmOpen(false);
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
      setTournamentOptOutConfirmOpen(false);
    }
  }

  if (!snapshot) {
    return null;
  }

  const liveSnapshot = snapshot;
  const selectedRacer = liveSnapshot.racers.find((entry) => entry.racer.id === selectedRacerId);
  const selectedRacerQueueEntries = snapshot.queue.filter((entry) =>
    entry.racerIds.includes(selectedRacerId)
  );
  const selectedRacerNextQueueEntry = selectedRacerQueueEntries
    .toSorted((left, right) => left.position - right.position)
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
  const mostRecentFinishedTournament = tournamentFallbackPoolForCurrentEvent
    .toSorted((left, right) => right.tournament.updatedAt.localeCompare(left.tournament.updatedAt))
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
  const visibleActiveTab = activeTabs.some((tab) => tab.id === activeTab) ? activeTab : "race";
  const visibleSelectedRacerDetailId =
    selectedRacerDetailId &&
    snapshot.racers.some((entry) => entry.racer.id === selectedRacerDetailId)
      ? selectedRacerDetailId
      : null;
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

  function handleTabChange(tabId: RacerTabId): void {
    if (tabId === visibleActiveTab) {
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

  const authFormProps: AuthFormProps = {
    accountlessDisplayName,
    authBusy,
    authMessage,
    authMode,
    canContinueAccountless,
    displayName,
    email,
    onContinueAccountless: handleContinueAccountless,
    onEmailSignIn: handleEmailSignIn,
    onPasskeyRegistration: handlePasskeyRegistration,
    passkeyUnavailableMessage,
    phone,
    setAccountlessDisplayName,
    setAuthMessage,
    setAuthMode,
    setDisplayName,
    setEmail,
    setPhone
  };

  return {
    activeModalNotification,
    activeTabs,
    activeTournament,
    authBusy,
    authFormProps,
    authMessage,
    avatarUploadBusy,
    avatarUploadMessage,
    bracketPresentationRequest,
    challengeReplacementRequest,
    currentRace,
    currentRaceNames,
    dismissNotificationModal,
    eventStatusLabel,
    expandedBracketTournament,
    expandedBracketTournamentId,
    flags: {
      authOnlyMode,
      bracketExpanded,
      canBrowsePublicRacerInfo,
      deviceNotificationsEnabled,
      notificationConfigured: Boolean(notificationConfigQuery.data?.configured),
      selectedRacerCanOptOutOfVisibleTournament,
      selectedRacerHasEmail,
      selectedRacerInCurrentRace,
      selectedRacerIsInActiveTournament,
      shouldShowNotificationPrompt,
      showFullQueueLink,
      showNotificationDebugList: snapshot.settings.showRacerNotificationDebugList,
      tournamentMode,
      tournamentOptOutBusy
    },
    cancelTournamentOptOut,
    handleAvatarUpload,
    handleChallengeRacer,
    handleEnableNotifications,
    handlePasskeyRegistration,
    handleQueueSignup,
    handleSignOut,
    handleTabChange,
    handleTournamentOptOut,
    layoutTransition,
    liveSnapshot,
    modalActionMessage,
    notificationConfigMessage: notificationConfigQuery.data?.message,
    notificationMessage,
    onMarkNotificationRead: async (notification) => {
      const nextNotifications = await markRacerNotificationRead(notification.notificationId);
      queryClient.setQueryData(racerNotificationsQueryKey, nextNotifications);
    },
    paymentReturnState,
    queueIssueModal,
    queueMessage,
    raceQueuePreviewEntries,
    racerContentRef,
    racerNotifications,
    reduceMotion,
    requestTournamentOptOut,
    selectedOpponent,
    selectedRacer,
    selectedRacerAvatarUrl,
    selectedRacerId,
    selectedRacerNextQueueEntry,
    setBracketPresentationRequest,
    setChallengeReplacementRequest,
    setExpandedBracketTournamentId,
    setQueueIssueModal,
    setSelectedOpponent,
    setSelectedRacerDetailId,
    setUpgradeDisplayName,
    setUpgradeEmail,
    supportingCardMotion,
    tournamentOptOutConfirmOpen,
    tournamentOptOutMessage,
    tournamentRaceCards,
    tournaments,
    unreadNotificationCount,
    upcoming,
    upgradeDisplayName,
    upgradeEmail,
    visibleActiveTab,
    visibleSelectedRacerDetailId,
    visibleTournament
  };
}

function RacerEventBar({
  activeEvent,
  eventStatusLabel,
  selectedRacer,
  canBrowsePublicRacerInfo
}: {
  activeEvent: AppSnapshot["activeEvent"];
  eventStatusLabel: string;
  selectedRacer: AppSnapshot["racers"][number] | undefined;
  canBrowsePublicRacerInfo: boolean;
}) {
  return (
    <header className="racer-event-bar">
      <div>
        <span>{eventStatusLabel}</span>
        <strong>{activeEvent.name}</strong>
        {activeEvent.description ? (
          <p className="racer-event-bar__desc">{activeEvent.description}</p>
        ) : null}
      </div>
      <div className="racer-event-bar__meta">
        {selectedRacer ? (
          <span>{selectedRacer.racer.displayName}</span>
        ) : (
          <span>{canBrowsePublicRacerInfo ? "Viewing event info" : "Sign in to race"}</span>
        )}
        {activeEvent.paymentRequiredForQueue ? (
          <span>
            {formatPaymentAmount(activeEvent.paymentAmountCents, activeEvent.paymentCurrency)}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function RacerPageView({
  activeModalNotification,
  activeTabs,
  activeTournament,
  authBusy,
  authFormProps,
  authMessage,
  avatarUploadBusy,
  avatarUploadMessage,
  bracketPresentationRequest,
  cancelTournamentOptOut,
  challengeReplacementRequest,
  currentRace,
  currentRaceNames,
  dismissNotificationModal,
  eventStatusLabel,
  expandedBracketTournament,
  expandedBracketTournamentId,
  flags,
  handleAvatarUpload,
  handleChallengeRacer,
  handleEnableNotifications,
  handlePasskeyRegistration,
  handleQueueSignup,
  handleSignOut,
  handleTabChange,
  handleTournamentOptOut,
  layoutTransition,
  liveSnapshot,
  modalActionMessage,
  notificationConfigMessage,
  notificationMessage,
  onMarkNotificationRead,
  paymentReturnState,
  queueIssueModal,
  queueMessage,
  raceQueuePreviewEntries,
  racerContentRef,
  racerNotifications,
  reduceMotion,
  requestTournamentOptOut,
  selectedOpponent,
  selectedRacer,
  selectedRacerAvatarUrl,
  selectedRacerId,
  selectedRacerNextQueueEntry,
  setBracketPresentationRequest,
  setChallengeReplacementRequest,
  setExpandedBracketTournamentId,
  setQueueIssueModal,
  setSelectedOpponent,
  setSelectedRacerDetailId,
  setUpgradeDisplayName,
  setUpgradeEmail,
  supportingCardMotion,
  tournamentOptOutConfirmOpen,
  tournamentOptOutMessage,
  tournamentRaceCards,
  tournaments,
  unreadNotificationCount,
  upcoming,
  upgradeDisplayName,
  upgradeEmail,
  visibleActiveTab,
  visibleSelectedRacerDetailId,
  visibleTournament
}: RacerPageViewProps) {
  const {
    authOnlyMode,
    bracketExpanded,
    canBrowsePublicRacerInfo,
    deviceNotificationsEnabled,
    notificationConfigured,
    selectedRacerCanOptOutOfVisibleTournament,
    selectedRacerHasEmail,
    selectedRacerInCurrentRace,
    selectedRacerIsInActiveTournament,
    shouldShowNotificationPrompt,
    showFullQueueLink,
    showNotificationDebugList,
    tournamentMode,
    tournamentOptOutBusy
  } = flags;

  return (
    <LayoutGroup id="racer-workspace">
      <div
        className={`racer-page-shell${bracketExpanded ? " racer-page-shell--expanded" : ""}${
          authOnlyMode ? " racer-page-shell--auth-only" : ""
        }`}
      >
        {!bracketExpanded ? (
          <RacerEventBar
            activeEvent={liveSnapshot.activeEvent}
            eventStatusLabel={eventStatusLabel}
            selectedRacer={selectedRacer}
            canBrowsePublicRacerInfo={canBrowsePublicRacerInfo}
          />
        ) : null}

        <div
          key={bracketExpanded ? "bracket-expanded" : visibleActiveTab}
          ref={racerContentRef}
          className={`page-grid racer-page-grid${
            bracketExpanded ? " racer-page-grid--bracket-expanded" : ""
          }`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {!bracketExpanded && visibleActiveTab === "race" ? (
              <m.div
                key="racer-race-dashboard"
                layout="position"
                transition={{ layout: layoutTransition }}
                {...supportingCardMotion}
                className="racer-page-grid__card racer-page-grid__card--supporting"
              >
                <RaceDashboard
                  activeTournament={activeTournament ?? null}
                  authFormProps={authFormProps}
                  canBrowsePublicRacerInfo={canBrowsePublicRacerInfo}
                  currentRace={currentRace ?? null}
                  currentRaceNames={currentRaceNames}
                  liveSnapshot={liveSnapshot}
                  onQueueSignup={handleQueueSignup}
                  onTabChange={handleTabChange}
                  onTournamentOptOut={requestTournamentOptOut}
                  paymentReturnState={paymentReturnState}
                  queueMessage={queueMessage}
                  queuePreviewEntries={raceQueuePreviewEntries}
                  selectedOpponent={selectedOpponent}
                  selectedRacer={selectedRacer}
                  selectedRacerCanOptOutOfVisibleTournament={
                    selectedRacerCanOptOutOfVisibleTournament
                  }
                  selectedRacerId={selectedRacerId}
                  selectedRacerInCurrentRace={selectedRacerInCurrentRace}
                  selectedRacerIsInActiveTournament={selectedRacerIsInActiveTournament}
                  selectedRacerNextQueueEntry={selectedRacerNextQueueEntry}
                  setSelectedOpponent={setSelectedOpponent}
                  showFullQueueLink={showFullQueueLink}
                  tournamentMode={tournamentMode}
                  tournamentOptOutBusy={tournamentOptOutBusy}
                  tournamentOptOutMessage={tournamentOptOutMessage}
                  tournamentRaceCards={tournamentRaceCards}
                  upcoming={upcoming}
                  visibleTournament={visibleTournament}
                />
              </m.div>
            ) : null}

            {!bracketExpanded && visibleActiveTab === "me" ? (
              <MeTab
                authBusy={authBusy}
                authFormProps={authFormProps}
                authMessage={authMessage}
                avatarUploadBusy={avatarUploadBusy}
                avatarUploadMessage={avatarUploadMessage}
                deviceNotificationsEnabled={deviceNotificationsEnabled}
                layoutTransition={layoutTransition}
                notificationConfigured={notificationConfigured}
                notificationConfigMessage={notificationConfigMessage}
                notificationMessage={notificationMessage}
                onAvatarUpload={handleAvatarUpload}
                onEnableNotifications={handleEnableNotifications}
                onMarkNotificationRead={onMarkNotificationRead}
                onPasskeyRegistration={handlePasskeyRegistration}
                onSignOut={handleSignOut}
                racerNotifications={racerNotifications}
                selectedRacer={selectedRacer}
                selectedRacerAvatarUrl={selectedRacerAvatarUrl}
                selectedRacerHasEmail={selectedRacerHasEmail}
                setUpgradeDisplayName={setUpgradeDisplayName}
                setUpgradeEmail={setUpgradeEmail}
                shouldShowNotificationPrompt={shouldShowNotificationPrompt}
                showNotificationDebugList={showNotificationDebugList}
                supportingCardMotion={supportingCardMotion}
                unreadNotificationCount={unreadNotificationCount}
                upcoming={upcoming}
                upgradeDisplayName={upgradeDisplayName}
                upgradeEmail={upgradeEmail}
                visibleTournament={visibleTournament}
              />
            ) : null}

            {!bracketExpanded && visibleActiveTab === "queue" && canBrowsePublicRacerInfo ? (
              <QueueTab
                layoutTransition={layoutTransition}
                liveSnapshot={liveSnapshot}
                onQueueSignup={handleQueueSignup}
                paymentReturnState={paymentReturnState}
                queueMessage={queueMessage}
                selectedOpponent={selectedOpponent}
                selectedRacer={selectedRacer}
                selectedRacerId={selectedRacerId}
                setSelectedOpponent={setSelectedOpponent}
                supportingCardMotion={supportingCardMotion}
                tournamentMode={tournamentMode}
                upcoming={upcoming}
              />
            ) : null}

            {!bracketExpanded && visibleActiveTab === "racers" && canBrowsePublicRacerInfo ? (
              <RacersTab
                layoutTransition={layoutTransition}
                liveSnapshot={liveSnapshot}
                onChallengeRacer={handleChallengeRacer}
                reduceMotion={reduceMotion}
                selectedRacer={selectedRacer}
                selectedRacerId={selectedRacerId}
                setSelectedRacerDetailId={setSelectedRacerDetailId}
                supportingCardMotion={supportingCardMotion}
                tournamentMode={tournamentMode}
                upcoming={upcoming}
                visibleSelectedRacerDetailId={visibleSelectedRacerDetailId}
                visibleTournament={visibleTournament}
              />
            ) : null}
          </AnimatePresence>

          {bracketExpanded || (visibleActiveTab === "tournament" && canBrowsePublicRacerInfo) ? (
            <TournamentTab
              bracketExpanded={bracketExpanded}
              bracketPresentationRequest={bracketPresentationRequest}
              expandedBracketTournament={expandedBracketTournament}
              expandedBracketTournamentId={expandedBracketTournamentId}
              layoutTransition={layoutTransition}
              liveSnapshot={liveSnapshot}
              onTournamentOptOut={requestTournamentOptOut}
              reduceMotion={reduceMotion}
              selectedRacerCanOptOutOfVisibleTournament={selectedRacerCanOptOutOfVisibleTournament}
              setBracketPresentationRequest={setBracketPresentationRequest}
              setExpandedBracketTournamentId={setExpandedBracketTournamentId}
              tournamentOptOutBusy={tournamentOptOutBusy}
              tournamentOptOutMessage={tournamentOptOutMessage}
              tournaments={tournaments}
              visibleTournament={visibleTournament}
            />
          ) : null}
        </div>

        {!bracketExpanded && activeTabs.length > 1 ? (
          <RacerBottomTabs
            activeTabs={activeTabs}
            onTabChange={handleTabChange}
            visibleActiveTab={visibleActiveTab}
          />
        ) : null}
      </div>
      <ChallengeReplacementModal
        onDismiss={() => {
          setChallengeReplacementRequest(null);
        }}
        onReplace={(input) => {
          setChallengeReplacementRequest(null);
          fireAndForget(handleQueueSignup(input), "replace challenge queue match");
        }}
        request={challengeReplacementRequest}
      />
      <QueueIssueModalView
        issue={queueIssueModal}
        onDismiss={() => {
          setQueueIssueModal(null);
        }}
      />
      <RacerNotificationModal
        modalActionMessage={modalActionMessage}
        notification={activeModalNotification}
        onAcceptTournamentSpot={() => {
          handleTabChange("tournament");
        }}
        onDismiss={dismissNotificationModal}
        onTournamentOptOut={handleTournamentOptOut}
        tournamentOptOutBusy={tournamentOptOutBusy}
      />
      <TournamentOptOutConfirmModal
        open={tournamentOptOutConfirmOpen}
        busy={tournamentOptOutBusy}
        onCancel={cancelTournamentOptOut}
        onConfirm={handleTournamentOptOut}
      />
    </LayoutGroup>
  );
}

export function RacerPage(props: RacerPageProps) {
  const viewModel = useRacerPageViewModel(props);
  useEffect(() => {
    document.body.classList.add("route-racer");
    return () => {
      document.body.classList.remove("route-racer");
    };
  }, []);
  if (!viewModel) {
    return <p>Loading racer page...</p>;
  }

  return <RacerPageView {...viewModel} />;
}
