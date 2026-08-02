import { describe, expect, it } from "vitest";
import { isShortcutKeystroke } from "./shortcuts";

const SHORTCUT_KEY = "s";

describe("isShortcutKeystroke", () => {
  function keydown(init: KeyboardEventInit, target?: HTMLElement): KeyboardEvent {
    const event = new KeyboardEvent("keydown", init);
    if (target) {
      Object.defineProperty(event, "target", { value: target });
    }
    return event;
  }

  it("accepts the bare shortcut key in either case", () => {
    expect(isShortcutKeystroke(keydown({ key: "s" }), SHORTCUT_KEY)).toBe(true);
    expect(isShortcutKeystroke(keydown({ key: "S" }), SHORTCUT_KEY)).toBe(true);
  });

  it("ignores another key", () => {
    expect(isShortcutKeystroke(keydown({ key: "a" }), SHORTCUT_KEY)).toBe(false);
  });

  it("ignores the key under a modifier so browser and OS shortcuts still work", () => {
    expect(isShortcutKeystroke(keydown({ key: "s", metaKey: true }), SHORTCUT_KEY)).toBe(false);
    expect(isShortcutKeystroke(keydown({ key: "s", ctrlKey: true }), SHORTCUT_KEY)).toBe(false);
    expect(isShortcutKeystroke(keydown({ key: "s", altKey: true }), SHORTCUT_KEY)).toBe(false);
  });

  it("stays out of the way while the operator is typing", () => {
    // The admin surface is full of text fields — a bare letter must never fire from inside one.
    for (const tagName of ["input", "select", "textarea"]) {
      expect(
        isShortcutKeystroke(keydown({ key: "s" }, document.createElement(tagName)), SHORTCUT_KEY)
      ).toBe(false);
    }

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isShortcutKeystroke(keydown({ key: "s" }, editable), SHORTCUT_KEY)).toBe(false);

    // A node nested inside an editable region is still the operator typing.
    const nested = document.createElement("span");
    editable.append(nested);
    expect(isShortcutKeystroke(keydown({ key: "s" }, nested), SHORTCUT_KEY)).toBe(false);
  });

  it("fires from an ordinary element", () => {
    expect(
      isShortcutKeystroke(keydown({ key: "s" }, document.createElement("div")), SHORTCUT_KEY)
    ).toBe(true);
  });
});
