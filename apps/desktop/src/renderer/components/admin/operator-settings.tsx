import { useState } from "react";
import type {
  AppSnapshot,
  ManagedSettingState,
  SubsystemHealth,
  SubsystemHealthStatus
} from "@roller-rumble/shared/types";
import {
  MANAGED_SETTINGS,
  type ManagedSettingDefinition,
  type SubsystemId
} from "@roller-rumble/shared/managed-settings";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { fireAndForget } from "../../lib/ui-actions";
import {
  fetchDiagnosticsSummary,
  reloadRuntimeEnv,
  restartTunnel,
  saveDiagnosticsBundle,
  saveManagedSetting
} from "../../lib/api";

const STATUS_LABELS: Record<SubsystemHealthStatus, string> = {
  ready: "Ready",
  degraded: "Degraded",
  failed: "Failed",
  disabled: "Off"
};

const SUBSYSTEM_GROUP_LABELS: Partial<Record<SubsystemId, string>> = {
  tunnel: "Cloudflare tunnel",
  stripe: "Stripe payments",
  network: "Network",
  webPush: "Racer notifications",
  sensor: "Bike sensor"
};

const MANAGED_GROUP_ORDER: SubsystemId[] = ["tunnel", "stripe", "network", "webPush", "sensor"];

function statusModifier(status: SubsystemHealthStatus): string {
  return `subsystem-status--${status}`;
}

/**
 * The at-a-glance status surface at the top of Settings. Each subsystem shows ready/degraded/
 * failed/disabled with a plain-language summary, and recognized failures expand into known-error
 * guidance so an operator can often fix it without the maintainer.
 */
