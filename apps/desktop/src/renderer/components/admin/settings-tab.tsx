import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";
import type {
  AdminNotificationTargetType,
  AppSnapshot,
  ProjectorWindowSizePreset
} from "@roller-rumble/shared/types";
import { Button, Panel, StatPill } from "@roller-rumble/shared-ui";
import {
  ensureRuntimeEnvFile,
  generateRuntimeEnvPushKeys,
  installCloudflared,
  openLabPage,
  openRuntimeEnvFile,
  rotatePhotoBoothPairing,
  resizeProjectorWindow,
  sendAdminNotification,
  startTunnel,
  stopTunnel,
  updateSettings
} from "../../lib/api";
import {
  photoBoothStatusQueryKey,
  runtimeEnvQueryKey,
  useNotificationConfigQuery,
  usePhotoBoothStatusQuery,
  useRuntimeEnvQuery
} from "../../lib/query";
import { fireAndForget } from "../../lib/ui-actions";
import { DiagnosticsPanel, ManagedSettingsPanel, SubsystemStatusPanel } from "./operator-settings";

const boothHardwareLabels = {
  scanner: "QR Scanner",
  camera: "Sony Camera",
  lights: "WLED Lights",
  umbrella: "Umbrella",
  hallSensor: "Hall Sensor"
} as const;

function parseTickerMessages(value: string): string[] {
  return value
    .split("\n")
    .flatMap((line) => {
      const trimmedLine = line.trim();
      return trimmedLine ? [trimmedLine] : [];
    })
    .slice(0, 20);
}

function tunnelModeLabel(mode: AppSnapshot["tunnel"]["mode"]): string {
  return mode === "token" ? "Stable URL" : "Quick URL";
}

function cloudflaredSourceLabel(source: AppSnapshot["tunnel"]["binarySource"]): string {
  const resolvedSource = source ?? "missing";
  switch (resolvedSource) {
    case "env":
      return "Configured path";
    case "managed":
      return "App-managed";
    case "path":
      return "System PATH";
    case "missing":
      return "Missing";
    default:
      return "Unknown";
  }
}

function diagnosticTimeLabel(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "Not yet";
}

function useMasonryGrid() {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let animationFrame = 0;
    const updateLayout = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const styles = getComputedStyle(grid);
        const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
        const rowGap = Number.parseFloat(styles.rowGap) || 0;
        const rowUnit = rowHeight + rowGap;

        for (const child of Array.from(grid.children)) {
          if (!(child instanceof HTMLElement)) {
            continue;
          }

          child.style.gridRowEnd = "";
          const height = child.getBoundingClientRect().height;
          const span = Math.max(1, Math.ceil((height + rowGap) / rowUnit));
          child.style.gridRowEnd = `span ${span}`;
        }
      });
    };

    const observer = new ResizeObserver(updateLayout);
    observer.observe(grid);
    for (const child of Array.from(grid.children)) {
      observer.observe(child);
    }

    updateLayout();
    window.addEventListener("resize", updateLayout);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateLayout);
      observer.disconnect();
    };
  }, []);

  return gridRef;
}

interface SettingsUiState {
  cloudflaredInstalling: boolean;
  labOpenStatus: string | null;
  notificationBody: string;
  notificationRacerIds: string[];
  notificationSendStatus: string | null;
  notificationTargetType: AdminNotificationTargetType;
  notificationTitle: string;
  projectorWindowStatus: string | null;
  projectorWindowWorking: ProjectorWindowSizePreset | null;
  runtimeEnvStatus: string | null;
  runtimeEnvWorking: boolean;
}

const initialSettingsUiState: SettingsUiState = {
  cloudflaredInstalling: false,
  labOpenStatus: null,
  notificationBody: "",
  notificationRacerIds: [],
  notificationSendStatus: null,
  notificationTargetType: "event",
  notificationTitle: "",
  projectorWindowStatus: null,
  projectorWindowWorking: null,
  runtimeEnvStatus: null,
  runtimeEnvWorking: false
};

function settingsUiReducer(
  state: SettingsUiState,
  patch: Partial<SettingsUiState>
): SettingsUiState {
  return { ...state, ...patch };
}

function GeneralSettingsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <Panel title="Settings">
      <div className="form-grid">
        <label>
          Theme
          <select
            value={snapshot.settings.themeId}
            onChange={(event) => {
              fireAndForget(updateSettings({ themeId: event.target.value }));
            }}
          >
            {snapshot.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.os2lEnabled}
            onChange={(event) => {
              fireAndForget(updateSettings({ os2lEnabled: event.target.checked }));
            }}
          />
          Enable VirtualDJ cue start
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.autoStageNextRace}
            onChange={(event) => {
              fireAndForget(updateSettings({ autoStageNextRace: event.target.checked }));
            }}
          />
          Auto-stage the next queued open time trial race
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.includeAllRaceData}
            onChange={(event) => {
              fireAndForget(updateSettings({ includeAllRaceData: event.target.checked }));
            }}
          />
          Seed from all-time race data
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.allowAccountlessRacerSignup}
            onChange={(event) => {
              fireAndForget(updateSettings({ allowAccountlessRacerSignup: event.target.checked }));
            }}
          />
          Allow accountless racer signup
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.showPublicRacerInfoWithoutLogin}
            onChange={(event) => {
              fireAndForget(
                updateSettings({ showPublicRacerInfoWithoutLogin: event.target.checked })
              );
            }}
          />
          Show race info before racer sign-in
        </label>
        <label>
          Max active queue entries per racer
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={snapshot.settings.maxActiveQueueEntriesPerRacer}
            onChange={(event) => {
              fireAndForget(
                updateSettings({
                  maxActiveQueueEntriesPerRacer: Number(event.target.value)
                })
              );
            }}
          />
        </label>
      </div>
    </Panel>
  );
}

