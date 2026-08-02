/**
 * Bare-letter keyboard shortcuts on the admin surface. The surface is full of text fields, so every
 * shortcut has to answer the same question first: is the operator reaching for a key, or typing?
 */

/**
 * Anything the operator could be typing into. Matched with `closest` rather than by tag name so a
 * focused node nested inside an editable region counts as typing too.
 */
const EDITABLE_SELECTOR = "input, select, textarea, [contenteditable=''], [contenteditable='true']";

/**
 * True when a keystroke is the operator reaching for a shortcut rather than typing into a field.
 * Modified keys stay with the browser and the OS.
 */
export function isShortcutKeystroke(event: KeyboardEvent, key: string): boolean {
  if (event.key.toLowerCase() !== key || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  const target = event.target;
  return !(target instanceof Element) || target.closest(EDITABLE_SELECTOR) == null;
}
