# Photo Booth Agent Assets

Place the DSLR simulator sample photo here:

```text
tools/photo-booth-agent/assets/simulated-dslr-photo.jpg
```

Use a normal `.jpg` from the Sony or any photo that feels representative of the booth output. In
simulator mode, the booth agent copies that file into the temporary capture folder so fake QR tests
show a real review image.

You can override the path with:

```text
GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH=/absolute/path/to/sample.jpg
```

Umbrella panel picker images are served as kiosk public assets, not simulator capture assets. Place
those `.jpg` files in:

```text
tools/photo-booth-agent/public/umbrella-panels/
```

Then configure the count and image mapping in:

```text
tools/photo-booth-agent/src/umbrella-panels.ts
```
