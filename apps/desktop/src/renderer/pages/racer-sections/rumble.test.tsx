import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AppSnapshot, QueueEntry, RacerSummary } from "@roller-rumble/shared/types";
import { describe, expect, it, vi } from "vitest";
import { RumbleTab } from "./rumble";

const racerNames: Record<string, string> = {
  me: "Mo",
  ana: "Ana",
  ben: "Ben",
  cy: "Cy",
  dee: "Dee",
  eli: "Eli",
  fay: "Fay",
  gus: "Gus",
  hal: "Hal"
};

const racers = Object.entries(racerNames).map(([id, displayName]) => ({
  racer: { id, displayName, avatarUrl: null }
})) as unknown as RacerSummary[];

const liveSnapshot = {
  racers,
  settings: { queueOpen: true, queueClosedMessage: "", queueMinutesPerRace: 3 }
} as unknown as AppSnapshot;

function queueEntry(position: number, racerIds: string[]): QueueEntry {
  return {
    id: `entry-${String(position)}`,
    eventId: "event-1",
    type: racerIds.length > 1 ? "match" : "solo",
    requestedType: racerIds.length > 1 ? "auto-match" : "solo",
    lockType: "flex",
    position,
    racerIds,
    occurrenceIds: [],
    priorityScore: 0,
    status: "queued",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z"
  };
}

function renderRumble(overrides: Partial<Parameters<typeof RumbleTab>[0]> = {}) {
  const props: Parameters<typeof RumbleTab>[0] = {
    activeTournament: null,
    canBrowsePublicRacerInfo: true,
    currentRaceNames: null,
    liveSnapshot,
    onRequestLeaveEntry: vi.fn(),
    onRequestLeaveQueue: vi.fn(),
    onTabChange: vi.fn(),
    onTournamentOptOut: vi.fn(async () => undefined),
    paymentReturnState: null,
    registration: null,
    selectedRacer: racers[0],
    selectedRacerCanOptOutOfVisibleTournament: false,
    selectedRacerId: "me",
    selectedRacerIsInActiveTournament: false,
    tournamentMode: false,
    tournamentOptOutBusy: false,
    tournamentOptOutMessage: null,
    tournamentRaceCards: [],
    upcoming: [],
    visibleTournament: null,
    ...overrides
  };
  render(<RumbleTab {...props} />);
  return props;
}

const eightRaces = [
  queueEntry(1, ["ana", "ben"]),
  queueEntry(2, ["cy", "dee"]),
  queueEntry(3, ["me", "eli"]),
  queueEntry(4, ["fay"]),
  queueEntry(5, ["gus", "hal"]),
  queueEntry(6, ["ana", "cy"]),
  queueEntry(7, ["ben", "dee"]),
  queueEntry(8, ["me"])
];

function queueRows() {
  return within(screen.getByRole("list", { name: "Race queue" })).getAllByRole("listitem");
}

describe("RumbleTab", () => {
  it("shows the racer's next race above the queue while they are in it", () => {
    renderRumble({ upcoming: eightRaces });

    const card = screen.getByRole("region", { name: "Your next race" });
    expect(within(card).getByText("vs Eli")).toBeInTheDocument();
    expect(within(card).getByText(/#3/)).toBeInTheDocument();
    expect(within(card).getByText(/In 6 minutes/)).toBeInTheDocument();
  });

  it("adds the time estimate to a hype line on the next race card", () => {
    renderRumble({
      upcoming: [...eightRaces.slice(0, 2), ...eightRaces.slice(3, 5), eightRaces[2]]
    });

    const card = screen.getByRole("region", { name: "Your next race" });
    expect(within(card).getByText(/Start stretching \(in 12 minutes\)/)).toBeInTheDocument();
  });

  it("estimates each queued race's start from the minutes per race", () => {
    renderRumble({ upcoming: eightRaces });
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    const etas = queueRows().map((row) => row.querySelector(".racer-queue-row__eta")?.textContent);
    expect(etas).toEqual([
      "NOW!",
      "In 3 minutes",
      "In 6 minutes",
      "In 9 minutes",
      "In 12 minutes",
      "In 15 minutes",
      "In 18 minutes",
      "In 21 minutes"
    ]);
  });

  it("leaves the next race card out when the racer isn't in the queue", () => {
    renderRumble({ upcoming: [queueEntry(1, ["ana", "ben"])] });

    expect(screen.queryByRole("region", { name: "Your next race" })).not.toBeInTheDocument();
    expect(queueRows()).toHaveLength(1);
  });

  it("lists the first six races and reveals the rest with Show more", () => {
    renderRumble({ upcoming: eightRaces });

    expect(queueRows()).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(queueRows()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(queueRows()).toHaveLength(6);
  });

  it("has no Show more button when every race already fits", () => {
    renderRumble({ upcoming: eightRaces.slice(0, 6) });

    expect(queueRows()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("highlights the races the racer is in", () => {
    renderRumble({ upcoming: eightRaces });
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    const highlighted = queueRows()
      .map((row, index) => (row.classList.contains("racer-queue-row--mine") ? index : null))
      .filter((index) => index !== null);
    expect(highlighted).toEqual([2, 7]);
    expect(within(queueRows()[2]).getByText("Your race")).toBeInTheDocument();
  });

  it("lets the racer leave one of their races from its row", () => {
    const { onRequestLeaveEntry } = renderRumble({ upcoming: eightRaces });

    fireEvent.click(within(queueRows()[2]).getByRole("button", { name: "Leave" }));

    expect(onRequestLeaveEntry).toHaveBeenCalledWith(eightRaces[2]);
  });

  it("leaves the queue and the next race card out during a tournament", () => {
    renderRumble({ tournamentMode: true, upcoming: eightRaces.slice(0, 3) });

    expect(screen.queryByRole("list", { name: "Race queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your next race" })).not.toBeInTheDocument();
  });
});
