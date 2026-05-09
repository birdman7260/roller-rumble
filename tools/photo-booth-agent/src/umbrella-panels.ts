export interface UmbrellaPanelDefinition {
  id: string;
  label: string;
  imageSrc: string;
}

// Edit this manifest when the physical umbrella panel count or panel artwork changes.
// Place the matching JPGs in tools/photo-booth-agent/public/umbrella-panels/.
export const UMBRELLA_PANELS: readonly UmbrellaPanelDefinition[] = [
  {
    id: "panel-01",
    label: "Umbrella panel 1",
    imageSrc: "/umbrella-panels/panel-01.jpg"
  },
  {
    id: "panel-02",
    label: "Umbrella panel 2",
    imageSrc: "/umbrella-panels/panel-02.jpg"
  },
  {
    id: "panel-03",
    label: "Umbrella panel 3",
    imageSrc: "/umbrella-panels/panel-03.jpg"
  },
  {
    id: "panel-04",
    label: "Umbrella panel 4",
    imageSrc: "/umbrella-panels/panel-04.jpg"
  },
  {
    id: "panel-05",
    label: "Umbrella panel 5",
    imageSrc: "/umbrella-panels/panel-05.jpg"
  },
  {
    id: "panel-06",
    label: "Umbrella panel 6",
    imageSrc: "/umbrella-panels/panel-06.jpg"
  },
  {
    id: "panel-07",
    label: "Umbrella panel 7",
    imageSrc: "/umbrella-panels/panel-07.jpg"
  },
  {
    id: "panel-08",
    label: "Umbrella panel 8",
    imageSrc: "/umbrella-panels/panel-08.jpg"
  }
];

export const UMBRELLA_PANEL_COUNT = UMBRELLA_PANELS.length;
