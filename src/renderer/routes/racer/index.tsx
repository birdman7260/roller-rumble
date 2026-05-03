import { createFileRoute } from "@tanstack/react-router";
import { RacerPage } from "../../pages/racer-page";

export const Route = createFileRoute("/racer/")({
  component: RacerIndexPage
});

function RacerIndexPage() {
  return <RacerPage />;
}
