import type { InputHTMLAttributes } from "react";
import { TextInput } from "@roller-rumble/shared-ui";
import { applyPhoneEdit } from "../lib/phone-format";

type PhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * A phone field that formats the number as it's typed (`555-555-5555`) while keeping the
 * caret where the racer is editing, including in the middle of the number.
 */
export function PhoneInput({ value, onValueChange, ...props }: PhoneInputProps) {
  return (
    <TextInput
      {...props}
      type="tel"
      value={value}
      onChange={(event) => {
        const input = event.currentTarget;
        const edit = applyPhoneEdit({
          previous: value,
          typed: input.value,
          caret: input.selectionStart ?? input.value.length,
          deletingForward: (event.nativeEvent as InputEvent).inputType === "deleteContentForward"
        });
        // Writing the formatted text before React re-renders means React finds the field
        // already up to date and leaves the caret where it's placed here.
        input.value = edit.value;
        if (document.activeElement === input) {
          input.setSelectionRange(edit.caret, edit.caret);
        }
        onValueChange(edit.value);
      }}
    />
  );
}
