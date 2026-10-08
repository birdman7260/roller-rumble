import type { ChangeEvent } from "react";
import { Button } from "@roller-rumble/shared-ui";
import { AvatarPicker } from "../avatar-picker";
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
  onBack,
  onContinue
}: {
  avatarUrl: string | null;
  displayName: string;
  busy: boolean;
  message: string | null;
  photoBoothEnabled: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
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
      <div className="registration-photo-step__avatar">
        <AvatarPicker
          avatarUrl={avatarUrl}
          displayName={displayName}
          busy={busy}
          onUpload={onUpload}
        />
      </div>
      {message && !busy ? <p>{message}</p> : null}
      {photoBoothEnabled ? <PhotoBoothQr /> : null}
      <div className="registration-step-actions">
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          Back
        </Button>
        <Button variant="accent" disabled={!avatarUrl || busy} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
