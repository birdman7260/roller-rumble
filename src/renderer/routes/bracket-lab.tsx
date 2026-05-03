import { createFileRoute } from "@tanstack/react-router";
import { BracketAnimationLabPage } from "../pages/bracket-animation-lab-page";

export const Route = createFileRoute("/bracket-lab")({
  component: BracketAnimationLabPage
});
