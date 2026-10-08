import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHeightCssVariable } from "./use-height-css-variable";

/** jsdom has no ResizeObserver; this one lets a test fire a resize by hand. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const VARIABLE = "--test-dock-height";

let renderedHeight = 0;

function Dock() {
  return <div ref={useHeightCssVariable<HTMLDivElement>(VARIABLE)} />;
}

function readVariable(): string {
  return document.documentElement.style.getPropertyValue(VARIABLE);
}

describe("useHeightCssVariable", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    renderedHeight = 112;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ height: renderedHeight }) as DOMRect
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty(VARIABLE);
  });

  it("publishes the element's height on the root as soon as it mounts", () => {
    render(<Dock />);

    expect(readVariable()).toBe("112px");
  });

  it("follows the element as its height changes", () => {
    render(<Dock />);
    renderedHeight = 148;

    act(() => {
      for (const observer of FakeResizeObserver.instances) {
        observer.fire();
      }
    });

    expect(readVariable()).toBe("148px");
  });

  it("clears the variable and stops observing once the element is gone", () => {
    const { unmount } = render(<Dock />);
    unmount();

    expect(readVariable()).toBe("");
    expect(FakeResizeObserver.instances.every((observer) => observer.disconnected)).toBe(true);
  });
});