function ProjectorDisplayPanel({
  projectorWindowStatus,
  projectorWindowWorking,
  resizeProjectorFromAdmin,
  snapshot,
  tickerMessageInputRef
}: {
  projectorWindowStatus: string | null;
  projectorWindowWorking: ProjectorWindowSizePreset | null;
  resizeProjectorFromAdmin: (preset: ProjectorWindowSizePreset) => Promise<void>;
  snapshot: AppSnapshot;
  tickerMessageInputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <Panel title="Projector Display">
      <div className="form-grid">
        <div className="stack-sm">
          <p>Resize the projector window for quick 720p or 1080p layout checks.</p>
          <div className="panel-action-row settings-panel__actions">
            <Button
              variant="ghost"
              disabled={projectorWindowWorking !== null}
              onClick={() => {
                fireAndForget(resizeProjectorFromAdmin("720p"), "resize projector to 720p");
              }}
            >
              {projectorWindowWorking === "720p" ? "Resizing..." : "720p (1280x720)"}
            </Button>
            <Button
              variant="ghost"
              disabled={projectorWindowWorking !== null}
              onClick={() => {
                fireAndForget(resizeProjectorFromAdmin("1080p"), "resize projector to 1080p");
              }}
            >
              {projectorWindowWorking === "1080p" ? "Resizing..." : "1080p (1920x1080)"}
            </Button>
          </div>
          {projectorWindowStatus ? <p>{projectorWindowStatus}</p> : null}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.raceDisplayShowEventName}
            onChange={(event) => {
              fireAndForget(updateSettings({ raceDisplayShowEventName: event.target.checked }));
            }}
          />
          Show event name under the Roller Rumble title
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.raceDisplayLaneColorsFlipped}
            onChange={(event) => {
              fireAndForget(updateSettings({ raceDisplayLaneColorsFlipped: event.target.checked }));
            }}
          />
          Flip projector lane colors
        </label>
        <label>
          Ticker speed
          <div className="range-control">
            <input
              type="range"
              min={24}
              max={180}
              step={4}
              value={snapshot.settings.raceDisplayTickerSpeed}
              onChange={(event) => {
                const nextSpeed = Number(event.target.value);
                fireAndForget(updateSettings({ raceDisplayTickerSpeed: nextSpeed }));
              }}
            />
            <span>{snapshot.settings.raceDisplayTickerSpeed} px/s</span>
          </div>
        </label>
        <label>
          Ticker messages
          <textarea
            ref={tickerMessageInputRef}
            key={snapshot.settings.raceDisplayTickerMessages.join("\n")}
            rows={5}
            defaultValue={snapshot.settings.raceDisplayTickerMessages.join("\n")}
            placeholder="One projector ticker message per line"
          />
        </label>
        <div className="button-row">
          <Button
            variant="ghost"
            onClick={() => {
              if (tickerMessageInputRef.current) {
                tickerMessageInputRef.current.value = "";
              }
              fireAndForget(updateSettings({ raceDisplayTickerMessages: [] }));
            }}
          >
            Clear Messages
          </Button>
          <Button
            onClick={() => {
              fireAndForget(
                updateSettings({
                  raceDisplayTickerMessages: parseTickerMessages(
                    tickerMessageInputRef.current?.value ?? ""
                  )
                })
              );
            }}
          >
            Save Ticker Messages
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function NotificationsPanel({
  notificationBody,
  notificationConfig,
  notificationRacerIds,
  notificationSendStatus,
  notificationTargetType,
  notificationTitle,
  sendNotificationFromAdmin,
  setUiState,
  snapshot
}: {
  notificationBody: string;
  notificationConfig: { configured?: boolean; message?: string | null; publicKey?: string | null };
  notificationRacerIds: string[];
  notificationSendStatus: string | null;
  notificationTargetType: AdminNotificationTargetType;
  notificationTitle: string;
  sendNotificationFromAdmin: () => Promise<void>;
  setUiState: (patch: Partial<SettingsUiState>) => void;
  snapshot: AppSnapshot;
}) {
  return (
    <Panel title="Notifications">
      <div className="form-grid">
        <div className="stat-grid">
          <StatPill
            label="Web Push"
            value={notificationConfig.configured ? "Ready" : "Not configured"}
          />
          <StatPill
            label="Public Key"
            value={notificationConfig.publicKey ? "Present" : "Missing"}
          />
        </div>
        <p>
          {notificationConfig.message ??
            "Checking Web Push setup. Private VAPID keys are never shown here."}
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.showRacerNotificationDebugList}
            onChange={(event) => {
              fireAndForget(
                updateSettings({ showRacerNotificationDebugList: event.target.checked })
              );
            }}
          />
          Show racer notification debug list
        </label>
        <label>
          Target
          <select
            value={notificationTargetType}
            onChange={(event) => {
              setUiState({
                notificationTargetType: event.target.value as AdminNotificationTargetType
              });
            }}
          >
            <option value="event">All current event racers</option>
            <option value="queued">Queued racers</option>
            <option value="tournament">Active tournament racers</option>
            <option value="selected">Selected racers</option>
          </select>
        </label>
        {notificationTargetType === "selected" ? (
          <label>
            Selected racers
            <select
              multiple
              value={notificationRacerIds}
              onChange={(event) => {
                setUiState({
                  notificationRacerIds: [...event.currentTarget.selectedOptions].map(
                    (option) => option.value
                  )
                });
              }}
            >
              {snapshot.racers.map((entry) => (
                <option key={entry.racer.id} value={entry.racer.id}>
                  {entry.racer.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Message title
          <input
            value={notificationTitle}
            maxLength={80}
            onChange={(event) => {
              setUiState({ notificationTitle: event.target.value });
            }}
            placeholder="Race update"
          />
        </label>
        <label>
          Message body
          <textarea
            rows={4}
            maxLength={240}
            value={notificationBody}
            onChange={(event) => {
              setUiState({ notificationBody: event.target.value });
            }}
            placeholder="Head to the bikes. Your match is coming up."
          />
        </label>
        <div className="button-row">
          <Button
            disabled={
              !notificationTitle.trim() ||
              !notificationBody.trim() ||
              (notificationTargetType === "selected" && notificationRacerIds.length === 0)
            }
            onClick={() => {
              fireAndForget(sendNotificationFromAdmin(), "send notification");
            }}
          >
            Send Notification
          </Button>
        </div>
        {notificationSendStatus ? <p>{notificationSendStatus}</p> : null}
      </div>
    </Panel>
  );
}

function VirtualDjDiagnosticsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <Panel className="settings-panel" title="VirtualDJ Diagnostics">
      <div className="stack-sm">
        <div className="stat-grid">
          <StatPill label="Cue Start" value={snapshot.os2l.enabled ? "Enabled" : "Disabled"} />
          <StatPill label="TCP Listener" value={snapshot.os2l.listening ? "Listening" : "Off"} />
          <StatPill
            label="Discovery"
            value={snapshot.os2l.advertising ? "Advertising" : "Not advertising"}
          />
          <StatPill label="Port" value={snapshot.os2l.port} />
          <StatPill label="Armed Race" value={snapshot.os2l.armedRaceId ? "Ready" : "None"} />
          <StatPill label="Beats Seen" value={snapshot.os2l.beatMessageCount} />
          <StatPill label="Accepted" value={snapshot.os2l.acceptedMessageCount} />
          <StatPill label="Ignored" value={snapshot.os2l.ignoredMessageCount} />
        </div>
        <p>
          VirtualDJ should discover this app as `{snapshot.os2l.serviceName}` over OS2L. If Windows
          asks about network access, allow Roller Rumble on the private/event network.
        </p>
        <p>Last beat message: {diagnosticTimeLabel(snapshot.os2l.lastBeatAt)}</p>
        <div className="stack-sm">
          <strong>Last raw OS2L message</strong>
          <span>{diagnosticTimeLabel(snapshot.os2l.lastRawMessageAt)}</span>
          <code className="breakable-value">
            {snapshot.os2l.lastRawMessage ?? "No OS2L messages received yet."}
          </code>
        </div>
        <div className="stack-sm">
          <strong>Last accepted cue</strong>
          <span>{diagnosticTimeLabel(snapshot.os2l.lastAcceptedAt)}</span>
          <code className="breakable-value">
            {snapshot.os2l.lastAcceptedMessage ?? "No accepted Roller Rumble cue yet."}
          </code>
        </div>
        <div className="stack-sm">
          <strong>Last ignored message</strong>
          <span>{diagnosticTimeLabel(snapshot.os2l.lastIgnoredAt)}</span>
          <span>{snapshot.os2l.lastIgnoredReason ?? "No ignored messages yet."}</span>
          <code className="breakable-value">
            {snapshot.os2l.lastIgnoredMessage ?? "No ignored OS2L messages yet."}
          </code>
        </div>
        {snapshot.os2l.lastError ? <p className="form-error">{snapshot.os2l.lastError}</p> : null}
      </div>
    </Panel>
  );
}

function LabPagesPanel({
  labOpenStatus,
  openLabFromAdmin
}: {
  labOpenStatus: string | null;
  openLabFromAdmin: (labId: "bracket" | "notification" | "queue") => Promise<void>;
}) {
  return (
    <Panel className="settings-panel" title="Lab Pages">
      <div className="stack-sm">
        <p>Open the built-in test labs in your default browser.</p>
        <div className="panel-action-row settings-panel__actions">
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(openLabFromAdmin("bracket"), "open bracket lab");
            }}
          >
            Open Bracket Lab
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(openLabFromAdmin("queue"), "open queue lab");
            }}
          >
            Open Queue Lab
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(openLabFromAdmin("notification"), "open notification lab");
            }}
          >
            Open Notification Lab
          </Button>
        </div>
        {labOpenStatus ? <p>{labOpenStatus}</p> : null}
      </div>
    </Panel>
  );
}

