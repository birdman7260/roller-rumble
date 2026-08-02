/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * Variant A — **Command line.** The walk-up desk is one always-focused field and nothing else. Type
 * a name and press Enter to put someone on the next free bike; press Enter on an empty field to
 * start the race; press Backspace on an empty field to take the last rider off. A returning rider
 * surfaces as a suggestion after two or three characters, so the host never retypes anyone.
 *
 * Its answer to "where does this live": the walk-up desk **replaces the admin window**. No tab rail,
 * no panels — for a `walk-up event` there is nothing else the operator does at the laptop.
 *
 * The tension it exposes on purpose: with a field permanently focused, the `lane swap` keystroke
 * (`S`, ADR 0019) can never fire — `isShortcutKeystroke` correctly refuses shortcuts while the host
 * is typing. The swap has to become a button, or the field has to give focus up.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@roller-rumble/shared-ui";
import {
  BIKE_LANES,
  canStart,
  canSwap,
  countdownSecondsLeft,
  describeBike,
  describeLastSeen,
  describeRider,
  findRider,
  firstFreeLane,
  formatSeconds,
  isSolo,
  matchRiders,
  raceSecondsElapsed,
  sortResult,
  stagedLanes,
  type BikeLane,
  type WalkUpLabAction,
  type WalkUpLabState
} from "./prototype-model";

export const VARIANT_COMMAND_LINE_NAME = "Command line";

const COMMAND_FIELD_ID = "walk-up-lab-command";

export function VariantCommandLine({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = state.phase === "composing";
  const suggestions = composing ? matchRiders(state, draft) : [];
  const freeLane = firstFreeLane(state);
  const activeSuggestion = suggestions.at(Math.min(highlight, suggestions.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, [state.phase]);

  function commitRider(riderId: string | null, lane: BikeLane): void {
    if (riderId === null) {
      dispatch({ type: "add-rider", displayName: draft, lane, typedChars: draft.length });
    } else {
      dispatch({ type: "stage-rider", riderId, lane, typedChars: draft.length });
    }
    setDraft("");
    setHighlight(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setHighlight((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setHighlight((current) => (current + suggestions.length - 1) % suggestions.length);
      return;
    }
    if (event.key === "Backspace" && draft === "") {
      const occupied = stagedLanes(state);
      if (occupied.length > 0) {
        event.preventDefault();
        dispatch({ type: "clear-bike", lane: occupied[occupied.length - 1] });
      }
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (draft.trim() === "") {
      dispatch({ type: "start-countdown" });
      return;
    }
    if (freeLane === null) {
      return;
    }
    commitRider(activeSuggestion?.id ?? null, freeLane);
  }

  return (
    <div className="walk-up-lab-cli">
      <header className="walk-up-lab-cli__header">
        <p className="eyebrow">Walk-Up Desk</p>
        <h1>First Fridays · 250 m</h1>
      </header>

      <div className="walk-up-lab-cli__console">
        <label htmlFor={COMMAND_FIELD_ID} className="walk-up-lab-cli__label">
          {composing
            ? freeLane === null
              ? "Both bikes taken — Enter to race, Backspace to take one off"
              : `Type a name, Enter puts them on the ${describeBike(freeLane).toLowerCase()}`
            : "The field is idle while a race is running"}
        </label>
        <input
          id={COMMAND_FIELD_ID}
          ref={inputRef}
          className="walk-up-lab-cli__input"
          type="text"
          value={draft}
          disabled={!composing}
          placeholder={composing && freeLane !== null ? "Name…" : ""}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {suggestions.length > 0 ? (
          <ul className="walk-up-lab-cli__suggestions">
            {suggestions.map((rider, index) => (
              <li key={rider.id}>
                <button
                  type="button"
                  className={`walk-up-lab-cli__suggestion${
                    rider.id === activeSuggestion?.id ? " walk-up-lab-cli__suggestion--active" : ""
                  }`}
                  onMouseDown={(event) => {
                    // Mouse-down rather than click so the field never loses focus to the button.
                    event.preventDefault();
                    setHighlight(index);
                    if (freeLane !== null) {
                      commitRider(rider.id, freeLane);
                    }
                  }}
                >
                  <span className="walk-up-lab-cli__suggestion-name">{rider.displayName}</span>
                  <span className="walk-up-lab-cli__suggestion-meta">
                    {describeRider(rider)} · {describeLastSeen(rider)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <CommandLineBikes state={state} />

      <footer className="walk-up-lab-cli__footer">
        <CommandLinePhase state={state} dispatch={dispatch} />
        <p className="walk-up-lab-cli__hint">
          Enter commits · empty Enter races · Backspace un-stages · the <kbd>S</kbd> swap keystroke
          cannot fire while this field holds focus.
        </p>
      </footer>
    </div>
  );
}

function CommandLineBikes({ state }: { state: WalkUpLabState }) {
  return (
    <div className="walk-up-lab-cli__bikes">
      {BIKE_LANES.map((lane) => {
        const riderId = state.bikes[lane];
        const rider = riderId === null ? undefined : findRider(state, riderId);
        return (
          <div
            key={lane}
            className={`walk-up-lab-cli__bike${rider ? " walk-up-lab-cli__bike--taken" : ""}`}
          >
            <span className="walk-up-lab-cli__bike-label">{describeBike(lane)}</span>
            <strong className="walk-up-lab-cli__bike-name">{rider?.displayName ?? "—"}</strong>
            <span className="walk-up-lab-cli__bike-meta">
              {rider ? describeRider(rider) : "empty"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CommandLinePhase({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  if (state.phase === "countdown") {
    return (
      <strong className="walk-up-lab-cli__phase">Countdown {countdownSecondsLeft(state)}</strong>
    );
  }

  if (state.phase === "racing") {
    return (
      <strong className="walk-up-lab-cli__phase">
        Racing {formatSeconds(raceSecondsElapsed(state))}
      </strong>
    );
  }

  if (state.phase === "results" && state.result) {
    return (
      <div className="walk-up-lab-cli__results">
        {sortResult(state.result).map((entry, index) => {
          const rider = findRider(state, entry.riderId);
          return (
            <span key={entry.riderId} className="walk-up-lab-cli__result">
              {index === 0 ? "🏆 " : ""}
              {rider?.displayName ?? "Rider"} {formatSeconds(entry.seconds)}
            </span>
          );
        })}
        <Button
          onClick={() => {
            dispatch({ type: "dismiss-results", keep: [] });
          }}
        >
          Next Rider
        </Button>
      </div>
    );
  }

  return (
    <div className="walk-up-lab-cli__phase-actions">
      <span className="walk-up-lab-cli__phase">
        {stagedLanes(state).length === 0
          ? "Nobody staged"
          : isSolo(state)
            ? "Solo run ready"
            : "Head-to-head ready"}
      </span>
      {canSwap(state) ? (
        <Button
          variant="ghost"
          onClick={() => {
            dispatch({ type: "swap-bikes" });
          }}
        >
          Swap Bikes
        </Button>
      ) : null}
      <Button
        variant="accent"
        disabled={!canStart(state)}
        onClick={() => {
          dispatch({ type: "start-countdown" });
        }}
      >
        Start Countdown
      </Button>
    </div>
  );
}
