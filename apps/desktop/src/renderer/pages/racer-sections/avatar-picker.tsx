import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FileButton } from "@roller-rumble/shared-ui";
import { SelfieCamera } from "./selfie-camera";

/**
 * The racer's large round photo. With no photo yet, the whole circle is the tap target: it shows
 * the racer's initial, an "Add photo" hint, and a camera badge where the pencil sits once there
 * is a photo. Tapping either one opens a selfie camera with a shutter and a "Choose from library"
 * button at the bottom. Where the browser can't open the camera (a plain-HTTP LAN page), it falls
 * back to the phone's own camera app. A "Choose from library" button underneath opens the photo
 * library, and an overlay covers the circle while an upload is in flight.
 */
export function AvatarPicker({
  avatarUrl,
  displayName,
  busy,
  onUpload
}: {
  avatarUrl: string | null;
  displayName: string;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Browsers only expose navigator.mediaDevices in a secure context (HTTPS or localhost).
  const selfieCameraAvailable = "mediaDevices" in navigator;

  function openCamera() {
    if (selfieCameraAvailable) {
      setCameraOpen(true);
    } else {
      fallbackInputRef.current?.click();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onUpload(file);
    }
  }

  function sendPhoto(file: File) {
    setCameraOpen(false);
    onUpload(file);
  }

  return (
    <div className="racer-avatar-picker">
      <div className="racer-avatar-frame">
        {avatarUrl ? (
          <img className="racer-avatar racer-avatar--large" src={avatarUrl} alt={displayName} />
        ) : (
          <button
            type="button"
            className={`racer-avatar racer-avatar--large racer-avatar--empty${busy ? " is-disabled" : ""}`}
            aria-label="Add photo"
            disabled={busy}
            onClick={openCamera}
          >
            <span className="racer-avatar-empty__initial" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="racer-avatar-empty__hint" aria-hidden="true">
              Add photo
            </span>
            <span className="racer-avatar-edit-button" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </button>
        )}
        {busy ? (
          <output className="racer-avatar-uploading" aria-live="polite">
            <span className="racer-avatar-uploading__spinner" aria-hidden="true" />
            <span className="racer-avatar-uploading__label">Uploading…</span>
          </output>
        ) : null}
        {avatarUrl ? (
          <button
            type="button"
            className={`racer-avatar-edit-button${busy ? " is-disabled" : ""}`}
            aria-label="Change photo"
            title="Change photo"
            disabled={busy}
            onClick={openCamera}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="M4 20h4l11-11-4-4L4 16v4z" />
              <path d="M14 6l4 4" />
            </svg>
          </button>
        ) : null}
        {/* Only used when the selfie camera can't open; the phone's camera app takes over. */}
        <input
          ref={fallbackInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="user"
          tabIndex={-1}
          aria-hidden="true"
          disabled={busy}
          onChange={handleFileChange}
        />
      </div>
      <FileButton variant="ghost" accept="image/*" disabled={busy} onChange={handleFileChange}>
        Choose from library
      </FileButton>
      {cameraOpen ? (
        <SelfieCamera
          onCapture={sendPhoto}
          onLibraryFile={sendPhoto}
          onClose={() => {
            setCameraOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
