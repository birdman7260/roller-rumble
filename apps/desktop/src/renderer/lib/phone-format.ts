const MAX_GROUPED_DIGITS = 10;

/**
 * Formats a phone number as it's typed, grouping digits like `555-555-5555`. A dash only
 * appears once a digit follows it, so backspacing over one never gets stuck. Numbers typed
 * with a leading `+` or longer than ten digits are international and are left as typed.
 */
export function formatPhoneInput(value: string): string {
  if (value.trimStart().startsWith("+")) {
    return value;
  }
  const digits = onlyDigits(value);
  if (digits.length > MAX_GROUPED_DIGITS) {
    return value;
  }
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join("-");
}

export interface PhoneEdit {
  value: string;
  caret: number;
}

/**
 * Applies one edit to a formatted phone field and says where the caret belongs afterwards, so
 * it stays beside the digit the racer just typed or deleted instead of jumping to the end.
 * Deleting a dash the formatter would only put back deletes the digit on the far side of it.
 */
export function applyPhoneEdit({
  previous,
  typed,
  caret,
  deletingForward
}: {
  previous: string;
  /** The field's text right after the edit, before formatting. */
  typed: string;
  /** The caret position in `typed`. */
  caret: number;
  deletingForward: boolean;
}): PhoneEdit {
  let raw = typed;
  let digitsBeforeCaret = onlyDigits(typed.slice(0, caret)).length;
  // A caret that sat after a dash (or a dropped letter) stays after the dash.
  let caretAfterSeparator = caret > 0 && !/\d/.test(typed[caret - 1]);

  const removedOnlyADash =
    typed.length < previous.length &&
    onlyDigits(typed) === onlyDigits(previous) &&
    formatPhoneInput(typed) === previous;
  if (removedOnlyADash) {
    const digits = onlyDigits(typed);
    const removeAt = deletingForward ? digitsBeforeCaret : digitsBeforeCaret - 1;
    if (removeAt >= 0 && removeAt < digits.length) {
      raw = digits.slice(0, removeAt) + digits.slice(removeAt + 1);
      digitsBeforeCaret = removeAt;
      caretAfterSeparator = false;
    }
  }

  const value = formatPhoneInput(raw);
  if (value === typed) {
    return { value, caret };
  }
  let nextCaret = caretAfterDigits(value, digitsBeforeCaret);
  if (caretAfterSeparator) {
    while (nextCaret < value.length && !/\d/.test(value[nextCaret])) {
      nextCaret += 1;
    }
  }
  return { value, caret: nextCaret };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** The position just after the `count`th digit of `value`. */
function caretAfterDigits(value: string, count: number): number {
  if (count === 0) {
    return 0;
  }
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) {
      seen += 1;
      if (seen === count) {
        return index + 1;
      }
    }
  }
  return value.length;
}
