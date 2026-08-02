/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * Variant B — **Two bikes.** The surface is a picture of the room: the two rollers, side by side,
 * left where the left bike is. The host seats each rider on the bike they actually chose, so the
 * binding *is* the composition gesture and the `lane swap` (ADR 0019) becomes a repair rather than a
 * routine step. Solo is simply one seat left empty — never declared.
 *
 * Its answer to "where does this live": a walk-up **tab set replaces the standard one**. The rail
 * survives, but Race Desk / Racers / Tournaments are gone, because a `walk-up event` has no queue,
 * no tournaments and no racer page.
 *
 * Its answer to back-to-back: results land in the seats. Whoever stays on is a single "Race Again"
 * per bike, so winner-stays-on is one tap and a full turnover is two.
 */

import { useState } from "react";
import { Button } from "@roller-rumble/shared-ui";
import { LabTabRail, type LabTab } from "./lab-chrome";
import {
  BIKE_LANES,
  canStart,
  countdownSecondsLeft,
  describeBike,
  describeLastSeen,
  describeRider,
  findRider,
  formatSeconds,
  isSolo,
  matchRiders,
  raceSecondsElapsed,
  ridersByRecency,
  stagedLanes,
  type BikeLane,
  type LabResultEntry,
  type WalkUpLabAction,
  type WalkUpLabState
} from "./prototype-model";

export const VARIANT_TWO_BIKES_NAME = "Two bikes";

const WALK_UP_TABS: LabTab[] = [
  {
    id: "walk-up",
    label: "Walk-Up Desk",
    description: "Seat riders on the bikes they picked and send them."
  },
  { id: "riders", label: "Riders", description: "Everyone who has ridden tonight, plus contacts." },
  { id: "settings", label: "Settings", description: "Theme, distance, projector, and diagnostics." }
];

