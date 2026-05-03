import { createFileRoute } from "@tanstack/react-router";
import { RacePage } from "../pages/race-page";

export const Route = createFileRoute("/race")({
  component: RacePage
});
