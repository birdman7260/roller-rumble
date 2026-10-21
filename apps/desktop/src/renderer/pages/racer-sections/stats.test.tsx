import { render, screen } from "@testing-library/react";
import type { RacerSummary } from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { ExpandedRacerStats } from "./stats";

// All-time figures differ from this event's, so the tests show which ones the phone reads.
const ada: RacerSummary = {
  racer: {
    id: "racer-ada",
    displayName: "Ada",
    realName: null,
    email: null,
    phone: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z"
  },
  stats: {
    races: 9,
    wins: 7,
    eventRaces: 4,
    eventWins: 3,
    careerRaces: 9,
    careerEventCount: 2,
    bestFinishTimeMs: 25_000,
    topSpeedKph: 60,
    averageSpeedKph: 45,
    maxWattage: 900,
    eventBestFinishTimeMs: 28_430,
    eventTopSpeedKph: 52.36,
    eventAverageSpeedKph: 41.2,
    eventMaxWattage: 812
  },
  payment: { status: "paid" }
};

function statValue(label: string): string | null {
  return screen.getByText(label, { selector: "span" }).nextElementSibling?.textContent ?? null;
}

describe("ExpandedRacerStats", () => {
  it("shows the racer's figures for this event only", () => {
    render(<ExpandedRacerStats entry={ada} visibleTournament={null} />);

    expect(statValue("Wins-Losses")).toBe("3-1");
    expect(statValue("Best Finish")).toBe("28.43s");
    expect(statValue("Top Speed")).toBe("52.4 km/h");
    expect(statValue("Average Speed")).toBe("41.2 km/h");
  });

  it("explains a racer has no finish yet before their first race this event", () => {
    const newcomer: RacerSummary = {
      ...ada,
      stats: {
        ...ada.stats,
        eventRaces: 0,
        eventWins: 0,
        eventBestFinishTimeMs: null,
        eventTopSpeedKph: null,
        eventAverageSpeedKph: null,
        eventMaxWattage: null
      }
    };
    render(<ExpandedRacerStats entry={newcomer} visibleTournament={null} />);

    expect(statValue("Best Finish")).toBe("No finish yet");
    expect(statValue("Top Speed")).toBe("—");
  });
});
