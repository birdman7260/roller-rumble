import { createFileRoute } from "@tanstack/react-router";
import { NotificationLabPage } from "../pages/notification-lab-page";

export const Route = createFileRoute("/notification-lab")({
  component: NotificationLabPage
});
