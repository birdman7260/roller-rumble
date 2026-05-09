import { describe, expect, it } from "vitest";
import { SimulatedUmbrellaAdapter } from "./umbrella";

describe("simulated umbrella adapter", () => {
  it("homes, spins, holds a panel, and parks", async () => {
    const umbrella = new SimulatedUmbrellaAdapter(8);

    await expect(umbrella.home()).resolves.toMatchObject({ mode: "parked", currentPanel: 0 });
    await expect(umbrella.spin()).resolves.toMatchObject({ mode: "spinning" });
    await expect(umbrella.moveToPanel(3)).resolves.toMatchObject({
      mode: "holding",
      currentPanel: 3
    });
    await expect(umbrella.park()).resolves.toMatchObject({ mode: "holding", currentPanel: 0 });
  });
});
