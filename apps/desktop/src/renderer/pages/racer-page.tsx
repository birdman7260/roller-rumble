import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import { useEffect, useEffectEvent, useReducer, useRef } from "react";
import type { ChangeEvent, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AppSnapshot,
  BracketNode,
  NotificationConfig,
  RacerAuthSuccessResponse,
  RacerNotification,
  RoundRobinMatch,
  TournamentBundle,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";
import { ConfirmModal } from "@roller-rumble/shared-ui";
import { ToastProvider, useToast } from "@roller-rumble/shared-ui/toast";
import type { BracketPresentationRequest } from "../components/elimination-bracket-view";
import {
  ApiError,
  cancelRacerCheckoutPayment,
  fetchRacerAuthSession,
  fetchNotificationConfig,
  forgetRacerSessionToken,
  leaveRacerQueue,
  leaveRacerQueueEntry,
  markRacerNotificationRead,
  rememberRacerSessionToken,
  optOutOfCurrentTournament,
  saveRacerPushSubscription,
  signOutRacer,
  signUpRacerQueue,
  uploadAvatar
} from "../lib/api";
import { resolveBackendAssetUrl } from "../lib/assets";
import { resolveRacerName } from "../lib/snapshot-display";
import { fireAndForget } from "../lib/ui-actions";
import { useHeightCssVariable } from "../lib/use-height-css-variable";
import {
  racerNotificationsQueryKey,
  snapshotQueryKey,
  useNotificationConfigQuery,
  useRacerNotificationsQuery,
  useSnapshotQuery
} from "../lib/query";
import { ChallengeModal } from "./racer-sections/challenge-modal";
import { MeTab } from "./racer-sections/me";
import {
  ChallengeReplacementModal,
  QueueIssueModalView,
  RacerNotificationModal
} from "./racer-sections/modals";
import { QueueTab } from "./racer-sections/queue";
import { QueueDock } from "./racer-sections/queue-dock";
import { getQueueDockState } from "./racer-sections/queue-dock-state";
import type { QueueDockState } from "./racer-sections/queue-dock-state";
import { RaceDashboard } from "./racer-sections/race";
import { RacersTab } from "./racer-sections/racers";
import { RegistrationWizard } from "./racer-sections/registration-wizard/registration-wizard";
import { clearRegistrationDraft } from "./racer-sections/registration-wizard/registration-draft";
import { forgetPayAtDeskAcknowledged } from "./racer-sections/registration-wizard/pay-at-desk";
import { useRegisteredRacerSteps } from "./racer-sections/registration-wizard/use-registered-racer-steps";
import type {
  ChallengeReplacementRequest,
  QueueIssueModal,
  TournamentRaceCard
} from "./racer-sections/shared";
import { RacerBottomTabs } from "./racer-sections/tabs";
import { TournamentTab } from "./racer-sections/tournament";
import { TournamentOptOutConfirmModal } from "./racer-sections/tournament-opt-out-confirm-modal";
import { QueueLeaveConfirmModal } from "./racer-sections/queue-leave-confirm-modal";
import type { QueueLeaveRequest } from "./racer-sections/queue-leave-confirm-modal";

const racerSnapshotQueryKey = snapshotQueryKey("racer");
const notificationQueuePromptStorageKey = "roller-rumble.notifications.queuePromptedAt";
export type RacerTabId = "race" | "queue" | "tournament" | "racers" | "me";

const racerTabs: { id: RacerTabId; label: string }[] = [
  { id: "race", label: "Race" },
  { id: "queue", label: "Queue" },
  { id: "tournament", label: "Tournament" },
  { id: "racers", label: "Racers" },
  { id: "me", label: "Me" }
];

function normalizeRacerTab(tab: string | undefined): RacerTabId {
  return racerTabs.some((entry) => entry.id === tab) ? (tab as RacerTabId) : "race";
}

function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Foreground true-clear (ADR-0013): when a racer acknowledges inside the open
 * app we close the matching OS notification directly from the page — no push
 * involved, so it works on every platform, unlike a background supersede.
 */
async function closeTrayNotification(notification: RacerNotification): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return;
    }
    const tag = notification.channelKey ?? notification.notificationId;
    const openNotifications = await registration.getNotifications({ tag });
    for (const openNotification of openNotifications) {
      openNotification.close();
    }
  } catch {
    // Best-effort: a missing/blocked SW just means the tray entry lingers.
  }
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

