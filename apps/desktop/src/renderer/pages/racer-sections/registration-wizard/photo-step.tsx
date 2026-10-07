import type { ChangeEvent } from "react";
import { Button, FileButton } from "@roller-rumble/shared-ui";
import { PhotoBoothQr } from "../photo-booth-qr";

/**
 * Step 3, "Your photo": required, with no skip. The step completes from the racer's avatar on
 * the server, so a photo from the booth counts as soon as it arrives.
 */
export function PhotoStep({
  avatarUrl,
  displayName,
  busy,
  message,
  photoBoothEnabled,
  onUpload,
  onContinue
}: {
  avatarUrl: string | null;
  displayName: string;
  busy: boolean;
  message: string | null;
  photoBoothEnabled: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onContinue: () => void;
}) {
  return (
    <div className="form-grid">
      <div className="racer-section-heading">
        <strong>Your photo</strong>
        <p>
          Your photo rides next to your racer name on the big screen. Snap a selfie or pick one.
        </p>
      </div>
      {avatarUrl ? (
        <img className="racer-avatar racer-avatar--large" src={avatarUrl} alt={displayName} />
      ) : null}
      <div className="button-row">
        <FileButton
          accept="image/*"
          capture="user"
          variant={avatarUrl ? "ghost" : "accent"}
          disabled={busy}
          onChange={onUpload}
        >
          {avatarUrl ? "Retake selfie" : "Take a selfie"}
        </FileButton>
        <FileButton accept="image/*" variant="ghost" disabled={busy} onChange={onUpload}>
          {avatarUrl ? "Choose another photo" : "Choose a photo"}
        </FileButton>
      </div>
      {busy ? (
        <output aria-live="polite">Uploading your photo…</output>
      ) : message ? (
        <p>{message}</p>
      ) : null}
      {photoBoothEnabled ? <PhotoBoothQr /> : null}
      <div className="button-row">
        <Button variant="accent" disabled={!avatarUrl || busy} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
