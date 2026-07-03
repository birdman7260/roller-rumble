import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { applyThemeToDocument } from "@roller-rumble/shared-ui/theme";
import { useSnapshotQuery, useSnapshotStream } from "../lib/query";

export function AppLayout() {
  const snapshotQuery = useSnapshotQuery();
  const selectedTheme = snapshotQuery.data?.raceProjection.theme;
  const { location } = useRouterState();
  const adminMode = location.pathname.startsWith("/admin");
  const raceMode = location.pathname.startsWith("/race");
  const racerMode = location.pathname.startsWith("/racer");
  const streamSurface = racerMode ? "racer" : raceMode ? "projector" : "admin";
  const streamConnected = useSnapshotStream(streamSurface);
  const showReconnecting = racerMode && !streamConnected;

  useEffect(() => {
    if (!selectedTheme) {
      return;
    }

    applyThemeToDocument(selectedTheme);
  }, [selectedTheme]);

  if (raceMode || adminMode) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      {showReconnecting ? (
        <output className="snapshot-stream-status" aria-live="polite">
          Reconnecting to live updates…
        </output>
      ) : null}
      <aside className="app-shell__nav">
        <div>
          <p className="eyebrow">Roller Rumble</p>
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
          <Link to="/queue-lab" activeProps={{ className: "active" }}>
            Queue Lab
          </Link>
          <Link to="/notification-lab" activeProps={{ className: "active" }}>
            Notification Lab
          </Link>
        </nav>
      </aside>
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