function getBracketRoundLabel(node: BracketNode): string | null {
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
  // Winners rounds are the default path, so racers don't need a label for them.
  return null;
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
  activeTab: RacerTabId;
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  bracketPresentationRequest: BracketPresentationRequest | null;
  challengeModalOpen: boolean;
  challengeReplacementRequest: ChallengeReplacementRequest | null;
  deviceNotificationsEnabled: boolean;
  expandedBracketTournamentId: string | null;
  modalActionMessage: string | null;
  modalNotifications: RacerNotification[];
  notificationMessage: string | null;
  notificationPromptVisible: boolean;
  queueIssueModal: QueueIssueModal | null;
  queueLeaveBusy: boolean;
  queueLeaveRequest: QueueLeaveRequest | null;
  selectedRacerDetailId: string | null;
  selectedRacerId: string;
  /** The signed-in racer's real name; snapshots strip it, so it comes from the session. */
  selectedRacerRealName: string | null;
  signOutBusy: boolean;
  signOutConfirmOpen: boolean;
  tournamentOptOutBusy: boolean;
  tournamentOptOutConfirmOpen: boolean;
  tournamentOptOutMessage: string | null;
}

function createInitialRacerPageState(initialTab: string | undefined): RacerPageState {
  return {
    activeTab: normalizeRacerTab(initialTab),
    avatarUploadBusy: false,
    avatarUploadMessage: null,
    bracketPresentationRequest: null,
    challengeModalOpen: false,
    challengeReplacementRequest: null,
    deviceNotificationsEnabled: false,
    expandedBracketTournamentId: null,
    modalActionMessage: null,
    modalNotifications: [],
    notificationMessage: null,
    notificationPromptVisible: false,
    queueIssueModal: null,
    queueLeaveBusy: false,
    queueLeaveRequest: null,
    selectedRacerDetailId: null,
    selectedRacerId: localStorage.getItem("roller-rumble.racerId") ?? "",
    selectedRacerRealName: null,
    signOutBusy: false,
    signOutConfirmOpen: false,
    tournamentOptOutBusy: false,
    tournamentOptOutConfirmOpen: false,
    tournamentOptOutMessage: null
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
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  bracketPresentationRequest: BracketPresentationRequest | null;
  cancelQueueLeave: () => void;
  cancelTournamentOptOut: () => void;
  challengeModalOpen: boolean;
  challengeReplacementRequest: ChallengeReplacementRequest | null;
  closeChallengeModal: () => void;
  confirmQueueLeave: () => Promise<void>;
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
  handleQueueSignup: (input: {
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
    replaceQueueEntryId?: string;
  }) => Promise<void>;
  cancelSignOut: () => void;
  confirmSignOut: () => Promise<void>;
  requestSignOut: () => void;
  signOutBusy: boolean;
  signOutConfirmOpen: boolean;
  handleTabChange: (tabId: RacerTabId) => void;
  handleTournamentOptOut: () => Promise<void>;
  layoutTransition: MotionProps["transition"];
  liveSnapshot: AppSnapshot;
  modalActionMessage: string | null;
  notificationConfigMessage: string | null | undefined;
  notificationMessage: string | null;
  onMarkNotificationRead: (notification: RacerNotification) => Promise<void>;
  openChallengeModal: () => void;
  paymentReturnState: string | null;
  queueDockState: QueueDockState;
  queueIssueModal: QueueIssueModal | null;
  queueLeaveBusy: boolean;
  queueLeaveRequest: QueueLeaveRequest | null;
  raceQueuePreviewEntries: AppSnapshot["queue"];
  racerContentRef: RefObject<HTMLDivElement | null>;
  racerNotifications: RacerNotification[];
  reduceMotion: boolean;
  registration: ReactNode;
  requestLeaveQueue: () => void;
  requestLeaveQueueEntry: (entry: AppSnapshot["queue"][number]) => void;
  requestTournamentOptOut: () => Promise<void>;
  selectedRacer: AppSnapshot["racers"][number] | undefined;
  selectedRacerAvatarUrl: string | null;
  selectedRacerId: string;
  selectedRacerNextQueueEntry: AppSnapshot["queue"][number] | undefined;
  selectedRacerRealName: string | null;
  setBracketPresentationRequest: Dispatch<SetStateAction<BracketPresentationRequest | null>>;
  setChallengeReplacementRequest: Dispatch<SetStateAction<ChallengeReplacementRequest | null>>;
  setExpandedBracketTournamentId: Dispatch<SetStateAction<string | null>>;
  setQueueIssueModal: Dispatch<SetStateAction<QueueIssueModal | null>>;
  setSelectedRacerDetailId: Dispatch<SetStateAction<string | null>>;
  supportingCardMotion: MotionProps;
  tournamentOptOutConfirmOpen: boolean;
  tournamentOptOutMessage: string | null;
  tournamentRaceCards: TournamentRaceCard[];
  tournaments: TournamentBundle[];
  unreadNotificationCount: number;
  upcoming: AppSnapshot["queue"];
  visibleActiveTab: RacerTabId;
  visibleSelectedRacerDetailId: string | null;
  visibleTournament: TournamentBundle | null;
}

function useRacerPageViewModel({
  focusEventId,
  initialTab
}: RacerPageProps): RacerPageViewProps | null {
  const snapshotQuery = useSnapshotQuery("racer");
  const queryClient = useQueryClient();
  const snapshot = snapshotQuery.data;
  const notificationConfigQuery = useNotificationConfigQuery();
  const { showToast } = useToast();
  const [state, setState] = useReducer(racerPageReducer, initialTab, createInitialRacerPageState);
  const {
    activeTab,
    avatarUploadBusy,
    avatarUploadMessage,
    bracketPresentationRequest,
    challengeModalOpen,
    challengeReplacementRequest,
    deviceNotificationsEnabled,
    expandedBracketTournamentId,
    modalActionMessage,
    modalNotifications,
    notificationMessage,
    notificationPromptVisible,
    queueIssueModal,
    queueLeaveBusy,
    queueLeaveRequest,
    selectedRacerDetailId,
    selectedRacerId,
    selectedRacerRealName,
    signOutBusy,
    signOutConfirmOpen,
    tournamentOptOutBusy,
    tournamentOptOutConfirmOpen,
    tournamentOptOutMessage
  } = state;
  function patchState<Key extends keyof RacerPageState>(
    key: Key,
    action: SetStateAction<RacerPageState[Key]>
  ): void {
    setState({ [key]: resolveStateAction(action, state[key]) });
  }
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
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = prefersReducedMotion === true;
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
  const registeredRacer = snapshot?.racers.find((entry) => entry.racer.id === selectedRacerId);
  const registeredRacerSteps = useRegisteredRacerSteps({
    event: snapshot?.activeEvent,
    racer: registeredRacer,
    onlinePaymentAvailable: Boolean(snapshot?.paymentProvider.stripe.configured)
  });
  const paymentReturnState = new URLSearchParams(window.location.search).get("payment");
  const paymentReturnId = new URLSearchParams(window.location.search).get("payment_id");
  const launchedNotificationId = new URLSearchParams(window.location.search).get("notificationId");
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
      queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
      if (result.racer) {
        rememberRacerSessionToken(result.sessionToken);
        localStorage.setItem("roller-rumble.racerId", result.racer.id);
        setState({
          selectedRacerId: result.racer.id,
          selectedRacerRealName: result.racer.realName
        });
      } else {
        forgetRacerSessionToken();
        localStorage.removeItem("roller-rumble.racerId");
        setState({ selectedRacerId: "", selectedRacerRealName: null });
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

    // A channel's newest record supersedes older ones server-side, so a
    // superseded or acknowledged notification drops out of `notifications`
    // entirely. Reconcile the modal queue against what's still live and unread
    // so in-app modals replace in place just like the OS tray: a modal whose
    // record is gone has been superseded and is swapped for its successor
    // ("Race Coming Up" → "You're Up!") or cleared outright ("You're Up!" → the
    // silent "Nice work!" once the race finishes) — never stacked behind a stale
    // copy the racer has to dismiss first.
    const liveUnreadIds = new Set<string>();
    for (const notification of notifications) {
      if (!notification.readAt) {
        liveUnreadIds.add(notification.notificationId);
      }
    }
    const retained = modalNotifications.filter((notification) =>
      liveUnreadIds.has(notification.notificationId)
    );
    const retainedIds = new Set(retained.map((notification) => notification.notificationId));
    const additions = [...newUnreadNotifications]
      .reverse()
      .filter((notification) => !retainedIds.has(notification.notificationId));
    const nextModalNotifications = [...retained, ...additions];

    const sameQueue =
      nextModalNotifications.length === modalNotifications.length &&
      nextModalNotifications.every(
        (notification, index) =>
          notification.notificationId === modalNotifications[index]?.notificationId
      );
    if (sameQueue) {
      return;
    }

    // Clear the stale acknowledgement line whenever the visible (front) modal
    // changes so a superseding modal starts clean.
    const activeModalChanged =
      nextModalNotifications[0]?.notificationId !== modalNotifications[0]?.notificationId;

    modalTimer = window.setTimeout(() => {
      setState({
        modalActionMessage: activeModalChanged ? null : modalActionMessage,
        modalNotifications: nextModalNotifications
      });
    }, 0);
    return () => {
      if (modalTimer !== null) {
        window.clearTimeout(modalTimer);
      }
    };
  }, [
    launchedNotificationId,
    modalActionMessage,
    modalNotifications,
    racerNotificationsQuery.data
  ]);

  // Registering stores the device login and moves the wizard on to the photo step, held there so
  // the racer sees their photo before continuing. Finishing the wizard lands on the race page.
  function rememberRegisteredRacer(result: RacerAuthSuccessResponse): void {
    rememberRacerSessionToken(result.sessionToken);
    registeredRacerSteps.holdPhotoStep(result.racer.id);
    queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
    localStorage.setItem("roller-rumble.racerId", result.racer.id);
    setState({ selectedRacerId: result.racer.id, selectedRacerRealName: result.racer.realName });
    setActiveTab("race");
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
    setAvatarUploadMessage(null);
  }

  function rememberUpdatedRacerDetails(result: RacerAuthSuccessResponse): void {
    queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
    setState({ selectedRacerRealName: result.racer.realName });
  }

  function requestSignOut(): void {
    setState({ signOutConfirmOpen: true });
  }

  function cancelSignOut(): void {
    setState({ signOutConfirmOpen: false });
  }

  // A device login can't be recovered (ADR-0024), so signing out forgets this racer on the phone
  // for good and returns to the start of the registration wizard.
  async function confirmSignOut(): Promise<void> {
    setState({ signOutBusy: true });
    try {
      const result = await signOutRacer();
      queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "Could not sign out. Try again.",
        variant: "error"
      });
      setState({ signOutBusy: false, signOutConfirmOpen: false });
      return;
    }
    forgetRacerSessionToken();
    localStorage.removeItem("roller-rumble.racerId");
    clearRegistrationDraft();
    forgetPayAtDeskAcknowledged(selectedRacerId);
    setState({
      avatarUploadMessage: null,
      notificationMessage: null,
      notificationPromptVisible: false,
      selectedRacerId: "",
      selectedRacerRealName: null,
      signOutBusy: false,
      signOutConfirmOpen: false,
      tournamentOptOutMessage: null
    });
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

    // `updateViaCache: "none"` stops the browser from serving a stale worker
    // script from the HTTP cache, and the explicit update() forces an immediate
    // check so a device on an older worker picks up the current push handler
    // (paired with skipWaiting/clients.claim in the worker) rather than waiting.
    const registration = await navigator.serviceWorker.register("/racer-notifications-sw.js", {
      updateViaCache: "none"
    });
    await registration.update();
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

  function showQueueSignupToast(input: {
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
    replaceQueueEntryId?: string;
  }): void {
    // The challenge-replacement confirm re-enters this success path with
    // replaceQueueEntryId set; that flow has its own modal, so stay quiet here.
    if (input.replaceQueueEntryId) {
      return;
    }
    if (input.opponentRacerId) {
      const opponentName = snapshot ? resolveRacerName(snapshot, input.opponentRacerId, "") : "";
      showToast({
        message: opponentName ? `Challenge sent to ${opponentName}.` : "Challenge sent."
      });
      return;
    }
    if (input.requestedType === "solo") {
      showToast({ message: "Solo run queued — you're up next." });
      return;
    }
    showToast({ message: "You're in the queue for the next race." });
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
        showToast({ message: "Opening secure Stripe Checkout...", variant: "info" });
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.status === "challenge_replacement_required") {
        setChallengeReplacementRequest({
          message: result.message,
          opponentRacerId: result.opponentRacerId,
          replaceableMatches: result.replaceableMatches
        });
        queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
        return;
      }
      queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
      setNotificationPromptVisible(true);
      showQueueSignupToast(input);
    } catch (error) {
      if (error instanceof ApiError && error.code === "payment_required") {
        showToast({ message: error.message, variant: "error" });
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
      queryClient.setQueryData(racerSnapshotQueryKey, nextSnapshot);
      // The new photo itself is the confirmation, so success shows no message.
      input.value = "";
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
    await closeTrayNotification(notification);
    const nextNotifications = await markRacerNotificationRead(notification.notificationId);
    queryClient.setQueryData(racerNotificationsQueryKey, nextNotifications);
  }

  function requestLeaveQueueEntry(entry: AppSnapshot["queue"][number]): void {
    const opponentRacerId =
      entry.lockType === "challenge"
        ? entry.racerIds.find((racerId) => racerId !== selectedRacerId)
        : undefined;
    setState({
      queueLeaveRequest: {
        mode: "entry",
        entryId: entry.id,
        opponentName:
          opponentRacerId && snapshot ? resolveRacerName(snapshot, opponentRacerId) : null
      }
    });
  }

  function requestLeaveQueue(): void {
    setState({ queueLeaveRequest: { mode: "all" } });
  }

  function cancelQueueLeave(): void {
    setState({ queueLeaveRequest: null });
  }

  async function confirmQueueLeave(): Promise<void> {
    const request = queueLeaveRequest;
    if (!request) {
      return;
    }

    setState({ queueLeaveBusy: true });
    try {
      const nextSnapshot =
        request.mode === "all"
          ? await leaveRacerQueue()
          : await leaveRacerQueueEntry(request.entryId ?? "");
      queryClient.setQueryData(racerSnapshotQueryKey, nextSnapshot);
      showToast({
        message: request.mode === "all" ? "You've left the queue." : "You've left that race."
      });
      setState({ queueLeaveRequest: null });
    } catch (error) {
      // A toast, like every queue outcome: the queue actions have no message area.
      showToast({
        message: error instanceof Error ? error.message : "Could not leave the queue.",
        variant: "error"
      });
      setState({ queueLeaveRequest: null });
    } finally {
      setState({ queueLeaveBusy: false });
    }
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
      queryClient.setQueryData(racerSnapshotQueryKey, result.snapshot);
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
  // A racer still in the registration wizard sees only the wizard, as if not yet signed in.
  const registrationInProgress = registeredRacerSteps.currentStepId !== null;
  const selectedRacer = registrationInProgress ? undefined : registeredRacer;
  const selectedRacerQueueEntries = snapshot.queue.filter((entry) =>
    entry.racerIds.includes(selectedRacerId)
  );
  const selectedRacerNextQueueEntry = selectedRacerQueueEntries
    .toSorted((left, right) => left.position - right.position)
    .at(0);
  const selectedRacerAvatarUrl = resolveBackendAssetUrl(registeredRacer?.racer.avatarUrl);
  const canBrowsePublicRacerInfo =
    !registrationInProgress &&
    (Boolean(selectedRacer) || snapshot.settings.showPublicRacerInfoWithoutLogin);
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
  // Capability-gated (ADR-0014): hide the enable CTA where Web Push can't work —
  // notably an iOS Safari tab, where PushManager only exists in the installed PWA.
  const shouldShowNotificationPrompt =
    isPushSupported() &&
    !deviceNotificationsEnabled &&
    (notificationPromptVisible ||
      paymentReturnState === "success" ||
      selectedRacerQueueEntries.length > 0);
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
  const eventStatusLabel = !snapshot.settings.queueOpen
    ? snapshot.settings.queueClosedMessage.trim() || "QUEUE CLOSED"
    : currentRace?.state === "active"
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

  function openChallengeModal(): void {
    setState({ challengeModalOpen: true });
  }

  function closeChallengeModal(): void {
    setState({ challengeModalOpen: false });
  }

  const queueDockState = getQueueDockState({
    signedIn: Boolean(selectedRacer),
    tournamentMode,
    bracketExpanded,
    queueOpen: snapshot.settings.queueOpen
  });
  // The picker closes for good when the dock goes away (queue closed, tournament started), so it
  // can't pop back up by itself once queueing reopens.
  if (challengeModalOpen && queueDockState !== "open") {
    setState({ challengeModalOpen: false });
  }

  const registration = (
    <RegistrationWizard
      event={snapshot.activeEvent}
      onRegistered={rememberRegisteredRacer}
      signedIn={
        registeredRacer && registrationInProgress
          ? {
              racer: registeredRacer,
              steps: registeredRacerSteps,
              onDetailsUpdated: rememberUpdatedRacerDetails,
              avatarUrl: selectedRacerAvatarUrl,
              avatarUploadBusy,
              avatarUploadMessage,
              onAvatarUpload: handleAvatarUpload,
              onSignOut: requestSignOut,
              onlinePaymentAvailable: snapshot.paymentProvider.stripe.configured,
              paymentReturnState,
              photoBoothEnabled: snapshot.photoBooth.enabled
            }
          : undefined
      }
    />
  );

  return {
    activeModalNotification,
    activeTabs,
    activeTournament,
    avatarUploadBusy,
    avatarUploadMessage,
    bracketPresentationRequest,
    cancelSignOut,
    challengeModalOpen,
    challengeReplacementRequest,
    closeChallengeModal,
    confirmSignOut,
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
      selectedRacerInCurrentRace,
      selectedRacerIsInActiveTournament,
      shouldShowNotificationPrompt,
      showFullQueueLink,
      showNotificationDebugList: snapshot.settings.showRacerNotificationDebugList,
      tournamentMode,
      tournamentOptOutBusy
    },
    cancelQueueLeave,
    cancelTournamentOptOut,
    confirmQueueLeave,
    handleAvatarUpload,
    handleChallengeRacer,
    handleEnableNotifications,
    handleQueueSignup,
    handleTabChange,
    handleTournamentOptOut,
    layoutTransition,
    liveSnapshot,
    modalActionMessage,
    notificationConfigMessage: notificationConfigQuery.data?.message,
    notificationMessage,
    onMarkNotificationRead: async (notification) => {
      await closeTrayNotification(notification);
      const nextNotifications = await markRacerNotificationRead(notification.notificationId);
      queryClient.setQueryData(racerNotificationsQueryKey, nextNotifications);
    },
    openChallengeModal,
    paymentReturnState,
    queueDockState,
    queueIssueModal,
    queueLeaveBusy,
    queueLeaveRequest,
    raceQueuePreviewEntries,
    racerContentRef,
    racerNotifications,
    reduceMotion,
    registration,
    requestLeaveQueue,
    requestLeaveQueueEntry,
    requestSignOut,
    requestTournamentOptOut,
    selectedRacer,
    selectedRacerAvatarUrl,
    selectedRacerId,
    selectedRacerNextQueueEntry,
    selectedRacerRealName,
    setBracketPresentationRequest,
    setChallengeReplacementRequest,
    setExpandedBracketTournamentId,
    setQueueIssueModal,
    setSelectedRacerDetailId,
    signOutBusy,
    signOutConfirmOpen,
    supportingCardMotion,
    tournamentOptOutConfirmOpen,
    tournamentOptOutMessage,
    tournamentRaceCards,
    tournaments,
    unreadNotificationCount,
    upcoming,
    visibleActiveTab,
    visibleSelectedRacerDetailId,
    visibleTournament
  };
}

