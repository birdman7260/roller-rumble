import { createFileRoute } from "@tanstack/react-router";
import { GlowLabPage } from "../pages/glow-lab-page";

export const Route = createFileRoute("/glow-lab")({
  component: GlowLabPage
});
