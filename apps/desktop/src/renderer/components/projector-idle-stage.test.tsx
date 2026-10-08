import { render, screen, within } from "@testing-library/react";
import type {
  AppSnapshot,
  QueueEntry,
  RacerSummary,
  TopRacersEntry
} from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { ProjectorIdleStage } from "./projector-idle-stage";

const racerNames: Record<string, string> = {
  ana: "Ana",
  ben: "Ben",
  cy: "Cy",
  dee: "Dee"
};

const racers = Object.entries(racerNames).map(([id, displayName]) => ({
  racer: { id, displayName, avatarUrl: null }
})) as unknown as RacerSummary[];

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

function makeSnapshot({
  queue = [],
  topRacers = []
}: {
  queue?: QueueEntry[];
  topRacers?: TopRacersEntry[];
}): AppSnapshot {
  return {
    activeEvent: {
      signupEyebrow: null,
      signupHeading: "Ride tonight",
      description: "Scan to sign up"
    },
    queue,
    racers,
    raceProjection: { race: null, topRacers },
    settings: {
      queueMinutesPerRace: 2,
      raceDisplayLaneColorsFlipped: false,
      targetDistanceMeters: 250
    }
  } as unknown as AppSnapshot;
}

const board: TopRacersEntry[] = [
  { racerId: "cy", raceId: "race-2", finishTimeMs: 28_430 },
  { racerId: "ana", raceId: "race-1", finishTimeMs: 61_340 }
];

describe("ProjectorIdleStage", () => {
  it("fills the stage with the signup prompt before there is anything else to show", () => {
    render(
      <ProjectorIdleStage
        view="signup-prompt"
        snapshot={makeSnapshot({})}
        qrCodeDataUrl="data:image/png;base64,qr"
      />
    );

    expect(screen.getByAltText("QR code for racer page")).toBeInTheDocument();
    expect(screen.getByText("Ride tonight")).toBeInTheDocument();
    expect(screen.getByText("Scan to sign up")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Top racers" })).not.toBeInTheDocument();
  });

  it("shows the queue in order beside the fastest racers and their best times", () => {
    render(
      <ProjectorIdleStage
        view="queue-and-top-racers"
        snapshot={makeSnapshot({
          queue: [queueEntry(1, ["ana", "ben"]), queueEntry(2, ["dee"])],
          topRacers: board
        })}
      />
    );

    const queueRows = within(screen.getByRole("list", { name: "Race queue" })).getAllByRole(
      "listitem"
    );
    expect(queueRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Ana vs Ben"),
      expect.stringContaining("Dee")
    ]);
    expect(queueRows[1]).toHaveTextContent("In 2 minutes");

    const boardRows = within(screen.getByRole("list", { name: "Top racers" })).getAllByRole(
      "listitem"
    );
    expect(boardRows).toHaveLength(2);
    expect(boardRows[0]).toHaveTextContent("1");
    expect(boardRows[0]).toHaveTextContent("Cy");
    expect(boardRows[0]).toHaveTextContent("28.4s");
    expect(boardRows[1]).toHaveTextContent("Ana");
    expect(boardRows[1]).toHaveTextContent("1:01.3");
    expect(screen.getByText("Best times · 250 m")).toBeInTheDocument();
    expect(screen.queryByAltText("QR code for racer page")).not.toBeInTheDocument();
  });

  it("puts a compact signup prompt where the queue was once it empties", () => {
    render(
      <ProjectorIdleStage
        view="signup-and-top-racers"
        snapshot={makeSnapshot({ topRacers: board })}
        qrCodeDataUrl="data:image/png;base64,qr"
      />
    );

    expect(screen.getByAltText("QR code for racer page")).toBeInTheDocument();
    expect(screen.getByText("Ride tonight")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Top racers" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Race queue" })).not.toBeInTheDocument();
  });

  it("shows a compact signup prompt beside the queue until someone posts a time", () => {
    render(
      <ProjectorIdleStage
        view="queue-and-signup"
        snapshot={makeSnapshot({ queue: [queueEntry(1, ["ana", "ben"])] })}
        qrCodeDataUrl="data:image/png;base64,qr"
      />
    );

    expect(screen.getByRole("list", { name: "Race queue" })).toBeInTheDocument();
    expect(screen.getByAltText("QR code for racer page")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Top racers" })).not.toBeInTheDocument();
  });

  it("cuts a long queue short and says how many more races are waiting", () => {
    render(
      <ProjectorIdleStage
        view="queue-and-top-racers"
        snapshot={makeSnapshot({
          queue: Array.from({ length: 8 }, (_, index) => queueEntry(index + 1, ["ana", "ben"])),
          topRacers: board
        })}
      />
    );

    expect(
      within(screen.getByRole("list", { name: "Race queue" })).getAllByRole("listitem")
    ).toHaveLength(6);
    expect(screen.getByText("+2 more races")).toBeInTheDocument();
  });
});
