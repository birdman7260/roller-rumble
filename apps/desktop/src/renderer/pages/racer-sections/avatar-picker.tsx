import type { ChangeEvent } from "react";

/**
 * The racer's large round photo. With no photo yet, the whole circle is the tap target: it shows
 * the racer's initial, an "Add photo" hint, and a camera badge where the pencil sits once there
 * is a photo. Both open the phone's own camera-or-library chooser, and an overlay covers the
 * circle while an upload is in flight.
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
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="racer-avatar-frame">
      {avatarUrl ? (
        <img className="racer-avatar racer-avatar--large" src={avatarUrl} alt={displayName} />
      ) : (
        <label
          className={`racer-avatar racer-avatar--large racer-avatar--empty${busy ? " is-disabled" : ""}`}
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
          <input
            className="racer-avatar-edit-button__input"
            type="file"
            accept="image/*"
            aria-label="Add photo"
            disabled={busy}
            onChange={onUpload}
          />
        </label>
      )}
      {busy ? (
        <output className="racer-avatar-uploading" aria-live="polite">
          <span className="racer-avatar-uploading__spinner" aria-hidden="true" />
          <span className="racer-avatar-uploading__label">Uploading…</span>
        </output>
      ) : null}
      {avatarUrl ? (
        <label
          className={`racer-avatar-edit-button${busy ? " is-disabled" : ""}`}
          aria-label="Change photo"
          title="Change photo"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M4 20h4l11-11-4-4L4 16v4z" />
            <path d="M14 6l4 4" />
          </svg>
          <input
            className="racer-avatar-edit-button__input"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={onUpload}
          />
        </label>
      ) : null}
    </div>
  );
}
