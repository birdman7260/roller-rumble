import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  AppSnapshot,
  QueueEntry,
  RaceRecord,
  RacerSummary,
  TournamentBundle,
  TournamentQueueEntry
} from "@roller-rumble/shared/types";
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
  raceProjection: { race: null },
  settings: {
    queueOpen: true,
    queueClosedMessage: "",
    queueMinutesPerRace: 3,
    raceDisplayLaneColorsFlipped: false
  }
} as unknown as AppSnapshot;

/** The snapshot with this race on the bikes. */
function withStagedRace(race: Partial<RaceRecord>): AppSnapshot {
  return { ...liveSnapshot, raceProjection: { race } } as unknown as AppSnapshot;
}

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

function tourneyEntry(
  position: number,
  racerIds: [string | null, string | null],
  status: TournamentQueueEntry["status"] = racerIds.includes(null) ? "waiting" : "ready"
): TournamentQueueEntry {
  return {
    matchId: `match-${String(position)}`,
    matchKind: "bracket",
    tournamentId: "tourney-1",
    position,
    roundLabel: position < 3 ? "Round 1" : "Round 2",
    racerIds,
    status,
    pinnedUpNext: false
  };
}

const tourney = {
  tournament: { id: "tourney-1", name: "Bracket Night" }
} as unknown as TournamentBundle;

const tourneyQueue = [
  tourneyEntry(1, ["ana", "ben"], "staging"),
  tourneyEntry(2, ["me", "cy"]),
  tourneyEntry(3, ["ana", null])
];

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
    tournamentQueue: [],
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

function nextRaceCard() {
  return screen.getByRole("region", { name: "Your next race" });
}

function nextRaceHeadline() {
  return nextRaceCard().querySelector(".racer-state-card strong")?.textContent;
}

/** The bike colour a name is shown in, or null when it isn't coloured. */
function bikeColorOf(element: HTMLElement): string | null {
  const bikeClass = [...element.classList].find((name) => name.startsWith("bike-name--"));
  return bikeClass ? bikeClass.replace("bike-name--", "") : null;
}

describe("RumbleTab", () => {
  it("shows the racer's next race above the queue while they are in it", () => {
    renderRumble({ upcoming: eightRaces });

    const card = nextRaceCard();
    expect(nextRaceHeadline()).toBe("You vs Eli");
    expect(within(card).getByText(/#3/)).toBeInTheDocument();
    expect(within(card).getByText(/In 6 minutes/)).toBeInTheDocument();
  });

  it("colours You and the opponent by the bike each will ride", () => {
    renderRumble({ upcoming: [queueEntry(1, ["me", "eli"])] });
    expect(bikeColorOf(within(nextRaceCard()).getByText("You"))).toBe("orange");
    expect(bikeColorOf(within(nextRaceCard()).getByText("Eli"))).toBe("purple");
  });

  it("puts the racer on the right bike when they are second in the lineup", () => {
    renderRumble({ upcoming: [queueEntry(1, ["eli", "me"])] });
    expect(nextRaceHeadline()).toBe("You vs Eli");
    expect(bikeColorOf(within(nextRaceCard()).getByText("You"))).toBe("purple");
    expect(bikeColorOf(within(nextRaceCard()).getByText("Eli"))).toBe("orange");
  });

  it("follows a lane swap on the race already staged", () => {
    const staged = { ...queueEntry(1, ["me", "eli"]), status: "staging" as const };
    renderRumble({
      liveSnapshot: withStagedRace({
        queueEntryId: staged.id,
        participants: [
          { racerId: "eli", lane: "left" },
          { racerId: "me", lane: "right" }
        ]
      }),
      upcoming: [staged]
    });

    expect(bikeColorOf(within(nextRaceCard()).getByText("You"))).toBe("purple");
    expect(bikeColorOf(within(queueRows()[0]).getByText("Mo"))).toBe("purple");
    expect(bikeColorOf(within(queueRows()[0]).getByText("Eli"))).toBe("orange");
  });

  it("colours a solo run by the bike the racer will ride", () => {
    renderRumble({ upcoming: [queueEntry(1, ["me"])] });
    expect(bikeColorOf(within(nextRaceCard()).getByText("Your run"))).toBe("orange");
  });

  it("colours each queued racer's name by the bike they will ride", () => {
    renderRumble({ upcoming: eightRaces });

    expect(queueRows()[0].querySelector("strong")?.textContent).toBe("#1 Ana vs Ben");
    expect(bikeColorOf(within(queueRows()[0]).getByText("Ana"))).toBe("orange");
    expect(bikeColorOf(within(queueRows()[0]).getByText("Ben"))).toBe("purple");
    expect(bikeColorOf(within(queueRows()[3]).getByText("Fay"))).toBe("orange");
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

  describe("during a tourney", () => {
    function renderTourney(overrides: Partial<Parameters<typeof RumbleTab>[0]> = {}) {
      return renderRumble({
        activeTournament: tourney,
        tournamentMode: true,
        tournamentQueue: tourneyQueue,
        upcoming: eightRaces.slice(0, 3),
        visibleTournament: tourney,
        ...overrides
      });
    }

    function tourneyRows() {
      return within(screen.getByRole("list", { name: "Tourney queue" })).getAllByRole("listitem");
    }

    it("shows the tourney queue in the bracket's order instead of the open queue", () => {
      renderTourney();

      expect(screen.queryByRole("list", { name: "Race queue" })).not.toBeInTheDocument();
      expect(tourneyRows().map((row) => row.querySelector("strong")?.textContent)).toEqual([
        "#1 Ana vs Ben",
        "Your race#2 Mo vs Cy",
        "#3 Ana vs TBD"
      ]);
      expect(within(tourneyRows()[0]).getByText("Round 1")).toBeInTheDocument();
      expect(bikeColorOf(within(tourneyRows()[2]).getByText("Ana"))).toBe("orange");
      expect(bikeColorOf(within(tourneyRows()[2]).getByText("TBD"))).toBeNull();
      expect(
        tourneyRows().map((row) => row.querySelector(".racer-queue-row__eta")?.textContent)
      ).toEqual(["NOW!", "In 3 minutes", "In 6 minutes"]);
    });

    it("highlights the racer's tourney races without offering to leave them", () => {
      renderTourney();

      expect(tourneyRows()[1]).toHaveClass("racer-queue-row--mine");
      expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
    });

    it("shows the racer's next tourney race above the queue", () => {
      renderTourney();

      const card = nextRaceCard();
      expect(nextRaceHeadline()).toBe("You vs Cy");
      expect(bikeColorOf(within(card).getByText("You"))).toBe("orange");
      expect(bikeColorOf(within(card).getByText("Cy"))).toBe("purple");
      expect(within(card).getByText(/#2/)).toBeInTheDocument();
      expect(within(card).getByText(/In 3 minutes/)).toBeInTheDocument();
    });

    it("names an undecided opponent as TBD on the next race card", () => {
      renderTourney({
        selectedRacer: racers[1],
        selectedRacerId: "ana",
        tournamentQueue: [tourneyEntry(1, ["me", "cy"]), tourneyEntry(2, [null, "ana"])]
      });

      expect(nextRaceHeadline()).toBe("You vs TBD");
      expect(bikeColorOf(within(nextRaceCard()).getByText("You"))).toBe("purple");
      expect(bikeColorOf(within(nextRaceCard()).getByText("TBD"))).toBeNull();
    });

    it("says so when the tourney has no races left to run", () => {
      renderTourney({ tournamentQueue: [] });

      expect(screen.getByText("No tourney races left")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Your next race" })).not.toBeInTheDocument();
    });
  });
});
