/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * Variant C — **Tonight's roster.** Everyone who has ridden tonight is a chip, most recent first.
 * Tapping a chip seats them on the first free bike; tapping again takes them off. Typing only
 * happens for someone genuinely new, in a single pinned field. The returning rider — the case a
 * market stall generates all evening — costs one tap and zero characters.
 *
 * Its answer to "where does this live": the walk-up desk is **one more tab** beside the existing
 * five, and the staged race stays in the real race tray at the bottom of the window. Nothing else
 * about the admin window moves.
 *
 * Because no text field holds focus, this is the only variant where the `lane swap` keystroke
 * (`S`, ADR 0019) actually fires — it is wired here against the real `isShortcutKeystroke` guard.
 */

import { useEffect, useState } from "react";
import { Button } from "@roller-rumble/shared-ui";
import { LANE_SWAP_SHORTCUT_KEY } from "../../lib/lane-swap";
import { isShortcutKeystroke } from "../../lib/shortcuts";
import { adminTabs } from "../../components/admin/types";
import { LabTabRail, type LabTab } from "./lab-chrome";
import {
  BIKE_LANES,
  canStart,
  canSwap,
  describeBike,
  describeStartAction,
  describeLastSeen,
  describeRider,
  findRider,
  firstFreeLane,
  formatSeconds,
  isSolo,
  ridersByRecency,
  sortResult,
  stagedLanes,
  type WalkUpLabAction,
  type WalkUpLabState
} from "./prototype-model";

export const VARIANT_ROSTER_NAME = "Tonight's roster";

const NEW_RIDER_FIELD_ID = "walk-up-lab-new-rider";

const ROSTER_TABS: LabTab[] = [
  {
    id: "walk-up",
    label: "Walk-Up",
    description: "Compose the next race from tonight's riders."
  },
  ...adminTabs.map((tab) => ({ id: tab.id, label: tab.label, description: tab.description }))
];

export function VariantRoster({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const swapEnabled = canSwap(state);

  useEffect(() => {
    if (!swapEnabled) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isShortcutKeystroke(event, LANE_SWAP_SHORTCUT_KEY)) {
        return;
      }
      event.preventDefault();
      dispatch({ type: "swap-bikes" });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [swapEnabled, dispatch]);

  return (
    <div className="admin-layout">
      <LabTabRail tabs={ROSTER_TABS} activeTabId="walk-up" />
      <section className="admin-workspace">
        <header className="admin-workspace__header">
          <div>
            <p className="eyebrow">Admin Console</p>
            <h1>Walk-Up</h1>
          </div>
          <p className="admin-workspace__description">
            Tap a rider to put them on a bike. Type only for someone new.
          </p>
        </header>
        <div className="admin-workspace__scroll">
          <NewRiderField state={state} dispatch={dispatch} />
          <RosterGrid state={state} dispatch={dispatch} />
        </div>
        <RosterTray state={state} dispatch={dispatch} />
      </section>
    </div>
  );
}

function NewRiderField({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const [draft, setDraft] = useState("");
  const freeLane = firstFreeLane(state);

  function commit(): void {
    if (draft.trim() === "" || freeLane === null) {
      return;
    }
    dispatch({ type: "add-rider", displayName: draft, lane: freeLane, typedChars: draft.length });
    setDraft("");
  }

  return (
    <div className="walk-up-lab-roster__new">
      <label htmlFor={NEW_RIDER_FIELD_ID}>New rider</label>
      <input
        id={NEW_RIDER_FIELD_ID}
        className="text-input"
        type="text"
        value={draft}
        placeholder="Name, then Enter"
        disabled={state.phase !== "composing" || freeLane === null}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          commit();
        }}
      />
      <Button
        disabled={state.phase !== "composing" || freeLane === null || draft.trim() === ""}
        onClick={() => {
          commit();
        }}
      >
        Add
      </Button>
    </div>
  );
}

function RosterGrid({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const freeLane = firstFreeLane(state);

  return (
    <div className="walk-up-lab-roster__grid">
      {ridersByRecency(state).map((rider) => {
        const seatedOn = BIKE_LANES.find((lane) => state.bikes[lane] === rider.id);
        const disabled =
          state.phase !== "composing" || (seatedOn === undefined && freeLane === null);
        return (
          <button
            key={rider.id}
            type="button"
            className={`walk-up-lab-roster__chip${
              seatedOn === undefined ? "" : ` walk-up-lab-roster__chip--seated-${seatedOn}`
            }`}
            disabled={disabled}
            onClick={() => {
              if (seatedOn !== undefined) {
                dispatch({ type: "clear-bike", lane: seatedOn });
                return;
              }
              if (freeLane !== null) {
                dispatch({ type: "stage-rider", riderId: rider.id, lane: freeLane });
              }
            }}
          >
            <span className="walk-up-lab-roster__chip-top">
              <strong>{rider.displayName}</strong>
              {seatedOn === undefined ? null : (
                <span className="walk-up-lab-roster__chip-seat">
                  {seatedOn === "left" ? "L" : "R"}
                </span>
              )}
            </span>
            <span className="walk-up-lab-roster__chip-meta">{describeRider(rider)}</span>
            <span className="walk-up-lab-roster__chip-meta">{describeLastSeen(rider)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RosterTray({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const occupied = stagedLanes(state);

  return (
    <aside className="admin-race-tray" aria-label="Race controls">
      <div className="admin-race-tray__meta">
        <p className="eyebrow">{state.phase === "results" ? "Race Results" : "Next Race"}</p>
        <RosterTrayDetail state={state} />
      </div>
      <div className="admin-race-tray__actions">
        <div className="button-row">
          {state.phase === "results" ? (
            <Button
              onClick={() => {
                dispatch({ type: "dismiss-results", keep: [] });
              }}
            >
              Next Rider
            </Button>
          ) : (
            <>
              {canSwap(state) ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    dispatch({ type: "swap-bikes" });
                  }}
                >
                  Swap Bikes (S)
                </Button>
              ) : null}
              <Button
                variant="accent"
                disabled={!canStart(state)}
                onClick={() => {
                  dispatch({ type: "start-countdown" });
                }}
              >
                {describeStartAction(state)}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="admin-race-tray__detail walk-up-lab-roster__lineup">
        {occupied.length === 0
          ? "No rider on either bike"
          : occupied
              .map(
                (lane) =>
                  `${describeBike(lane)}: ${findRider(state, state.bikes[lane]!)?.displayName ?? "—"}`
              )
              .join(" • ")}
      </p>
    </aside>
  );
}

function RosterTrayDetail({ state }: { state: WalkUpLabState }) {
  if (state.phase === "results" && state.result) {
    return (
      <div className="stack-sm">
        <strong>
          {sortResult(state.result)
            .map((entry, index) => {
              const rider = findRider(state, entry.riderId);
              return `${index === 0 ? "🏆 " : ""}${rider?.displayName ?? "Rider"} ${formatSeconds(entry.seconds)}`;
            })
            .join("  ·  ")}
        </strong>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <strong>
        {stagedLanes(state).length === 0
          ? "Nobody staged"
          : isSolo(state)
            ? "Solo run"
            : "Head-to-head"}
      </strong>
    </div>
  );
}