export function VariantTwoBikes({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  return (
    <div className="admin-layout">
      <LabTabRail tabs={WALK_UP_TABS} activeTabId="walk-up" />
      <section className="admin-workspace">
        <header className="admin-workspace__header">
          <div>
            <p className="eyebrow">Admin Console</p>
            <h1>Walk-Up Desk</h1>
          </div>
          <p className="admin-workspace__description">
            Put each rider on the bike they actually got on. One bike is a solo run.
          </p>
        </header>
        <div className="admin-workspace__scroll">
          <div className="walk-up-lab-bikes">
            {BIKE_LANES.map((lane) => (
              <BikeSeat key={lane} lane={lane} state={state} dispatch={dispatch} />
            ))}
          </div>
        </div>
        <TwoBikesFooter state={state} dispatch={dispatch} />
      </section>
    </div>
  );
}

function BikeSeat({
  lane,
  state,
  dispatch
}: {
  lane: BikeLane;
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const [seating, setSeating] = useState(false);
  const riderId = state.bikes[lane];
  const rider = riderId === null ? undefined : findRider(state, riderId);
  const resultEntry = state.result?.find((entry) => entry.riderId === riderId);

  if (!rider) {
    return (
      <div className={`walk-up-lab-seat walk-up-lab-seat--${lane} walk-up-lab-seat--empty`}>
        <p className="walk-up-lab-seat__label">{describeBike(lane)}</p>
        {seating ? (
          <SeatPicker
            lane={lane}
            state={state}
            dispatch={dispatch}
            onDone={() => {
              setSeating(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="walk-up-lab-seat__add"
            disabled={state.phase !== "composing"}
            onClick={() => {
              setSeating(true);
            }}
          >
            <span aria-hidden="true">+</span>
            <span>Seat a rider</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`walk-up-lab-seat walk-up-lab-seat--${lane} walk-up-lab-seat--taken`}>
      <p className="walk-up-lab-seat__label">{describeBike(lane)}</p>
      <strong className="walk-up-lab-seat__name">{rider.displayName}</strong>
      <p className="walk-up-lab-seat__meta">
        {describeRider(rider)} · {describeLastSeen(rider)}
      </p>
      <SeatStatus state={state} entry={resultEntry} />
      <SeatActions lane={lane} state={state} dispatch={dispatch} />
    </div>
  );
}

function SeatStatus({
  state,
  entry
}: {
  state: WalkUpLabState;
  entry: LabResultEntry | undefined;
}) {
  if (state.phase === "countdown") {
    return <p className="walk-up-lab-seat__status">Countdown {countdownSecondsLeft(state)}</p>;
  }
  if (state.phase === "racing") {
    return (
      <p className="walk-up-lab-seat__status">Racing {formatSeconds(raceSecondsElapsed(state))}</p>
    );
  }
  if (state.phase === "results" && entry) {
    const fastest = state.result?.every((other) => other.seconds >= entry.seconds) ?? false;
    return (
      <p className="walk-up-lab-seat__status walk-up-lab-seat__status--result">
        {fastest ? "🏆 " : ""}
        {formatSeconds(entry.seconds)}
      </p>
    );
  }
  return null;
}

function SeatActions({
  lane,
  state,
  dispatch
}: {
  lane: BikeLane;
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  if (state.phase === "results") {
    return (
      <div className="button-row">
        <Button
          onClick={() => {
            dispatch({ type: "dismiss-results", keep: [lane] });
          }}
        >
          Race Again
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            dispatch({ type: "dismiss-results", keep: [] });
          }}
        >
          Clear Both
        </Button>
      </div>
    );
  }

  if (state.phase !== "composing") {
    return null;
  }

  return (
    <div className="button-row">
      <Button
        variant="ghost"
        onClick={() => {
          dispatch({ type: "swap-bikes" });
        }}
      >
        Move Across
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          dispatch({ type: "clear-bike", lane });
        }}
      >
        Clear
      </Button>
    </div>
  );
}

function SeatPicker({
  lane,
  state,
  dispatch,
  onDone
}: {
  lane: BikeLane;
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  const fieldId = `walk-up-lab-seat-${lane}`;
  const matches =
    draft.trim() === "" ? ridersByRecency(state).slice(0, 4) : matchRiders(state, draft);
  const staged = new Set(stagedLanes(state).map((occupied) => state.bikes[occupied]));
  const available = matches.filter((rider) => !staged.has(rider.id));

  return (
    <div className="walk-up-lab-seat__picker">
      <label htmlFor={fieldId} className="walk-up-lab-seat__picker-label">
        Name (new or returning)
      </label>
      <input
        id={fieldId}
        className="text-input"
        type="text"
        value={draft}
        placeholder="Type a name…"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || draft.trim() === "") {
            return;
          }
          event.preventDefault();
          const exact = available.at(0);
          if (exact?.displayName.toLowerCase() === draft.trim().toLowerCase()) {
            dispatch({ type: "stage-rider", riderId: exact.id, lane, typedChars: draft.length });
          } else {
            dispatch({ type: "add-rider", displayName: draft, lane, typedChars: draft.length });
          }
          onDone();
        }}
      />
      <div className="walk-up-lab-seat__matches">
        {available.map((rider) => (
          <button
            key={rider.id}
            type="button"
            className="walk-up-lab-chip"
            onClick={() => {
              dispatch({ type: "stage-rider", riderId: rider.id, lane, typedChars: draft.length });
              onDone();
            }}
          >
            <span className="walk-up-lab-chip__name">{rider.displayName}</span>
            <span className="walk-up-lab-chip__meta">{describeLastSeen(rider)}</span>
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={() => {
          onDone();
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

function TwoBikesFooter({
  state,
  dispatch
}: {
  state: WalkUpLabState;
  dispatch: (action: WalkUpLabAction) => void;
}) {
  const occupied = stagedLanes(state);

  if (state.phase === "results") {
    return (
      <div className="walk-up-lab-bikes__footer walk-up-lab-bikes__footer--results">
        <span>Race finished — keep a rider on, or clear both.</span>
      </div>
    );
  }

  return (
    <div className="walk-up-lab-bikes__footer">
      <span className="walk-up-lab-bikes__summary">
        {occupied.length === 0
          ? "Both bikes empty"
          : isSolo(state)
            ? `Solo run · ${describeBike(occupied[0])}`
            : "Head-to-head"}
      </span>
      <button
        type="button"
        className="walk-up-lab-go"
        disabled={!canStart(state)}
        onClick={() => {
          dispatch({ type: "start-countdown" });
        }}
      >
        {state.phase === "countdown"
          ? `Countdown ${countdownSecondsLeft(state)}`
          : state.phase === "racing"
            ? `Racing ${formatSeconds(raceSecondsElapsed(state))}`
            : "Start Countdown"}
      </button>
    </div>
  );
}
