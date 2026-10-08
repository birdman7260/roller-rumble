import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot, BracketNode, TournamentBundle } from "@roller-rumble/shared/types";
import { fetchTournamentRacerRemovalOptions } from "../../lib/api";
import { TournamentBracketBoard } from "./tournament-board";

// React Flow can't lay out in jsdom; the board only needs the bracket to report a selected match.
vi.mock("../elimination-bracket-view", () => ({
  EliminationBracketView: ({ onMatchSelect }: { onMatchSelect?: (nodeId: string) => void }) => (
    <button
      type="button"
      onClick={() => {
        onMatchSelect?.("final");
      }}
    >
      Select final
    </button>
  )
}));

vi.mock("../../lib/api", () => ({
  fetchTournamentByeFillOptions: vi.fn(),
  fetchTournamentRacerRemovalOptions: vi.fn(async () => ({
    racerId: "racer-1",
    candidates: []
  })),
  fillTournamentByeSlot: vi.fn(),
  removeRacerFromTournament: vi.fn()
}));

const now = "2026-01-01T00:00:00.000Z";

const finalNode: BracketNode = {
  id: "final",
  tournamentId: "tournament-1",
  stageId: "stage-1",
  roundNumber: 1,
  matchNumber: 1,
  slotLabel: "Final",
  racerAId: "racer-1",
  racerBId: "racer-2",
  winnerRacerId: null,
  loserToNodeId: null,
  winnerToNodeId: null,
  state: "ready",
  meta: {},
  createdAt: now,
  updatedAt: now
};

const bundle: TournamentBundle = {
  tournament: {
    id: "tournament-1",
    eventId: "event-1",
    name: "Test Tournament",
    preset: "single-elimination",
    status: "active",
    settings: {},
    createdAt: now,
    updatedAt: now
  },
  stages: [],
  bracketNodes: [finalNode],
  groupMatches: [],
  standings: [],
  seeds: []
};

const snapshot = { racers: [] } as unknown as AppSnapshot;

function renderBoard(onStageMatch = vi.fn()) {
  render(
    <TournamentBracketBoard
      snapshot={snapshot}
      bundle={bundle}
      canStageMatches
      expanded={false}
      onExpandedChange={vi.fn()}
      onStageMatch={onStageMatch}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Select final" }));
}

describe("TournamentBracketBoard match dialogs", () => {
  const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");

  beforeEach(() => {
    showModal.mockClear();
  });

  afterEach(() => {
    vi.mocked(fetchTournamentRacerRemovalOptions).mockClear();
  });

  afterAll(() => {
    showModal.mockRestore();
  });

  it("opens a match's actions as a modal over the whole app, not inside the bracket", () => {
    renderBoard();

    const dialog = screen.getByRole("dialog", { name: "racer-1 vs racer-2" });
    expect(dialog).toHaveTextContent("Final");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(showModal.mock.contexts[0]).toBe(dialog);
  });

  it("stages the match and closes the actions", () => {
    const onStageMatch = vi.fn();
    renderBoard(onStageMatch);

    fireEvent.click(screen.getByRole("button", { name: "Stage Match" }));

    expect(onStageMatch).toHaveBeenCalledWith("final");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the match actions on Escape", () => {
    renderBoard();

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the match actions when the backdrop around them is clicked", () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the match actions open when clicking inside them", () => {
    renderBoard();

    fireEvent.click(screen.getByText("Final"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("swaps the match actions for a modal removal dialog", async () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Remove racer-1" }));

    const dialog = await screen.findByRole("dialog", { name: "racer-1" });
    expect(dialog).toHaveTextContent("Remove racer");
    expect(await screen.findByRole("button", { name: "Make BYE" })).toBeInTheDocument();
    expect(showModal.mock.contexts.at(-1)).toBe(dialog);
    expect(fetchTournamentRacerRemovalOptions).toHaveBeenCalledWith("tournament-1", "racer-1");
  });
});
