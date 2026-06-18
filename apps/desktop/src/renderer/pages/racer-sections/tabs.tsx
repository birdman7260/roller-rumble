import type { RacerTabId } from "../racer-page";

export function RacerBottomTabs({
  activeTabs,
  onTabChange,
  visibleActiveTab
}: {
  activeTabs: { id: RacerTabId; label: string }[];
  onTabChange: (tabId: RacerTabId) => void;
  visibleActiveTab: RacerTabId;
}) {
  return (
    <nav className="racer-bottom-tabs" aria-label="Racer sections">
      {activeTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`racer-bottom-tab${visibleActiveTab === tab.id ? " is-active" : ""}`}
          disabled={visibleActiveTab === tab.id}
          aria-current={visibleActiveTab === tab.id ? "page" : undefined}
          onClick={() => {
            onTabChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
