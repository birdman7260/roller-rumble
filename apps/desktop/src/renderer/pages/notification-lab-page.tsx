import { useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RACER_NOTIFICATION_TYPES } from "@roller-rumble/shared/constants";
import type {
  AdminNotificationTargetType,
  AppSnapshot,
  RacerNotificationType
} from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel, StatPill, TextInput } from "@roller-rumble/shared-ui";
import { sendAdminNotification } from "../lib/api";
import { snapshotQueryKey, useNotificationConfigQuery, useSnapshotQuery } from "../lib/query";

interface NotificationTemplate {
  body: string;
  title: string;
}

interface NotificationLabState {
  body: string;
  notificationType: RacerNotificationType;
  racerSearch: string;
  selectedRacerIds: string[];
  sendBusy: boolean;
  sendStatus: string | null;
  targetType: AdminNotificationTargetType;
  title: string;
  url: string;
}

const initialNotificationLabState: NotificationLabState = {
  body: "Head over to the bikes when you can.",
  notificationType: "admin_message",
  racerSearch: "",
  selectedRacerIds: [],
  sendBusy: false,
  sendStatus: null,
  targetType: "selected",
  title: "Race Update",
  url: "/racer"
};

function notificationLabReducer(
  state: NotificationLabState,
  patch: Partial<NotificationLabState>
): NotificationLabState {
  return { ...state, ...patch };
}

const targetOptions: {
  description: string;
  label: string;
  value: AdminNotificationTargetType;
}[] = [
  {
    description: "Every racer registered for the current event.",
    label: "Current event racers",
    value: "event"
  },
  {
    description: "Racers currently visible in queued or staged queue entries.",
    label: "Queued racers",
    value: "queued"
  },
  {
    description: "Racers seeded or scheduled in the active tournament.",
    label: "Active tournament racers",
    value: "tournament"
  },
  {
    description: "Pick exact racers from the current event registration list.",
    label: "Selected racers",
    value: "selected"
  }
];

const notificationTypeLabels: Record<RacerNotificationType, string> = {
  admin_message: "Host Message",
  queue_get_ready: "Queue Get-Ready",
  tournament_started: "Tournament Started"
};

const notificationTemplates: Record<RacerNotificationType, NotificationTemplate> = {
  admin_message: {
    title: "Race Update",
    body: "Head over to the bikes when you can."
  },
  queue_get_ready: {
    title: "You're Almost Up",
    body: "Your match is coming up soon. Please head toward the race desk."
  },
  tournament_started: {
    title: "Tournament Check-In",
    body: "The tournament is starting. Confirm with the host if you need to drop out."
  }
};

function getRacerName(snapshot: AppSnapshot, racerId: string): string {
  return (
    snapshot.racers.find((entry) => entry.racer.id === racerId)?.racer.displayName ??
    "Unknown racer"
  );
}

function getActiveTournamentRacerIds(snapshot: AppSnapshot): string[] {
  const activeTournament = snapshot.tournaments.find(
    (bundle) => bundle.tournament.status === "active"
  );
  if (!activeTournament) {
    return [];
  }

  return [
    ...new Set(
      [
        ...activeTournament.seeds.map((seed) => seed.racerId),
        ...activeTournament.bracketNodes.flatMap((node) => [node.racerAId, node.racerBId]),
        ...activeTournament.groupMatches.flatMap((match) => [match.racerAId, match.racerBId])
      ].filter((racerId): racerId is string => Boolean(racerId))
    )
  ];
}

function resolveTargetRacerIds(
  snapshot: AppSnapshot,
  targetType: AdminNotificationTargetType,
  selectedRacerIds: string[]
): string[] {
  switch (targetType) {
    case "event":
      return snapshot.racers.map((entry) => entry.racer.id);
    case "queued":
      return [...new Set(snapshot.queue.flatMap((entry) => entry.racerIds))];
    case "tournament":
      return getActiveTournamentRacerIds(snapshot);
    case "selected":
      return selectedRacerIds;
    default:
      return [];
  }
}

