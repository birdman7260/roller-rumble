import type { RacerRegistrationInput } from "@roller-rumble/shared/types";

/**
 * What a racer has typed into the `registration wizard` before their racer exists (ADR-0024 D4).
 * It lives only on this phone, so an abandoned wizard never puts anything on the projector.
 */
export interface RegistrationDraft extends RacerRegistrationInput {
  contactDetailsConfirmed: boolean;
}

export const emptyRegistrationDraft: RegistrationDraft = {
  realName: "",
  email: "",
  phone: "",
  displayName: "",
  contactDetailsConfirmed: false
};

const registrationDraftStorageKey = "roller-rumble.registrationDraft";

function readString(record: Record<string, unknown>, key: keyof RacerRegistrationInput): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

// Local storage can be missing or throw (private mode, blocked site data), so every access is
// guarded and the wizard falls back to a blank draft.
export function loadRegistrationDraft(): RegistrationDraft {
  try {
    const stored = localStorage.getItem(registrationDraftStorageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (typeof parsed !== "object" || parsed === null) {
      return emptyRegistrationDraft;
    }
    const record = parsed as Record<string, unknown>;
    return {
      realName: readString(record, "realName"),
      email: readString(record, "email"),
      phone: readString(record, "phone"),
      displayName: readString(record, "displayName"),
      contactDetailsConfirmed: record.contactDetailsConfirmed === true
    };
  } catch {
    return emptyRegistrationDraft;
  }
}

export function saveRegistrationDraft(draft: RegistrationDraft): void {
  try {
    localStorage.setItem(registrationDraftStorageKey, JSON.stringify(draft));
  } catch {
    // The draft is a convenience; losing it only means retyping after a reload.
  }
}

export function clearRegistrationDraft(): void {
  try {
    localStorage.removeItem(registrationDraftStorageKey);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
