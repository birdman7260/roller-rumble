import type { Dispatch, SetStateAction } from "react";
import { adminTabs, type AdminTabId } from "./types";

export function AdminTabRail({
  activeTab,
  setActiveTab
}: {
  activeTab: AdminTabId;
  setActiveTab: Dispatch<SetStateAction<AdminTabId>>;
}) {
  return (
    <aside className="admin-tabs">
      <p className="eyebrow">Admin Sections</p>
      <div className="admin-tabs__list" role="tablist" aria-orientation="vertical">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`admin-tab${activeTab === tab.id ? " active" : ""}`}
            aria-selected={activeTab === tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
          >
            <span className="admin-tab__label">{tab.label}</span>
            <span className="admin-tab__detail">{tab.description}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