function RuntimeEnvironmentPanel({
  generatePushKeysFromAdmin,
  notificationConfigured,
  openRuntimeEnvFromAdmin,
  runtimeEnvQuery,
  runtimeEnvStatus,
  runtimeEnvWorking
}: {
  generatePushKeysFromAdmin: () => Promise<void>;
  notificationConfigured: boolean;
  openRuntimeEnvFromAdmin: () => Promise<void>;
  runtimeEnvQuery: ReturnType<typeof useRuntimeEnvQuery>;
  runtimeEnvStatus: string | null;
  runtimeEnvWorking: boolean;
}) {
  return (
    <Panel
      className="settings-panel"
      title="Environment"
      actions={
        <div className="panel-action-row settings-panel__actions">
          {runtimeEnvQuery.data?.exists ? (
            <Button
              variant="ghost"
              disabled={runtimeEnvWorking}
              onClick={() => {
                fireAndForget(openRuntimeEnvFromAdmin(), "open runtime env file");
              }}
            >
              {runtimeEnvWorking ? "Opening..." : "Open Env File"}
            </Button>
          ) : (
            <Button
              disabled={runtimeEnvWorking}
              onClick={() => {
                fireAndForget(openRuntimeEnvFromAdmin(), "create runtime env file");
              }}
            >
              {runtimeEnvWorking ? "Creating..." : "Create & Open Env File"}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={runtimeEnvWorking}
            onClick={() => {
              if (
                notificationConfigured &&
                !window.confirm(
                  "Web Push already looks configured. Generating new keys can require racers to enable notifications again. Continue?"
                )
              ) {
                return;
              }
              fireAndForget(generatePushKeysFromAdmin(), "generate push keys");
            }}
          >
            Generate Push Keys
          </Button>
        </div>
      }
    >
      <div className="stack-sm">
        <div className="stat-grid">
          <StatPill
            label="Local Env File"
            value={
              runtimeEnvQuery.isLoading
                ? "Checking"
                : runtimeEnvQuery.data?.exists
                  ? "Present"
                  : "Missing"
            }
          />
          <StatPill label="Loaded Files" value={runtimeEnvQuery.data?.loadedFiles.length ?? 0} />
        </div>
        <p>
          Runtime variables are read when Roller Rumble starts. Edit this file for installed app
          secrets and machine-specific settings, then restart the app.
        </p>
        <p>
          Use `Generate Push Keys` to fill in the Web Push notification settings automatically. It
          creates the file first if needed.
        </p>
        <p>
          Generate keys once during setup. If racers have already enabled notifications, replacing
          the keys may require them to enable notifications again.
        </p>
        {runtimeEnvQuery.data ? (
          <code className="breakable-value">{runtimeEnvQuery.data.path}</code>
        ) : null}
        {runtimeEnvQuery.data?.loadedFiles.length ? (
          <div className="stack-sm">
            <strong>Loaded at startup</strong>
            {runtimeEnvQuery.data.loadedFiles.map((filePath) => (
              <code className="breakable-value" key={filePath}>
                {filePath}
              </code>
            ))}
          </div>
        ) : (
          <p>No dotenv files were loaded at startup.</p>
        )}
        {runtimeEnvStatus ? <p>{runtimeEnvStatus}</p> : null}
      </div>
    </Panel>
  );
}

export function SettingsTab({
  snapshot,
  meta
}: {
  snapshot: AppSnapshot;
  meta?: { localBaseUrl: string; racerPageUrl: string; qrCodeDataUrl: string };
}) {
  const photoBoothStatusQuery = usePhotoBoothStatusQuery();
  const notificationConfigQuery = useNotificationConfigQuery();
  const runtimeEnvQuery = useRuntimeEnvQuery();
  const masonryGridRef = useMasonryGrid();
  const queryClient = useQueryClient();
  const photoBoothAdminStatus = photoBoothStatusQuery.data;
  const photoBoothStatus = photoBoothAdminStatus?.status ?? snapshot.photoBooth;
  const tickerMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [uiState, setUiState] = useReducer(settingsUiReducer, initialSettingsUiState);
  const {
    cloudflaredInstalling,
    labOpenStatus,
    notificationBody,
    notificationRacerIds,
    notificationSendStatus,
    notificationTargetType,
    notificationTitle,
    projectorWindowStatus,
    projectorWindowWorking,
    runtimeEnvStatus,
    runtimeEnvWorking
  } = uiState;
  const tunnelUrl = meta?.racerPageUrl ?? snapshot.tunnel.publicUrl ?? "Tunnel inactive";
  const canInstallCloudflared =
    snapshot.tunnel.binarySource === "missing" && snapshot.tunnel.status !== "active";

  async function installCloudflaredFromAdmin(): Promise<void> {
    setUiState({ cloudflaredInstalling: true });
    try {
      await installCloudflared();
    } finally {
      setUiState({ cloudflaredInstalling: false });
    }
  }

  async function ensureRuntimeEnvFromAdmin(openAfterCreate = false): Promise<void> {
    setUiState({ runtimeEnvStatus: null, runtimeEnvWorking: true });
    try {
      const result = openAfterCreate ? await openRuntimeEnvFile() : await ensureRuntimeEnvFile();
      await queryClient.invalidateQueries({ queryKey: runtimeEnvQueryKey });
      setUiState({
        runtimeEnvStatus: openAfterCreate
          ? `Opened ${result.path}. Restart Roller Rumble after saving changes.`
          : `Created ${result.path}. Restart Roller Rumble after editing it.`
      });
    } finally {
      setUiState({ runtimeEnvWorking: false });
    }
  }

  async function generatePushKeysFromAdmin(): Promise<void> {
    setUiState({ runtimeEnvStatus: null, runtimeEnvWorking: true });
    try {
      const result = await generateRuntimeEnvPushKeys();
      await queryClient.invalidateQueries({ queryKey: runtimeEnvQueryKey });
      setUiState({
        runtimeEnvStatus: `Generated Web Push keys in ${result.path}. Open the env file if you want to change the subject email, then restart Roller Rumble.`
      });
    } finally {
      setUiState({ runtimeEnvWorking: false });
    }
  }

  async function openLabFromAdmin(labId: "bracket" | "notification" | "queue"): Promise<void> {
    setUiState({ labOpenStatus: null });
    const result = await openLabPage(labId);
    setUiState({ labOpenStatus: `Opened ${result.url}` });
  }

  async function resizeProjectorFromAdmin(preset: ProjectorWindowSizePreset): Promise<void> {
    setUiState({ projectorWindowStatus: null, projectorWindowWorking: preset });
    try {
      const result = await resizeProjectorWindow(preset);
      setUiState({
        projectorWindowStatus: `Projector window set to ${result.width}x${result.height}.`
      });
    } catch (error) {
      setUiState({
        projectorWindowStatus:
          error instanceof Error ? error.message : "Projector window could not be resized."
      });
      throw error;
    } finally {
      setUiState({ projectorWindowWorking: null });
    }
  }

  async function sendNotificationFromAdmin(): Promise<void> {
    setUiState({ notificationSendStatus: null });
    const result = await sendAdminNotification({
      targetType: notificationTargetType,
      racerIds: notificationTargetType === "selected" ? notificationRacerIds : undefined,
      title: notificationTitle,
      body: notificationBody,
      url: "/racer"
    });
    setUiState({
      notificationBody: "",
      notificationSendStatus: `Sent to ${result.targetCount} racer${result.targetCount === 1 ? "" : "s"}.`,
      notificationTitle: ""
    });
  }

  return (
    <div ref={masonryGridRef} className="page-grid settings-page-grid">
      <SubsystemStatusPanel health={snapshot.subsystemHealth} />

      <ManagedSettingsPanel snapshot={snapshot} />

      <DiagnosticsPanel snapshot={snapshot} />

      <GeneralSettingsPanel snapshot={snapshot} />

      <ProjectorDisplayPanel
        projectorWindowStatus={projectorWindowStatus}
        projectorWindowWorking={projectorWindowWorking}
        resizeProjectorFromAdmin={resizeProjectorFromAdmin}
        snapshot={snapshot}
        tickerMessageInputRef={tickerMessageInputRef}
      />

      <NotificationsPanel
        notificationBody={notificationBody}
        notificationConfig={notificationConfigQuery.data ?? {}}
        notificationRacerIds={notificationRacerIds}
        notificationSendStatus={notificationSendStatus}
        notificationTargetType={notificationTargetType}
        notificationTitle={notificationTitle}
        sendNotificationFromAdmin={sendNotificationFromAdmin}
        setUiState={setUiState}
        snapshot={snapshot}
      />

      <VirtualDjDiagnosticsPanel snapshot={snapshot} />

      <LabPagesPanel labOpenStatus={labOpenStatus} openLabFromAdmin={openLabFromAdmin} />

      <RuntimeEnvironmentPanel
        generatePushKeysFromAdmin={generatePushKeysFromAdmin}
        notificationConfigured={Boolean(notificationConfigQuery.data?.configured)}
        openRuntimeEnvFromAdmin={() => ensureRuntimeEnvFromAdmin(true)}
        runtimeEnvQuery={runtimeEnvQuery}
        runtimeEnvStatus={runtimeEnvStatus}
        runtimeEnvWorking={runtimeEnvWorking}
      />

      <Panel
        className="settings-panel"
        title="Tunnel"
        actions={
          <div className="panel-action-row settings-panel__actions">
            {canInstallCloudflared ? (
              <Button
                variant="ghost"
                disabled={cloudflaredInstalling}
                onClick={() => {
                  fireAndForget(installCloudflaredFromAdmin(), "install cloudflared");
                }}
              >
                {cloudflaredInstalling ? "Installing..." : "Install cloudflared"}
              </Button>
            ) : null}
            {snapshot.tunnel.status === "active" ? (
              <Button
                variant="ghost"
                onClick={() => {
                  fireAndForget(stopTunnel());
                }}
              >
                Stop Tunnel
              </Button>
            ) : (
              <Button
                onClick={() => {
                  fireAndForget(startTunnel());
                }}
              >
                Start Tunnel
              </Button>
            )}
          </div>
        }
      >
        <div className="stack-sm">
          <div className="stat-grid">
            <StatPill label="Status" value={snapshot.tunnel.status} />
            <StatPill label="Mode" value={tunnelModeLabel(snapshot.tunnel.mode)} />
            <StatPill
              label="cloudflared"
              value={cloudflaredSourceLabel(snapshot.tunnel.binarySource)}
            />
            <StatPill
              label="Tunnel"
              value={
                snapshot.tunnel.tunnelName ?? (snapshot.tunnel.mode === "token" ? "Unset" : "Quick")
              }
            />
          </div>
          <span className="breakable-value">{tunnelUrl}</span>
          {snapshot.tunnel.cloudflaredVersion ? (
            <span className="breakable-value">{snapshot.tunnel.cloudflaredVersion}</span>
          ) : null}
          {snapshot.tunnel.message ? (
            <span className="breakable-value">{snapshot.tunnel.message}</span>
          ) : null}
          {snapshot.tunnel.lastError ? (
            <span className="breakable-value">{snapshot.tunnel.lastError}</span>
          ) : null}
          {meta?.qrCodeDataUrl ? (
            <img className="qr-code" src={meta.qrCodeDataUrl} alt="Racer page signup" />
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Kaleidoscope Photo Booth"
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(
                rotatePhotoBoothPairing().then(() =>
                  queryClient.invalidateQueries({ queryKey: photoBoothStatusQueryKey })
                ),
                "rotate photo booth pairing"
              );
            }}
          >
            Rotate Pairing
          </Button>
        }
      >
        <div className="photo-booth-admin">
          <StatPill label="Booth Status" value={photoBoothStatus.status} />
          <StatPill label="Pending Sync" value={photoBoothStatus.pendingUploadCount} />
          <StatPill
            label="Last Seen"
            value={
              photoBoothStatus.lastSeenAt
                ? new Date(photoBoothStatus.lastSeenAt).toLocaleTimeString()
                : "Not yet"
            }
          />
          <div className="photo-booth-admin__hardware">
            {Object.entries(boothHardwareLabels).map(([key, label]) => {
              const health =
                photoBoothStatus.hardware?.[key as keyof typeof boothHardwareLabels] ?? null;
              return (
                <div
                  key={key}
                  className={`photo-booth-hardware photo-booth-hardware--${health?.status ?? "unknown"}`}
                >
                  <strong>{label}</strong>
                  <span>{health?.status ?? "unknown"}</span>
                  {health?.message ? <small>{health.message}</small> : null}
                </div>
              );
            })}
          </div>
          <div className="photo-booth-admin__pairing">
            <div>
              <strong>Pairing Config</strong>
              <p>
                Scan this from the Raspberry Pi setup flow, or copy the values into the booth agent
                environment.
              </p>
              <code>Server: {photoBoothAdminStatus?.serverBaseUrl ?? meta?.localBaseUrl}</code>
              <code>Booth: {photoBoothStatus.boothId}</code>
              <code>Secret: {photoBoothAdminStatus?.pairingSecret ?? "Loading…"}</code>
            </div>
            {photoBoothAdminStatus?.pairingQrCodeDataUrl ? (
              <img
                className="qr-code"
                src={photoBoothAdminStatus.pairingQrCodeDataUrl}
                alt="Pairing code"
              />
            ) : null}
          </div>
          {photoBoothStatus.message ? <p>{photoBoothStatus.message}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
