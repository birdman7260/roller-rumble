import { useQueryClient } from "@tanstack/react-query";
import type { AppSnapshot } from "@shared/types";
import { Panel } from "../ui";
import { rotatePhotoBoothPairing, startTunnel, stopTunnel, updateSettings } from "../../lib/api";
import { photoBoothStatusQueryKey, usePhotoBoothStatusQuery } from "../../lib/query";
import { fireAndForget } from "../../lib/ui-actions";

const boothHardwareLabels = {
  scanner: "QR Scanner",
  camera: "Sony Camera",
  lights: "WLED Lights",
  umbrella: "Umbrella",
  hallSensor: "Hall Sensor"
} as const;

export function SettingsTab({
  snapshot,
  meta
}: {
  snapshot: AppSnapshot;
  meta?: { localBaseUrl: string; qrCodeDataUrl: string };
}) {
  const photoBoothStatusQuery = usePhotoBoothStatusQuery();
  const queryClient = useQueryClient();
  const photoBoothAdminStatus = photoBoothStatusQuery.data;
  const photoBoothStatus = photoBoothAdminStatus?.status ?? snapshot.photoBooth;

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

      <Panel
        title="Kaleidoscope Photo Booth"
        actions={
          <button
            className="button button--ghost"
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
          </button>
        }
      >
        <div className="photo-booth-admin">
          <div className="stat-pill">
            <span className="stat-pill__label">Booth Status</span>
            <strong className="stat-pill__value">{photoBoothStatus.status}</strong>
          </div>
          <div className="stat-pill">
            <span className="stat-pill__label">Pending Sync</span>
            <strong className="stat-pill__value">{photoBoothStatus.pendingUploadCount}</strong>
          </div>
          <div className="stat-pill">
            <span className="stat-pill__label">Last Seen</span>
            <strong className="stat-pill__value">
              {photoBoothStatus.lastSeenAt
                ? new Date(photoBoothStatus.lastSeenAt).toLocaleTimeString()
                : "Not yet"}
            </strong>
          </div>
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
                alt="QR code for photo booth pairing"
              />
            ) : null}
          </div>
          {photoBoothStatus.message ? <p>{photoBoothStatus.message}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
