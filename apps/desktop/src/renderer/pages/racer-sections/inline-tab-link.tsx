import type { RacerTabId } from "../racer-page";

export function InlineTabLink({
  label,
  onTabChange,
  tabId
}: {
  label: string;
  onTabChange: (tabId: RacerTabId) => void;
  tabId: RacerTabId;
}) {
  return (
    <button
      type="button"
      className="racer-inline-link"
      onClick={() => {
        onTabChange(tabId);
      }}
    >
      {label}
    </button>
  );
}
