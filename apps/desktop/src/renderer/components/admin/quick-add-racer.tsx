import { useReducer } from "react";
import { createRacerSchema } from "@roller-rumble/shared/validation";
import { Button, Panel, TextInput } from "@roller-rumble/shared-ui";
import { registerRacer } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";

interface QuickAddRacerState {
  displayName: string;
  realName: string;
  email: string;
  phone: string;
  saving: boolean;
  message: string | null;
}

const emptyQuickAddRacerState: QuickAddRacerState = {
  displayName: "",
  realName: "",
  email: "",
  phone: "",
  saving: false,
  message: null
};

function quickAddRacerReducer(
  state: QuickAddRacerState,
  patch: Partial<QuickAddRacerState>
): QuickAddRacerState {
  return { ...state, ...patch };
}

const quickAddFieldLabels: Record<string, string> = {
  displayName: "display name",
  realName: "real name",
  email: "email",
  phone: "phone number"
};

/**
 * The admin desk's add-racer form. Every submit creates a new racer, even when the email or
 * phone matches someone already registered (ADR-0024). Only the display name is required.
 */
export function QuickAddRacerPanel() {
  const [state, update] = useReducer(quickAddRacerReducer, emptyQuickAddRacerState);
  const displayNameId = "quick-add-racer-display-name";
  const realNameId = "quick-add-racer-real-name";
  const emailId = "quick-add-racer-email";
  const phoneId = "quick-add-racer-phone";
  const canSubmit = state.displayName.trim().length > 0 && !state.saving;

  async function addRacer(): Promise<void> {
    // Same rules the server applies, checked here so the desk gets a readable message.
    const parsed = createRacerSchema.safeParse(state);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      update({ message: `Check the ${quickAddFieldLabels[String(issue.path[0])]}.` });
      return;
    }

    update({ saving: true, message: null });
    try {
      const { racer } = await registerRacer(parsed.data);
      update({ ...emptyQuickAddRacerState, message: `Added ${racer.displayName}.` });
    } catch (error) {
      update({
        saving: false,
        message: error instanceof Error ? error.message : "Could not add the racer."
      });
    }
  }

  return (
    <Panel title="Quick Add Racer">
      <div className="form-grid">
        <label htmlFor={displayNameId}>
          Display name
          <TextInput
            id={displayNameId}
            value={state.displayName}
            onChange={(event) => {
              update({ displayName: event.target.value });
            }}
            placeholder="Turbo Tortoise"
            required
          />
        </label>
        <label htmlFor={realNameId}>
          Real name (optional)
          <TextInput
            id={realNameId}
            value={state.realName}
            onChange={(event) => {
              update({ realName: event.target.value });
            }}
            placeholder="Alex Fast"
            autoComplete="off"
          />
        </label>
        <label htmlFor={emailId}>
          Email (optional)
          <TextInput
            id={emailId}
            type="email"
            value={state.email}
            onChange={(event) => {
              update({ email: event.target.value });
            }}
            placeholder="alex@example.com"
            autoComplete="off"
          />
        </label>
        <label htmlFor={phoneId}>
          Phone (optional)
          <TextInput
            id={phoneId}
            type="tel"
            value={state.phone}
            onChange={(event) => {
              update({ phone: event.target.value });
            }}
            placeholder="555-0100"
            autoComplete="off"
          />
        </label>
        <Button
          disabled={!canSubmit}
          onClick={() => {
            fireAndForget(addRacer(), "quick add racer");
          }}
        >
          Add Racer
        </Button>
        {state.message ? (
          <p className="muted" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
