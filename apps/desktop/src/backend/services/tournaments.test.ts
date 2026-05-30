import { describe, expect, it } from "vitest";
import type { EventRecord, RaceResult, Racer } from "@goldsprints/shared/types";
import { TournamentService } from "./tournaments";

const event: EventRecord = {
  id: "event-1",
  name: "Bracket Night",
  includeAllRaceData: false,
  paymentAmountCents: null,
  paymentCurrency: "usd",
  paymentRequiredForQueue: false,
  active: true,
  createdAt: "x",
  updatedAt: "x"
};

const racers: Racer[] = [
  {
    id: "r1",
    displayName: "Avery",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r2",
    displayName: "Blake",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r3",
    displayName: "Casey",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r4",
    displayName: "Drew",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r5",
    displayName: "Emery",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r6",
    displayName: "Finley",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r7",
    displayName: "Gray",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r8",
    displayName: "Harper",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  { id: "r9", displayName: "Indy", avatarUrl: null, createdAt: "x", updatedAt: "x", identities: [] }
];

const results: RaceResult[] = [
  {
    id: "res-1",
    eventId: event.id,
    raceId: "race-1",
    racerId: "r1",
    lane: "solo",
    placement: 1,
    finishTimeMs: 10000,
    distanceMeters: 250,
    avgSpeedKph: 30,
    topSpeedKph: 38,
    maxWattage: 420,
    createdAt: "x"
  },
  {
    id: "res-2",
    eventId: event.id,
    raceId: "race-2",
    racerId: "r2",
    lane: "solo",
    placement: 1,
    finishTimeMs: 10300,
    distanceMeters: 250,
    avgSpeedKph: 29,
    topSpeedKph: 36,
    maxWattage: 400,
    createdAt: "x"
  }
];

describe("tournament service", () => {
  it("limits the elimination field to the chosen bracket size", () => {
    const service = new TournamentService();

    const bundle = service.createTournamentBundle({
      event,
      racers,
      results,
      name: "Top Eight",
      preset: "single-elimination",
      bracketSize: 8
    });

    expect(bundle.seeds).toHaveLength(8);
    expect(bundle.bracketNodes).toHaveLength(7);
    expect(bundle.tournament.settings).toMatchObject({
      eligibleRacerCount: 9,
      seedCount: 8,
      bracketSize: 8
    });
  });

  it("keeps larger brackets open for byes when the chosen size exceeds the field", () => {
    const service = new TournamentService();

    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 5),
      results,
      name: "Open Eight",
      preset: "single-elimination",
      bracketSize: 8
    });

    expect(bundle.seeds).toHaveLength(5);
    expect(bundle.bracketNodes).toHaveLength(7);
    expect(bundle.bracketNodes.some((node) => node.state === "bye")).toBe(true);
  });
});
