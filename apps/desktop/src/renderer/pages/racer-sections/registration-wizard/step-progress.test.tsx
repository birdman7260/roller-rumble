import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepProgress } from "@roller-rumble/shared-ui";

const steps = [
  { id: "contact-details", label: "Your details" },
  { id: "display-name", label: "Racer name" },
  { id: "photo", label: "Photo" }
];

describe("StepProgress", () => {
  it("lists every step in order with its label", () => {
    render(<StepProgress steps={steps} currentStepId="display-name" />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Your details"),
      expect.stringContaining("Racer name"),
      expect.stringContaining("Photo")
    ]);
  });

  it("marks only the current step as current", () => {
    render(<StepProgress steps={steps} currentStepId="display-name" />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("aria-current"))).toEqual([null, "step", null]);
  });

  it("announces the position as step X of N", () => {
    render(<StepProgress steps={steps} currentStepId="display-name" />);

    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });
});
