import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChallengeModal } from "./challenge-modal";

const racers = [
  { id: "racer-me", displayName: "Turbo Tortoise" },
  { id: "racer-ava", displayName: "Ava Velocity" },
  { id: "racer-bo", displayName: "Bo Brakeless" }
];

function renderModal(overrides: Partial<Parameters<typeof ChallengeModal>[0]> = {}) {
  const props = {
    open: true,
    racers,
    selectedRacerId: "racer-me",
    onCancel: vi.fn(),
    onChallenge: vi.fn(),
    ...overrides
  };
  const view = render(<ChallengeModal {...props} />);
  return { ...props, view };
}

describe("ChallengeModal", () => {
  it("challenges the racer picked from the list", () => {
    const { onChallenge } = renderModal();

    fireEvent.focus(screen.getByRole("textbox", { name: "Opponent" }));
    fireEvent.click(screen.getByRole("button", { name: "Bo Brakeless" }));
    fireEvent.click(screen.getByRole("button", { name: "Challenge" }));

    expect(onChallenge).toHaveBeenCalledWith("racer-bo");
  });

  it("finds an opponent by typing part of their name", () => {
    const { onChallenge } = renderModal();

    const input = screen.getByRole("textbox", { name: "Opponent" });
    fireEvent.change(input, { target: { value: "ava" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Challenge" }));

    expect(onChallenge).toHaveBeenCalledWith("racer-ava");
  });

  it("never offers the racer a challenge against themselves", () => {
    renderModal();

    fireEvent.focus(screen.getByRole("textbox", { name: "Opponent" }));

    expect(screen.getByRole("button", { name: "Ava Velocity" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turbo Tortoise" })).not.toBeInTheDocument();
  });

  it("keeps Challenge disabled until an opponent is picked", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Challenge" })).toBeDisabled();
  });

  it("backs out from Cancel or Escape without challenging anyone", () => {
    const { onCancel, onChallenge } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("starts with no opponent picked each time it opens", () => {
    const { view, ...props } = renderModal();
    fireEvent.focus(screen.getByRole("textbox", { name: "Opponent" }));
    fireEvent.click(screen.getByRole("button", { name: "Bo Brakeless" }));

    view.rerender(<ChallengeModal {...props} open={false} />);
    view.rerender(<ChallengeModal {...props} open />);

    expect(screen.getByRole("textbox", { name: "Opponent" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Challenge" })).toBeDisabled();
  });

  it("renders nothing while closed", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
