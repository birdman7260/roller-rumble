import { Button, EmptyState, TextInput } from "@roller-rumble/shared-ui";
import { fireAndForget } from "../../lib/ui-actions";

export interface AuthFormProps {
  accountlessDisplayName: string;
  authBusy: boolean;
  authMessage: string | null;
  authMode: "email" | "register" | "host-assist";
  canContinueAccountless: boolean;
  displayName: string;
  email: string;
  onContinueAccountless: () => Promise<void>;
  onEmailSignIn: () => Promise<void>;
  onPasskeyRegistration: (input: {
    displayName: string;
    email: string;
    phone?: string;
  }) => Promise<void>;
  passkeyUnavailableMessage: string | null;
  phone: string;
  setAccountlessDisplayName: (value: string) => void;
  setAuthMessage: (value: string | null) => void;
  setAuthMode: (value: "email" | "register" | "host-assist") => void;
  setDisplayName: (value: string) => void;
  setEmail: (value: string) => void;
  setPhone: (value: string) => void;
}

export function AuthForm({
  accountlessDisplayName,
  authBusy,
  authMessage,
  authMode,
  canContinueAccountless,
  displayName,
  email,
  onContinueAccountless,
  onEmailSignIn,
  onPasskeyRegistration,
  passkeyUnavailableMessage,
  phone,
  setAccountlessDisplayName,
  setAuthMessage,
  setAuthMode,
  setDisplayName,
  setEmail,
  setPhone
}: AuthFormProps) {
  return (
    <div className="form-grid">
      <label htmlFor="racer-auth-email">
        Email
        <TextInput
          id="racer-auth-email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setAuthMode("email");
            setAuthMessage(null);
          }}
          placeholder="email@example.com"
        />
      </label>
      {authMode === "register" ? (
        <>
          <label htmlFor="racer-auth-display-name">
            Display name
            <TextInput
              id="racer-auth-display-name"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              placeholder="Racer name"
            />
          </label>
          <label htmlFor="racer-auth-phone">
            Phone
            <TextInput
              id="racer-auth-phone"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              placeholder="555-0100"
            />
          </label>
        </>
      ) : null}
      {authMessage ? <p className="form-error">{authMessage}</p> : null}
      {passkeyUnavailableMessage ? <p className="form-error">{passkeyUnavailableMessage}</p> : null}
      {authMode === "host-assist" ? (
        <EmptyState
          title="See the host"
          body="This email is already registered, but it does not have a passkey yet. A host can help attach one safely."
        />
      ) : null}
      {canContinueAccountless ? (
        <div className="accountless-racer-signup stack-sm">
          <div className="racer-section-heading">
            <strong>Continue without an account</strong>
            <p>
              Enter the name people should see on the race display. You can add email and a passkey
              later.
            </p>
          </div>
          <label htmlFor="racer-accountless-display-name">
            Display name
            <TextInput
              id="racer-accountless-display-name"
              value={accountlessDisplayName}
              onChange={(event) => {
                setAccountlessDisplayName(event.target.value);
              }}
              placeholder="Racer name"
            />
          </label>
        </div>
      ) : null}
      <div className="button-row">
        {authMode === "register" ? (
          <Button
            disabled={!email || !displayName || authBusy || Boolean(passkeyUnavailableMessage)}
            onClick={() => {
              fireAndForget(
                onPasskeyRegistration({
                  email,
                  displayName,
                  phone: phone || undefined
                }),
                "register passkey"
              );
            }}
          >
            {displayName ? `Register ${displayName}` : "Register"}
          </Button>
        ) : (
          <Button
            disabled={!email || authBusy || Boolean(passkeyUnavailableMessage)}
            onClick={() => {
              fireAndForget(onEmailSignIn(), "passkey sign in");
            }}
          >
            Sign in
          </Button>
        )}
        {authMode !== "email" ? (
          <Button
            variant="ghost"
            onClick={() => {
              setAuthMode("email");
              setAuthMessage(null);
            }}
          >
            Back
          </Button>
        ) : null}
        {canContinueAccountless ? (
          <Button
            variant="ghost"
            disabled={!accountlessDisplayName.trim() || authBusy}
            onClick={() => {
              fireAndForget(onContinueAccountless(), "accountless racer session");
            }}
          >
            Continue accountless
          </Button>
        ) : null}
      </div>
    </div>
  );
}
