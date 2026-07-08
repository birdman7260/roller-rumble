/**
 * The initial(s) shown on a lane card's monogram when a racer has no avatar: the
 * first word's initial, plus the last word's for multi-word names. Splits on
 * grapheme-safe code points so an emoji or accented first letter is never sliced
 * in half, and falls back to `?` for a blank name.
 */
export function getMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}
