import { createFileRoute } from "@tanstack/react-router";
import { WalkUpLabPage } from "../pages/walk-up-lab/walk-up-lab-page";

/** PROTOTYPE — THROWAWAY ROUTE. Not production. See issue #36. */
export const Route = createFileRoute("/walk-up-lab")({
  validateSearch: (search): { variant?: string } => ({
    variant: typeof search.variant === "string" ? search.variant : undefined
  }),
  component: WalkUpLabRoute
});

function WalkUpLabRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <WalkUpLabPage
      variant={search.variant}
      onVariantChange={(variant) => {
        void navigate({ search: { variant }, replace: true });
      }}
    />
  );
}
