/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * A stand-in for the real `AdminTabRail`, so variants can disagree about what the tab rail holds in
 * a `walk-up event` without editing the production `adminTabs`. Only the rail is shared: each
 * variant still owns its own layout, because where the composition surface lives is one of the
 * things being judged.
 */

export interface LabTab {
  id: string;
  label: string;
  description: string;
}

export function LabTabRail({ tabs, activeTabId }: { tabs: LabTab[]; activeTabId: string }) {
  return (
    <aside className="admin-tabs">
      <p className="eyebrow">Admin Sections</p>
      <div className="admin-tabs__list" role="tablist" aria-orientation="vertical">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`admin-tab${tab.id === activeTabId ? " active" : ""}`}
            aria-selected={tab.id === activeTabId}
            // Inert on purpose: the prototype only ever renders the walk-up tab.
            disabled={tab.id !== activeTabId}
          >
            <span className="admin-tab__label">{tab.label}</span>
            <span className="admin-tab__detail">{tab.description}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
