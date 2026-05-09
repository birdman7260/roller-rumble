# Umbrella Panel Images

Place one `.jpg` per physical umbrella panel in this folder:

```text
panel-01.jpg
panel-02.jpg
panel-03.jpg
panel-04.jpg
panel-05.jpg
panel-06.jpg
panel-07.jpg
panel-08.jpg
```

The kiosk panel picker reads the code manifest at:

```text
tools/photo-booth-agent/src/umbrella-panels.ts
```

If your umbrella has a different number of panels, update that manifest and add/remove matching JPGs
here. Keep `GOLDSPRINTS_UMBRELLA_PANEL_COUNT` in sync if you override it for the hardware helper.
