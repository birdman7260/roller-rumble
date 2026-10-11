import { Button } from "@roller-rumble/shared-ui";
import { AvatarPicker } from "../avatar-picker";
import { PhotoBoothQr } from "../photo-booth-qr";

/**
 * Step 3: required, with no skip. The step completes from the racer's avatar on the server, so a
 * photo from the booth counts as soon as it arrives.
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
  onUpload: (file: File) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="form-grid">
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
