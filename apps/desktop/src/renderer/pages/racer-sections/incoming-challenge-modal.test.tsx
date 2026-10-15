import { fireEvent, render, screen } from "@testing-library/react";
import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { describe, expect, it, vi } from "vitest";
import { IncomingChallengeModal } from "./incoming-challenge-modal";

function queueEntry(id: string, racerIds: string[], awaitingRacerId: string | null): QueueEntry {
  return {
    id,
    eventId: "event-1",
    type: "match",
    requestedType: "match",
    lockType: "challenge",
    position: 1,
    racerIds,
    occurrenceIds: [],
    priorityScore: 0,
    awaitingRacerId,
    status: "queued",
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z"
  };
}

function makeSnapshot(queue: QueueEntry[]): AppSnapshot {
  return {
    queue,
    racers: [
      { racer: { id: "racer-me", displayName: "Turbo Tortoise" } },
      { racer: { id: "racer-ava", displayName: "Ava Velocity" } }
    ]
  } as unknown as AppSnapshot;
}

describe("IncomingChallengeModal", () => {
  it("asks the challenged racer to answer and sends their choice", () => {
    const onAnswer = vi.fn(() => Promise.resolve());
    render(
      <IncomingChallengeModal
        liveSnapshot={makeSnapshot([queueEntry("entry-1", ["racer-ava", "racer-me"], "racer-me")])}
        selectedRacerId="racer-me"
        onAnswer={onAnswer}
      />
    );

    expect(screen.getByRole("dialog", { name: "Ava Velocity challenged you!" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onAnswer).toHaveBeenCalledWith("entry-1", "accept");
  });

  it("lets the challenged racer decline", () => {
    const onAnswer = vi.fn(() => Promise.resolve());
    render(
      <IncomingChallengeModal
        liveSnapshot={makeSnapshot([queueEntry("entry-1", ["racer-ava", "racer-me"], "racer-me")])}
        selectedRacerId="racer-me"
        onAnswer={onAnswer}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(onAnswer).toHaveBeenCalledWith("entry-1", "decline");
  });

  it("stays closed for the challenger, who is waiting on someone else's answer", () => {
    render(
      <IncomingChallengeModal
        liveSnapshot={makeSnapshot([queueEntry("entry-1", ["racer-me", "racer-ava"], "racer-ava")])}
        selectedRacerId="racer-me"
        onAnswer={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
