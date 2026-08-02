/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * Three radically different answers to the walk-up host's race-composition loop — "a stranger walks
 * up" to "the race is running", over and over all evening — switchable via `?variant=` on
 * `/walk-up-lab`. They share one in-memory scenario (`prototype-model.ts`) and nothing else: each
 * owns its own layout, and each answers the issue's "where does this live" question differently.
 *
 *   ?variant=command-line  A — one always-focused field, the desk replaces the admin window
 *   ?variant=two-bikes     B — the two rollers as seats, a walk-up tab set replaces the standard one
 *   ?variant=roster        C — tonight's riders as tappable chips, one more tab beside the five
 *
 * Nothing here talks to the backend. Switching variants keeps the scenario, so the same evening can
 * be run through all three and compared on the tap counter in the chrome bar.
 */

import { useEffect, useReducer } from "react";
import { PrototypeSwitcher } from "./prototype-switcher";
import { VariantCommandLine, VARIANT_COMMAND_LINE_NAME } from "./variant-command-line";
import { VariantRoster, VARIANT_ROSTER_NAME } from "./variant-roster";
import { VariantTwoBikes, VARIANT_TWO_BIKES_NAME } from "./variant-two-bikes";
import { averageCost, createInitialState, walkUpLabReducer } from "./prototype-model";

const VARIANT_KEYS = ["command-line", "two-bikes", "roster"] as const;

type VariantKey = (typeof VARIANT_KEYS)[number];

const VARIANT_NAMES: Record<VariantKey, string> = {
  "command-line": VARIANT_COMMAND_LINE_NAME,
  "two-bikes": VARIANT_TWO_BIKES_NAME,
  roster: VARIANT_ROSTER_NAME
};

/** How often the fake race clock advances. Fine-grained enough for a visible countdown. */
const CLOCK_INTERVAL_MS = 200;

/**
 * The scenario starts with an unset clock rather than `Date.now()`, so nothing reads the wall clock
 * during render. The first tick, one interval later, supplies the real time before the operator can
 * have started anything.
 */
const UNSET_CLOCK = 0;

function toVariantKey(value: string | undefined): VariantKey {
  return VARIANT_KEYS.find((key) => key === value) ?? VARIANT_KEYS[0];
}

export function WalkUpLabPage({
  variant,
  onVariantChange
}: {
  variant: string | undefined;
  onVariantChange: (variant: string) => void;
}) {
  const [state, dispatch] = useReducer(walkUpLabReducer, UNSET_CLOCK, createInitialState);
  const activeKey = toVariantKey(variant);

  // One always-on clock rather than a timer per phase: the reducer derives every transition from
  // elapsed time, so nothing the operator does has to schedule anything.
  useEffect(() => {
    const timer = window.setInterval(() => {
      dispatch({ type: "tick", now: Date.now() });
    }, CLOCK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="walk-up-lab">
      {activeKey === "command-line" ? (
        <VariantCommandLine state={state} dispatch={dispatch} />
      ) : null}
      {activeKey === "two-bikes" ? <VariantTwoBikes state={state} dispatch={dispatch} /> : null}
      {activeKey === "roster" ? <VariantRoster state={state} dispatch={dispatch} /> : null}

      <PrototypeSwitcher
        variantKeys={VARIANT_KEYS}
        variantNames={VARIANT_NAMES}
        activeKey={activeKey}
        onSelect={onVariantChange}
        current={state.current}
        completed={state.completed.length}
        average={averageCost(state.completed)}
        lastLogLine={state.log[0]}
        onReset={() => {
          dispatch({ type: "reset" });
        }}
      />
    </div>
  );
}