export function SubsystemStatusPanel({ health }: { health: SubsystemHealth[] }) {
  const problems = health.filter(
    (entry) => entry.status === "failed" || entry.status === "degraded"
  ).length;

  return (
    <Panel
      className="settings-panel"
      title="Status"
      actions={
        <span
          className={`subsystem-status-chip ${problems ? "subsystem-status--failed" : "subsystem-status--ready"}`}
        >
          {problems
            ? `${problems} need${problems === 1 ? "s" : ""} attention`
            : "All systems ready"}
        </span>
      }
    >
      <ul className="subsystem-status-list">
        {health.map((entry) => (
          <li key={entry.id} className="subsystem-status-row">
            <div className="subsystem-status-row__head">
              <span className={`subsystem-status-badge ${statusModifier(entry.status)}`}>
                {STATUS_LABELS[entry.status]}
              </span>
              <strong>{entry.label}</strong>
            </div>
            <p className="subsystem-status-row__summary">{entry.summary}</p>
            {entry.lastError || entry.guidance ? (
              <details className="subsystem-status-row__details">
                <summary>Details</summary>
                {entry.guidance ? (
                  <div className="stack-sm">
                    <p>{entry.guidance.explanation}</p>
                    <p>
                      <strong>Try this:</strong> {entry.guidance.nextAction}
                    </p>
                  </div>
                ) : null}
                {entry.lastError ? (
                  <code className="breakable-value">{entry.lastError}</code>
                ) : null}
                {!entry.guidance && entry.lastError ? (
                  <p>
                    If this does not make sense, use “Copy diagnostics” below and send it to the
                    maintainer.
                  </p>
                ) : null}
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function currentStateFor(snapshot: AppSnapshot, id: string): ManagedSettingState | undefined {
  return snapshot.runtimeEnv.managedSettings.find((setting) => setting.id === id);
}

function ManagedField({
  definition,
  state
}: {
  definition: ManagedSettingDefinition;
  state: ManagedSettingState | undefined;
}) {
  const [draft, setDraft] = useState(definition.secret ? "" : (state?.value ?? ""));
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveManagedSetting(definition.id, draft);
      if (definition.secret) {
        setDraft("");
        setRevealed(false);
      }
      if (result.needsTunnelRestart) {
        if (
          window.confirm(
            "This tunnel change needs the tunnel to restart. Restarting briefly drops every racer's connection. Restart the tunnel now?"
          )
        ) {
          await restartTunnel();
          setStatus("Saved. Tunnel restarting…");
        } else {
          setStatus("Saved. Restart the tunnel when ready for it to take effect.");
        }
      } else {
        setStatus("Saved.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="managed-field">
      <label className="managed-field__label">
        <span className="managed-field__label-text">
          {definition.label}
          {state?.set ? <span className="managed-field__set"> · set</span> : null}
        </span>
        {definition.kind === "select" ? (
          <select value={draft} onChange={(event) => setDraft(event.target.value)}>
            <option value="">(default)</option>
            {definition.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={definition.secret && !revealed ? "password" : "text"}
            value={draft}
            placeholder={
              definition.secret && state?.set
                ? `currently set (ends with ${state.last4 ?? "????"})`
                : ""
            }
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </label>
      {definition.description ? (
        <p className="managed-field__description">{definition.description}</p>
      ) : null}
      <div className="panel-action-row">
        {definition.secret ? (
          <Button variant="ghost" onClick={() => setRevealed((value) => !value)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
        ) : null}
        <Button
          // Saving a blank secret would wipe an already-set value; require typing a new one.
          disabled={saving || (definition.secret && draft.trim() === "")}
          onClick={() => fireAndForget(save(), `save ${definition.id}`)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {status ? <span className="managed-field__status">{status}</span> : null}
      </div>
    </div>
  );
}

/**
 * The managed settings the app reads and writes back into the runtime env file on the operator's
 * behalf, grouped by subsystem. Saving applies live (the backend re-applies the affected
 * subsystem); a tunnel-key change asks before restarting the tunnel.
 */
export function ManagedSettingsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const groups = MANAGED_GROUP_ORDER.map((subsystem) => ({
    subsystem,
    label: SUBSYSTEM_GROUP_LABELS[subsystem] ?? subsystem,
    settings: MANAGED_SETTINGS.filter((setting) => setting.subsystem === subsystem)
  }));

  return (
    <Panel className="settings-panel" title="Managed settings">
      <p>
        These settings are written into the runtime env file for you and take effect without
        restarting the app. Secret fields are hidden until you reveal them.
      </p>
      <div className="stack-md">
        {groups.map((group) => (
          <section key={group.subsystem} className="managed-group">
            <h4 className="managed-group__title">{group.label}</h4>
            {group.settings.map((definition) => (
              <ManagedField
                key={definition.id}
                definition={definition}
                state={currentStateFor(snapshot, definition.id)}
              />
            ))}
          </section>
        ))}
      </div>
    </Panel>
  );
}

/**
 * Reload-from-disk plus the diagnostics escape hatch: a redacted copyable summary and a saved zip
 * of full logs and status. Secrets never leave the app — the bundle shows them only as set/unset
 * or last-4.
 */
export function DiagnosticsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState<"copy" | "save" | "reload" | null>(null);

  async function copyDiagnostics(): Promise<void> {
    setWorking("copy");
    setStatus(null);
    try {
      const { summary } = await fetchDiagnosticsSummary();
      await navigator.clipboard.writeText(summary);
      setStatus("Diagnostics copied to the clipboard. Paste it to the maintainer.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not copy diagnostics.");
    } finally {
      setWorking(null);
    }
  }

  async function saveBundle(): Promise<void> {
    setWorking("save");
    setStatus(null);
    try {
      const { savedPath } = await saveDiagnosticsBundle();
      setStatus(savedPath ? `Saved diagnostics bundle to ${savedPath}.` : "Save canceled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save diagnostics bundle.");
    } finally {
      setWorking(null);
    }
  }

  async function reload(): Promise<void> {
    setWorking("reload");
    setStatus(null);
    try {
      await reloadRuntimeEnv();
      setStatus("Reloaded settings from disk.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reload settings.");
    } finally {
      setWorking(null);
    }
  }

  const runtimeEnv = snapshot.runtimeEnv;

  return (
    <Panel
      className="settings-panel"
      title="Diagnostics"
      actions={
        <div className="panel-action-row settings-panel__actions">
          <Button
            variant="ghost"
            disabled={working !== null}
            onClick={() => fireAndForget(reload(), "reload settings")}
          >
            {working === "reload" ? "Reloading…" : "Reload settings from disk"}
          </Button>
          <Button
            variant="ghost"
            disabled={working !== null}
            onClick={() => fireAndForget(copyDiagnostics(), "copy diagnostics")}
          >
            {working === "copy" ? "Copying…" : "Copy diagnostics"}
          </Button>
          <Button
            disabled={working !== null}
            onClick={() => fireAndForget(saveBundle(), "save diagnostics bundle")}
          >
            {working === "save" ? "Saving…" : "Save diagnostics bundle"}
          </Button>
        </div>
      }
    >
      <div className="stack-sm">
        <p>
          If something is still broken after the guidance above, copy the diagnostics or save the
          bundle and send it to the maintainer. Secrets are never included.
        </p>
        <p>
          Settings file: <code className="breakable-value">{runtimeEnv.path || "(unknown)"}</code> (
          {runtimeEnv.exists ? "exists" : "missing"})
        </p>
        {runtimeEnv.loadedFiles.length ? (
          <div className="stack-sm">
            <strong>Loaded at startup</strong>
            {runtimeEnv.loadedFiles.map((filePath) => (
              <code className="breakable-value" key={filePath}>
                {filePath}
              </code>
            ))}
          </div>
        ) : (
          <p>No settings files were loaded at startup.</p>
        )}
        {status ? <p>{status}</p> : null}
      </div>
    </Panel>
  );
}
