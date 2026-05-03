import { createFileRoute } from "@tanstack/react-router";
import { RacerPage } from "../../../pages/racer-page";

export const Route = createFileRoute("/racer/events/$eventId")({
  component: RacerEventPage
});

function RacerEventPage() {
  const { eventId } = Route.useParams();
  return <RacerPage focusEventId={eventId} />;
}
