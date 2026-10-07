import type { PhotoBoothTokenResponse } from "@roller-rumble/shared/types";
import { Button } from "@roller-rumble/shared-ui";
import { useEffect, useState } from "react";
import { createRacerPhotoBoothToken } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";

/** A short-lived QR the photo booth scans to send its photo to this racer's avatar. */
export function PhotoBoothQr() {
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
          alt="Booth scanner token"
        />
      ) : (
        <div className="photo-booth-qr__placeholder">Preparing your booth QR...</div>
      )}
      <div className="photo-booth-qr__footer">
        <span>
          {tokenResponse
            ? `Refreshes automatically - expires ${new Date(
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
