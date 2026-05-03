import type { AppSnapshot } from "@shared/types";
import { Panel } from "../ui";
import { startTunnel, stopTunnel, updateSettings } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";

export function SettingsTab({
  snapshot,
  meta
}: {
  snapshot: AppSnapshot;
  meta?: { localBaseUrl: string; qrCodeDataUrl: string };
}) {
  return (
    <div className="page-grid">
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
        </div>
      </Panel>

      <Panel
        title="Tunnel"
        actions={
          snapshot.tunnel.status === "active" ? (
            <button
              className="button button--ghost"
              onClick={() => {
                fireAndForget(stopTunnel());
              }}
            >
              Stop Tunnel
            </button>
          ) : (
            <button
              className="button"
              onClick={() => {
                fireAndForget(startTunnel());
              }}
            >
              Start Tunnel
            </button>
          )
        }
      >
        <div className="stack-sm">
          <strong>Status: {snapshot.tunnel.status}</strong>
          <span>{snapshot.tunnel.publicUrl ?? meta?.localBaseUrl ?? "Tunnel inactive"}</span>
          {snapshot.tunnel.message ? <span>{snapshot.tunnel.message}</span> : null}
          {meta?.qrCodeDataUrl ? (
            <img className="qr-code" src={meta.qrCodeDataUrl} alt="QR code for racer page" />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
