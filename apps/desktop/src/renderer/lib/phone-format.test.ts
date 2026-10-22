import { describe, expect, it } from "vitest";
import { applyPhoneEdit, formatPhoneInput } from "./phone-format";

describe("formatPhoneInput", () => {
  it("groups ten digits as 555-555-5555", () => {
    expect(formatPhoneInput("5555555555")).toBe("555-555-5555");
  });

  it("adds dashes only once a digit follows them", () => {
    expect(formatPhoneInput("555")).toBe("555");
    expect(formatPhoneInput("5555")).toBe("555-5");
    expect(formatPhoneInput("555555")).toBe("555-555");
    expect(formatPhoneInput("5555555")).toBe("555-555-5");
  });

  it("lets a backspace over a trailing dash remove it", () => {
    expect(formatPhoneInput("555-")).toBe("555");
  });

  it("reformats pasted punctuation", () => {
    expect(formatPhoneInput("(555) 010-0100")).toBe("555-010-0100");
    expect(formatPhoneInput("555.010.0100")).toBe("555-010-0100");
  });

  it("drops anything that isn't a digit", () => {
    expect(formatPhoneInput("555abc")).toBe("555");
    expect(formatPhoneInput("")).toBe("");
  });

  it("leaves international numbers as typed", () => {
    expect(formatPhoneInput("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhoneInput("1 555 010 0100")).toBe("1 555 010 0100");
  });
});

describe("applyPhoneEdit", () => {
  function edit(previous: string, typed: string, caret: number, deletingForward = false) {
    return applyPhoneEdit({ previous, typed, caret, deletingForward });
  }

  it("keeps the caret after a digit typed at the end, past the new dash", () => {
    expect(edit("555", "5555", 4)).toEqual({ value: "555-5", caret: 5 });
  });

  it("keeps the caret after a digit typed in the middle", () => {
    // 555-|555-555 → type 9 → 555-9555-555
    expect(edit("555-555-555", "555-9555-555", 5)).toEqual({ value: "555-955-5555", caret: 5 });
  });

  it("keeps the caret where a digit was deleted from the middle", () => {
    // 555-55|5-5555 → backspace
    expect(edit("555-555-5555", "555-55-5555", 6)).toEqual({ value: "555-555-555", caret: 6 });
  });

  it("deletes the digit before a dash when backspacing over it", () => {
    // 555-|555-5555 → backspace
    expect(edit("555-555-5555", "555555-5555", 3)).toEqual({ value: "555-555-555", caret: 2 });
  });

  it("deletes the digit after a dash when forward-deleting over it", () => {
    // 555|-555-5555 → delete
    expect(edit("555-555-5555", "555555-5555", 3, true)).toEqual({
      value: "555-555-555",
      caret: 3
    });
  });

  it("keeps the caret in place when a typed letter is dropped", () => {
    expect(edit("555-555", "555-a555", 5)).toEqual({ value: "555-555", caret: 4 });
  });

  it("keeps the caret after a dash when the digit after it is deleted", () => {
    // 555-5|55 → backspace
    expect(edit("555-555", "555-55", 4)).toEqual({ value: "555-55", caret: 4 });
  });

  it("puts the caret at the start when the first digit is deleted", () => {
    expect(edit("555-5", "55-5", 0)).toEqual({ value: "555", caret: 0 });
  });

  it("leaves the caret alone in an international number", () => {
    expect(edit("+44 20", "+44 920", 5)).toEqual({ value: "+44 920", caret: 5 });
    // Deleting a space the formatter never adds just deletes the space.
    expect(edit("+44 20", "+4420", 3)).toEqual({ value: "+4420", caret: 3 });
  });
});
