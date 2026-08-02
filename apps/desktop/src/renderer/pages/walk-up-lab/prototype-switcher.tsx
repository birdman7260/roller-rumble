/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * The chrome bar that flips between variants and shows what each one cost the operator. Styled to be
 * obviously *not* part of the design under evaluation, and hidden outside a dev build so a stray
 * merge can never show it to an operator.
 *
 * The cost readout is the point of the whole prototype: the issue asks for the loop to be judged
 * "tap by tap", and taps-and-characters per race is the only way to compare a command line against a
 * grid of chips without it coming down to taste.
 */

import { useEffect, useEffectEvent } from "react";
import { isShortcutKeystroke } from "../../lib/shortcuts";
import type { LabCost } from "./prototype-model";

export function PrototypeSwitcher({
  variantKeys,
  variantNames,
  activeKey,
  onSelect,
  current,
  completed,
  average,
  lastLogLine,
  onReset
}: {
  variantKeys: readonly string[];
  variantNames: Readonly<Record<string, string>>;
  activeKey: string;
  onSelect: (key: string) => void;
  current: LabCost;
  completed: number;
  average: LabCost | null;
  lastLogLine: string | undefined;
  onReset: () => void;
}) {
  const activeIndex = variantKeys.indexOf(activeKey);

  function step(offset: number): void {
    onSelect(variantKeys[(activeIndex + offset + variantKeys.length) % variantKeys.length]);
  }

  // The listener is mounted once; `useEffectEvent` keeps it reading the current variant without
  // re-subscribing every time the operator flips one.
  const onArrowKey = useEffectEvent((event: KeyboardEvent) => {
    const back = isShortcutKeystroke(event, "arrowleft");
    const forward = isShortcutKeystroke(event, "arrowright");
    if (!back && !forward) {
      return;
    }
    event.preventDefault();
    step(forward ? 1 : -1);
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      onArrowKey(event);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <nav className="prototype-switcher" aria-label="Prototype variant switcher">
      <button
        type="button"
        className="prototype-switcher__arrow"
        aria-label="Previous variant"
        onClick={() => {
          step(-1);
        }}
      >
        ←
      </button>
      <span className="prototype-switcher__label">
        {String.fromCharCode(65 + activeIndex)} — {variantNames[activeKey] ?? activeKey}
      </span>
      <button
        type="button"
        className="prototype-switcher__arrow"
        aria-label="Next variant"
        onClick={() => {
          step(1);
        }}
      >
        →
      </button>

      <span className="prototype-switcher__divider" aria-hidden="true" />

      <span className="prototype-switcher__cost">
        this race <strong>{current.taps}</strong> taps · <strong>{current.typedChars}</strong> chars
      </span>
      <span className="prototype-switcher__cost">
        {average === null
          ? "no races yet"
          : `avg over ${completed} · ${average.taps} taps · ${average.typedChars} chars`}
      </span>

      <span className="prototype-switcher__divider" aria-hidden="true" />

      <span className="prototype-switcher__log">{lastLogLine ?? ""}</span>

      <button
        type="button"
        className="prototype-switcher__arrow"
        onClick={() => {
          onReset();
        }}
      >
        Reset
      </button>
    </nav>
  );
}
