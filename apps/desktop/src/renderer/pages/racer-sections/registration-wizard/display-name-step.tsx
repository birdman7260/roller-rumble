import { Button, TextInput } from "@roller-rumble/shared-ui";
import { racerRegistrationSchema } from "@roller-rumble/shared/validation";

/**
 * Step 2, "Pick your racer name": the public `display name` on the projector. Continuing creates
 * the racer, so nothing reaches the big screen until this step is submitted.
 */
export function DisplayNameStep({
  displayName,
  busy,
  errorMessage,
  onChange,
  onBack,
  onSubmit
}: {
  displayName: string;
  busy: boolean;
  errorMessage: string | null;
  onChange: (displayName: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const canSubmit =
    racerRegistrationSchema.shape.displayName.safeParse(displayName).success && !busy;

  return (
    <form
      className="form-grid"
      noValidate
      action={() => {
        if (canSubmit) {
          onSubmit();
        }
      }}
    >
      <div className="racer-section-heading">
        <strong>Pick your racer name</strong>
        <p>
          This is the name the crowd sees on the big screen. Go big: Turbo Tortoise, Captain
          Cadence, Sir Spins-a-Lot.
        </p>
      </div>
      <label htmlFor="registration-display-name">
        Racer name
        <TextInput
          id="registration-display-name"
          autoComplete="nickname"
          maxLength={80}
          placeholder="Turbo Tortoise"
          value={displayName}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="button-row">
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          Back
        </Button>
        <Button type="submit" variant="accent" disabled={!canSubmit}>
          {busy ? "Signing you up..." : "Continue"}
        </Button>
      </div>
    </form>
  );
}