function RacerEventBar({
  activeEvent,
  eventStatusLabel
}: {
  activeEvent: AppSnapshot["activeEvent"];
  eventStatusLabel: string;
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
    </header>
  );
}

/** The racer page's dialogs; each stays closed until its piece of page state asks for it. */
function RacerPageModals({
  activeModalNotification,
  cancelQueueLeave,
  cancelSignOut,
  cancelTournamentOptOut,
  challengeModalOpen,
  challengeReplacementRequest,
  closeChallengeModal,
  confirmQueueLeave,
  confirmSignOut,
  dismissNotificationModal,
  flags,
  handleChallengeRacer,
  handleQueueSignup,
  handleTabChange,
  handleTournamentOptOut,
  liveSnapshot,
  modalActionMessage,
  queueIssueModal,
  queueLeaveBusy,
  queueLeaveRequest,
  selectedRacerId,
  setChallengeReplacementRequest,
  setQueueIssueModal,
  signOutBusy,
  signOutConfirmOpen,
  tournamentOptOutConfirmOpen
}: RacerPageViewProps) {
  const { tournamentOptOutBusy } = flags;
  return (
    <>
      <ChallengeModal
        open={challengeModalOpen}
        racers={liveSnapshot.racers.map((entry) => entry.racer)}
        selectedRacerId={selectedRacerId}
        onCancel={closeChallengeModal}
        onChallenge={(opponentRacerId) => {
          closeChallengeModal();
          handleChallengeRacer(opponentRacerId);
        }}
      />
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
      <QueueLeaveConfirmModal
        request={queueLeaveRequest}
        busy={queueLeaveBusy}
        onCancel={cancelQueueLeave}
        onConfirm={confirmQueueLeave}
      />
      <ConfirmModal
        open={signOutConfirmOpen}
        busy={signOutBusy}
        eyebrow="Sign Out"
        title="This racer will be gone from this phone"
        body="There is no password or email sign-in, so once you sign out you can't get this racer back on this phone. Your races, queue spots, and photo stay behind. To race again you'll register as a brand new racer."
        cancelLabel="Stay signed in"
        confirmLabel={signOutBusy ? "Signing out..." : "Sign out for good"}
        onCancel={cancelSignOut}
        onConfirm={() => {
          fireAndForget(confirmSignOut(), "sign out racer");
        }}
      />
    </>
  );
}

