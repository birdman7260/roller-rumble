// Whether this phone's racer has read the "pay at the desk" step, kept per racer id. Local
// storage can be missing or throw (private mode, blocked site data); the worst case is the racer
// sees the step again after a reload.
function storageKey(racerId: string): string {
  return `roller-rumble.payAtDeskAcknowledged.${racerId}`;
}

export function loadPayAtDeskAcknowledged(racerId: string): boolean {
  try {
    return localStorage.getItem(storageKey(racerId)) === "true";
  } catch {
    return false;
  }
}

export function savePayAtDeskAcknowledged(racerId: string): void {
  try {
    localStorage.setItem(storageKey(racerId), "true");
  } catch {
    // The acknowledgement still holds for this visit.
  }
}

export function forgetPayAtDeskAcknowledged(racerId: string): void {
  try {
    localStorage.removeItem(storageKey(racerId));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
