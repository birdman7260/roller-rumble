import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSnapshotQuery, useSnapshotStream } from "../lib/query";

export function AppLayout() {
  useSnapshotStream();
  const snapshotQuery = useSnapshotQuery();
  const selectedTheme = snapshotQuery.data?.raceProjection.theme;
  const { location } = useRouterState();
  const adminMode = location.pathname.startsWith("/admin");
  const raceMode = location.pathname.startsWith("/race");

  useEffect(() => {
    if (!selectedTheme) {
      return;
    }

    const root = document.documentElement;
    // Theme tokens are pushed to CSS variables once so every route stays visually in lockstep.
    root.style.setProperty("--theme-font-family", selectedTheme.fontFamily);
    root.style.setProperty("--theme-surface", selectedTheme.tokens.surface);
    root.style.setProperty("--theme-surface-alt", selectedTheme.tokens.surfaceAlt);
    root.style.setProperty("--theme-accent", selectedTheme.tokens.accent);
    root.style.setProperty("--theme-accent-soft", selectedTheme.tokens.accentSoft);
    root.style.setProperty("--theme-text", selectedTheme.tokens.text);
    root.style.setProperty("--theme-text-muted", selectedTheme.tokens.textMuted);
    root.style.setProperty("--theme-success", selectedTheme.tokens.success);
    root.style.setProperty("--theme-warning", selectedTheme.tokens.warning);
    root.style.setProperty("--theme-danger", selectedTheme.tokens.danger);
    root.style.setProperty("--theme-lane-a", selectedTheme.tokens.laneA);
    root.style.setProperty("--theme-lane-b", selectedTheme.tokens.laneB);
    root.dataset.theme = selectedTheme.id;
  }, [selectedTheme]);

  if (raceMode || adminMode) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      <aside className="app-shell__nav">
        <div>
          <p className="eyebrow">GoldSprints</p>
          <h1>Operations</h1>
        </div>
        <nav className="app-nav">
          <Link to="/admin" activeProps={{ className: "active" }}>
            Admin
          </Link>
          <Link to="/race" activeProps={{ className: "active" }}>
            Race Display
          </Link>
          <Link to="/racer" activeProps={{ className: "active" }}>
            Racer Page
          </Link>
          <Link to="/bracket-lab" activeProps={{ className: "active" }}>
            Bracket Lab
          </Link>
        </nav>
      </aside>
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
