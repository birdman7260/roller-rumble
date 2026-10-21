import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { RacerSummary } from "@roller-rumble/shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeRacerFromUpcoming, signUpQueue, updateRacerPayment } from "../../lib/api";
import type { RacerSort } from "./racer-sort";
import { RacersTab } from "./racers-tab";

vi.mock("../../lib/api", () => ({
  addRacerAtDesk: vi.fn(),
  removeRacerFromUpcoming: vi.fn(async () => ({})),
  signUpQueue: vi.fn(async () => ({})),
  updateRacerPayment: vi.fn(async () => ({}))
}));

const speedy: RacerSummary = {
  racer: {
    id: "racer-speedy",
    displayName: "Speedy",
    realName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "555-010-0100",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z"
  },
  stats: {
    races: 4,
    wins: 3,
    eventRaces: 4,
    eventWins: 3,
    careerRaces: 9,
    careerEventCount: 2,
    bestFinishTimeMs: 28_430,
    topSpeedKph: 52.36,
    averageSpeedKph: 41.2,
    maxWattage: 812
  },
  payment: { status: "unpaid" }
};

function racer(
  displayName: string,
  stats: Partial<RacerSummary["stats"]>,
  realName: string | null = null
): RacerSummary {
  return {
    ...speedy,
    racer: { ...speedy.racer, id: `racer-${displayName}`, displayName, realName },
    stats: { ...speedy.stats, ...stats }
  };
}

function StatefulRacersTab({
  racers,
  paymentRequiredForQueue = false
}: {
  racers: RacerSummary[];
  paymentRequiredForQueue?: boolean;
}) {
  const [sort, setSort] = useState<RacerSort>({ key: "displayName", direction: "asc" });
  return (
    <RacersTab
      filteredRacers={racers}
      search=""
      setSearch={vi.fn()}
      sort={sort}
      setSort={setSort}
      paymentRequiredForQueue={paymentRequiredForQueue}
    />
  );
}

function renderTab(racers: RacerSummary[] = [speedy], paymentRequiredForQueue = false) {
  return render(
    <StatefulRacersTab racers={racers} paymentRequiredForQueue={paymentRequiredForQueue} />
  );
}

function rowNames(): string[] {
  return Array.from(document.querySelectorAll(".list-row > div > strong")).map(
    (name) => name.textContent
  );
}

function racerRow(displayName: string): HTMLElement {
  const row = screen.getByText(displayName, { selector: "strong" }).closest(".list-row");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`No row for ${displayName}`);
  }
  return row;
}

describe("RacersTab", () => {
  beforeEach(() => {
    vi.mocked(signUpQueue).mockClear();
    vi.mocked(removeRacerFromUpcoming).mockClear();
    vi.mocked(updateRacerPayment).mockClear();
  });

  it("shows each racer's top speed and fastest time with just Queue and a menu button", () => {
    renderTab();
    const row = within(racerRow("Speedy"));

    expect(row.getByText(/52\.4 km\/h/)).toBeInTheDocument();
    expect(row.getByText(/28\.43s/)).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Queue" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "More for Speedy" })).toBeInTheDocument();
    expect(row.getAllByRole("button")).toHaveLength(2);
  });

  it("queues the racer for an auto head-to-head from the row", () => {
    renderTab();
    fireEvent.click(within(racerRow("Speedy")).getByRole("button", { name: "Queue" }));

    expect(signUpQueue).toHaveBeenCalledWith({
      racerId: "racer-speedy",
      requestedType: "auto-match"
    });
  });

  it("opens a details dialog with the racer's full information from the menu button", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "More for Speedy" }));
    const dialog = within(screen.getByRole("dialog", { name: "Speedy" }));

    expect(dialog.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(dialog.getByText("555-010-0100")).toBeInTheDocument();
    expect(dialog.getByText("ada@example.com")).toBeInTheDocument();
    expect(dialog.getByText("52.4 km/h")).toBeInTheDocument();
    expect(dialog.getByText("41.2 km/h")).toBeInTheDocument();
    expect(dialog.getByText("28.43s")).toBeInTheDocument();
    expect(dialog.getByText("812 W")).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers solo runs and removal from upcoming races in the details dialog", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "More for Speedy" }));
    fireEvent.click(screen.getByRole("button", { name: "Solo Run" }));

    expect(signUpQueue).toHaveBeenCalledWith({ racerId: "racer-speedy", requestedType: "solo" });

    fireEvent.click(screen.getByRole("button", { name: "More for Speedy" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from Upcoming" }));

    expect(removeRacerFromUpcoming).toHaveBeenCalledWith("racer-speedy");
  });

  it("offers entrance fee actions in the details dialog when payment is required", () => {
    renderTab([speedy], true);
    fireEvent.click(screen.getByRole("button", { name: "More for Speedy" }));
    const dialog = within(screen.getByRole("dialog", { name: "Speedy" }));
    fireEvent.click(dialog.getByRole("button", { name: "Mark Paid" }));

    expect(updateRacerPayment).toHaveBeenCalledWith("racer-speedy", { status: "paid" });
    expect(dialog.getByRole("button", { name: "Waive" })).toBeInTheDocument();
  });

  it("sorts the list by the chosen field and flips direction", () => {
    renderTab([
      racer("Bolt", { races: 2, wins: 1, bestFinishTimeMs: 31_000 }, "Zoe Quinn"),
      racer("Apex", { races: 5, wins: 0, bestFinishTimeMs: null }, "Mia Long"),
      racer("Comet", { races: 3, wins: 3, bestFinishTimeMs: 27_500 }, "Ada Byron")
    ]);

    expect(rowNames()).toEqual(["Apex", "Bolt", "Comet"]);

    const sortBy = screen.getByLabelText("Sort by");
    fireEvent.change(sortBy, { target: { value: "fastestTime" } });
    expect(rowNames()).toEqual(["Comet", "Bolt", "Apex"]);

    fireEvent.change(sortBy, { target: { value: "realName" } });
    expect(rowNames()).toEqual(["Comet", "Apex", "Bolt"]);

    fireEvent.click(screen.getByRole("button", { name: "Ascending" }));
    expect(rowNames()).toEqual(["Bolt", "Apex", "Comet"]);
    expect(screen.getByRole("button", { name: "Descending" })).toBeInTheDocument();
  });

  it("starts count sorts with the most races or wins first", () => {
    renderTab([
      racer("Bolt", { races: 2, wins: 1 }),
      racer("Apex", { races: 5, wins: 0 }),
      racer("Comet", { races: 3, wins: 3 })
    ]);
    const sortBy = screen.getByLabelText("Sort by");

    fireEvent.change(sortBy, { target: { value: "races" } });
    expect(rowNames()).toEqual(["Apex", "Comet", "Bolt"]);

    fireEvent.change(sortBy, { target: { value: "wins" } });
    expect(rowNames()).toEqual(["Comet", "Bolt", "Apex"]);
  });
});
