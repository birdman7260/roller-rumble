import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhoneInput } from "./phone-input";

function Harness() {
  const [phone, setPhone] = useState("");
  return (
    <label htmlFor="phone">
      Phone
      <PhoneInput id="phone" value={phone} onValueChange={setPhone} />
    </label>
  );
}

/**
 * Simulates the browser applying one edit: new text, caret placed, then an input event. The
 * text goes through the prototype's setter, as a browser's would, so React sees the change.
 */
function edit(input: HTMLInputElement, value: string, caret: number, inputType: string): void {
  Reflect.set(HTMLInputElement.prototype, "value", value, input);
  input.setSelectionRange(caret, caret);
  fireEvent.input(input, { inputType });
}

describe("PhoneInput", () => {
  it("formats the number and keeps the caret where the racer is editing", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Phone");
    input.focus();
    edit(input, "555555555", 9, "insertFromPaste");
    expect(input).toHaveValue("555-555-555");

    // 555-|555-555 → type 9
    edit(input, "555-9555-555", 5, "insertText");
    expect(input).toHaveValue("555-955-5555");
    expect(input.selectionStart).toBe(5);

    // 555-|955-5555 → backspace over the dash deletes the 5 before it
    edit(input, "555955-5555", 3, "deleteContentBackward");
    expect(input).toHaveValue("559-555-555");
    expect(input.selectionStart).toBe(2);
  });
});