/**
 * The queue actions and tabs at the foot of the page. The phone layout fixes it to the bottom of the
 * screen, so it publishes its live height (tabs alone, or tabs plus a queue row that may wrap) for
 * the page and toasts to clear.
 */
function RacerBottomDock({ children }: { children: ReactNode }) {
  const dockRef = useHeightCssVariable<HTMLDivElement>("--racer-bottom-dock-height");
  return (
    <div ref={dockRef} className="racer-bottom-dock">
      {children}
    </div>
  );
}

function RacerPageView(props: RacerPageViewProps) {
  const {
    activeTabs,
    activeTournament,
    avatarUploadBusy,
    avatarUploadMessage,
    bracketPresentationRequest,
    currentRace,
    currentRaceNames,
    eventStatusLabel,
    expandedBracketTournament,
    expandedBracketTournamentId,
    flags,
    handleAvatarUpload,
    handleChallengeRacer,
    handleEnableNotifications,
    handleQueueSignup,
    handleTabChange,
    layoutTransition,
    liveSnapshot,
    notificationConfigMessage,
    notificationMessage,
    onMarkNotificationRead,
    openChallengeModal,
    paymentReturnState,
    queueDockState,
    raceQueuePreviewEntries,
    racerContentRef,
    racerNotifications,
    reduceMotion,
    registration,
    requestLeaveQueue,
    requestLeaveQueueEntry,
    requestSignOut,
    requestTournamentOptOut,
    selectedRacer,
    selectedRacerAvatarUrl,
    selectedRacerId,
    selectedRacerNextQueueEntry,
    selectedRacerRealName,
    setBracketPresentationRequest,
    setExpandedBracketTournamentId,
    setSelectedRacerDetailId,
    supportingCardMotion,
    tournamentOptOutMessage,
    tournamentRaceCards,
    tournaments,
    unreadNotificationCount,
    upcoming,
    visibleActiveTab,
    visibleSelectedRacerDetailId,
    visibleTournament
  } = props;
  const {
    authOnlyMode,
    bracketExpanded,
    canBrowsePublicRacerInfo,
    deviceNotificationsEnabled,
    notificationConfigured,
    selectedRacerCanOptOutOfVisibleTournament,
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
                  canBrowsePublicRacerInfo={canBrowsePublicRacerInfo}
                  currentRace={currentRace ?? null}
                  currentRaceNames={currentRaceNames}
                  liveSnapshot={liveSnapshot}
                  onRequestLeaveQueue={requestLeaveQueue}
                  onTabChange={handleTabChange}
                  onTournamentOptOut={requestTournamentOptOut}
                  paymentReturnState={paymentReturnState}
                  queuePreviewEntries={raceQueuePreviewEntries}
                  registration={registration}
                  selectedRacer={selectedRacer}
                  selectedRacerCanOptOutOfVisibleTournament={
                    selectedRacerCanOptOutOfVisibleTournament
                  }
                  selectedRacerId={selectedRacerId}
                  selectedRacerInCurrentRace={selectedRacerInCurrentRace}
                  selectedRacerIsInActiveTournament={selectedRacerIsInActiveTournament}
                  selectedRacerNextQueueEntry={selectedRacerNextQueueEntry}
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
                onSignOut={requestSignOut}
                photoBoothEnabled={liveSnapshot.photoBooth.enabled}
                racerNotifications={racerNotifications}
                registration={registration}
                selectedRacer={selectedRacer}
                selectedRacerAvatarUrl={selectedRacerAvatarUrl}
                selectedRacerRealName={selectedRacerRealName}
                shouldShowNotificationPrompt={shouldShowNotificationPrompt}
                showNotificationDebugList={showNotificationDebugList}
                supportingCardMotion={supportingCardMotion}
                unreadNotificationCount={unreadNotificationCount}
                visibleTournament={visibleTournament}
              />
            ) : null}

            {!bracketExpanded && visibleActiveTab === "queue" && canBrowsePublicRacerInfo ? (
              <QueueTab
                layoutTransition={layoutTransition}
                liveSnapshot={liveSnapshot}
                onRequestLeaveEntry={requestLeaveQueueEntry}
                onRequestLeaveQueue={requestLeaveQueue}
                selectedRacer={selectedRacer}
                selectedRacerId={selectedRacerId}
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
          <RacerBottomDock>
            <QueueDock
              state={queueDockState}
              allowSolo={liveSnapshot.settings.allowSoloQueue}
              closedMessage={liveSnapshot.settings.queueClosedMessage}
              onQueueSignup={handleQueueSignup}
              onOpenChallenge={openChallengeModal}
            />
            <RacerBottomTabs
              activeTabs={activeTabs}
              onTabChange={handleTabChange}
              visibleActiveTab={visibleActiveTab}
            />
          </RacerBottomDock>
        ) : null}
      </div>
      <RacerPageModals {...props} />
    </LayoutGroup>
  );
}

export function RacerPage(props: RacerPageProps) {
  return (
    <ToastProvider>
      <RacerPageContent {...props} />
    </ToastProvider>
  );
}

function RacerPageContent(props: RacerPageProps) {
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
