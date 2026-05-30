import { createFileRoute } from "@tanstack/react-router";
import { QueueLabPage } from "../pages/queue-lab-page";

export const Route = createFileRoute("/queue-lab")({
  component: QueueLabPage
});
