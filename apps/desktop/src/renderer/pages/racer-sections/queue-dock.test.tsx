import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueDock } from "./queue-dock";

function renderDock(overrides: Partial<Parameters<typeof QueueDock>[0]> = {}) {
  const props = {
    state: "open" as const,
    allowSolo: true,
    closedMessage: "",
    onQueueSignup: vi.fn(async () => undefined),
    onOpenChallenge: vi.fn(),
    ...overrides
  };
  render(<QueueDock {...props} />);
  return props;
}

describe("QueueDock", () => {
  it("joins the head-to-head queue from Queue up", () => {
    const { onQueueSignup } = renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Queue up" }));

    expect(onQueueSignup).toHaveBeenCalledWith({ requestedType: "auto-match" });
  });

  it("queues a solo run from Solo", () => {
    const { onQueueSignup } = renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Solo" }));

    expect(onQueueSignup).toHaveBeenCalledWith({ requestedType: "solo" });
  });

  it("leaves Solo out when the event doesn't allow solo runs", () => {
    renderDock({ allowSolo: false });

    expect(screen.queryByRole("button", { name: "Solo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue up" })).toBeInTheDocument();
  });

  it("opens the challenge picker from Challenge rather than queueing straight away", () => {
    const { onOpenChallenge, onQueueSignup } = renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Challenge" }));

    expect(onOpenChallenge).toHaveBeenCalledTimes(1);
    expect(onQueueSignup).not.toHaveBeenCalled();
  });

  it("swaps the actions for the operator's message while the queue is closed", () => {
    renderDock({ state: "closed", closedMessage: "Tournament starts at 9pm" });

    expect(screen.getByText("Tournament starts at 9pm")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the built-in closed message when the operator left it blank", () => {
    renderDock({ state: "closed", closedMessage: "   " });

    expect(screen.getByText("The queue is currently closed.")).toBeInTheDocument();
  });

  it("renders nothing when hidden", () => {
    renderDock({ state: "hidden" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