export function NotificationLabPage() {
  const snapshotQuery = useSnapshotQuery();
  const notificationConfigQuery = useNotificationConfigQuery();
  const queryClient = useQueryClient();
  const snapshot = snapshotQuery.data;
  const [state, setState] = useReducer(notificationLabReducer, initialNotificationLabState);
  const {
    body,
    notificationType,
    racerSearch,
    selectedRacerIds,
    sendBusy,
    sendStatus,
    targetType,
    title,
    url
  } = state;

  const normalizedRacerSearch = racerSearch.trim().toLowerCase();
  const racerOptions = (snapshot?.racers ?? []).filter((entry) => {
    if (!normalizedRacerSearch) {
      return true;
    }
    return entry.racer.displayName.toLowerCase().includes(normalizedRacerSearch);
  });

  if (!snapshot) {
    return <p>Loading notification lab...</p>;
  }

  const targetRacerIds = resolveTargetRacerIds(snapshot, targetType, selectedRacerIds);
  const targetRacerNames = targetRacerIds.map((racerId) => getRacerName(snapshot, racerId));
  const canSend = title.trim() !== "" && body.trim() !== "" && targetRacerIds.length > 0;
  const notificationTypeSelectId = "notification-lab-type";
  const targetGroupSelectId = "notification-lab-target-group";
  const titleInputId = "notification-lab-title";
  const bodyInputId = "notification-lab-body";
  const urlInputId = "notification-lab-url";

  function applyTemplate(type: RacerNotificationType): void {
    const template = notificationTemplates[type];
    setState({ body: template.body, notificationType: type, title: template.title });
  }

  function toggleRacer(racerId: string): void {
    setState({
      selectedRacerIds: selectedRacerIds.includes(racerId)
        ? selectedRacerIds.filter((currentId) => currentId !== racerId)
        : [...selectedRacerIds, racerId]
    });
  }

  async function sendLabNotification(): Promise<void> {
    setState({ sendBusy: true, sendStatus: null });
    try {
      const result = await sendAdminNotification({
        body: body.trim(),
        racerIds: targetType === "selected" ? selectedRacerIds : undefined,
        targetType,
        title: title.trim(),
        type: notificationType,
        url: url.trim() || "/racer"
      });
      queryClient.setQueryData(snapshotQueryKey, result.snapshot);
      setState({
        sendStatus: `Sent ${notificationTypeLabels[notificationType]} to ${result.targetCount} racer${
          result.targetCount === 1 ? "" : "s"
        }.`
      });
    } catch (error) {
      setState({
        sendStatus: error instanceof Error ? error.message : "Notification send failed."
      });
    } finally {
      setState({ sendBusy: false });
    }
  }

  return (
    <div className="notification-lab">
      <section className="notification-lab__hero panel panel--glass">
        <div>
          <p className="eyebrow">Developer Lab</p>
          <h1>Notification Lab</h1>
          <p>
            Send real notification records through the same backend path used by admin messages and
            automatic queue/tournament alerts. Keep this page for testing, not event operations.
          </p>
        </div>
        <div className="queue-lab__stats">
          <StatPill
            label="Web Push"
            value={notificationConfigQuery.data?.configured ? "Ready" : "Off"}
          />
          <StatPill label="Event Racers" value={snapshot.racers.length} />
          <StatPill label="Target Count" value={targetRacerIds.length} />
        </div>
      </section>

      <div className="notification-lab__grid">
        <Panel title="Message Builder" className="notification-lab__builder">
          <div className="notification-lab__stack">
            <label htmlFor={notificationTypeSelectId}>
              Notification type
              <select
                id={notificationTypeSelectId}
                value={notificationType}
                onChange={(event) => {
                  applyTemplate(event.target.value as RacerNotificationType);
                }}
              >
                {RACER_NOTIFICATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {notificationTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>

            <div className="notification-lab__template-row">
              {RACER_NOTIFICATION_TYPES.map((type) => (
                <Button
                  key={type}
                  variant={type === notificationType ? "accent" : "ghost"}
                  onClick={() => {
                    applyTemplate(type);
                  }}
                >
                  {notificationTypeLabels[type]}
                </Button>
              ))}
            </div>

            <label htmlFor={titleInputId}>
              Title
              <TextInput
                id={titleInputId}
                maxLength={80}
                value={title}
                onChange={(event) => {
                  setState({ title: event.target.value });
                }}
              />
            </label>

            <label htmlFor={bodyInputId}>
              Body
              <textarea
                id={bodyInputId}
                maxLength={240}
                rows={5}
                value={body}
                onChange={(event) => {
                  setState({ body: event.target.value });
                }}
              />
            </label>

            <label htmlFor={urlInputId}>
              Open URL
              <TextInput
                id={urlInputId}
                value={url}
                onChange={(event) => {
                  setState({ url: event.target.value });
                }}
                placeholder="/racer"
              />
            </label>

            <Button
              variant="accent"
              disabled={!canSend || sendBusy}
              onClick={() => {
                void sendLabNotification();
              }}
            >
              {sendBusy ? "Sending..." : "Send Test Notification"}
            </Button>
            {sendStatus ? <p className="notification-lab__status">{sendStatus}</p> : null}
          </div>
        </Panel>

        <Panel title="Targets" className="notification-lab__targets">
          <div className="notification-lab__stack">
            <label htmlFor={targetGroupSelectId}>
              Target group
              <select
                id={targetGroupSelectId}
                value={targetType}
                onChange={(event) => {
                  setState({ targetType: event.target.value as AdminNotificationTargetType });
                }}
              >
                {targetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="notification-lab__muted">
              {targetOptions.find((option) => option.value === targetType)?.description}
            </p>

            {targetType === "selected" ? (
              <div className="notification-lab__selector">
                <div className="notification-lab__select-actions">
                  <TextInput
                    value={racerSearch}
                    onChange={(event) => {
                      setState({ racerSearch: event.target.value });
                    }}
                    placeholder="Filter racers"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setState({
                        selectedRacerIds: snapshot.racers.map((entry) => entry.racer.id)
                      });
                    }}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setState({ selectedRacerIds: [] });
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="notification-lab__racer-list">
                  {racerOptions.map((entry) => (
                    <label key={entry.racer.id} className="notification-lab__racer-option">
                      <input
                        type="checkbox"
                        checked={selectedRacerIds.includes(entry.racer.id)}
                        onChange={() => {
                          toggleRacer(entry.racer.id);
                        }}
                      />
                      <span>{entry.racer.displayName}</span>
                      <small>{entry.payment.status}</small>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Recipient Preview" className="notification-lab__preview">
          {targetRacerNames.length > 0 ? (
            <div className="notification-lab__recipient-list">
              {targetRacerNames.map((name, index) => (
                <span key={`${targetRacerIds[index]}:${name}`}>{name}</span>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recipients selected"
              body="Choose a group with active racers or pick individual racers before sending."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
