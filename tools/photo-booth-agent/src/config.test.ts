import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "./config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("booth config", () => {
  it("enables fake QR automatically for simulator camera runs", () => {
    delete process.env.GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR;
    process.env.GOLDSPRINTS_BOOTH_CAMERA = "simulator";
    process.env.GOLDSPRINTS_BOOTH_SCANNER_MODE = "serial";
    process.env.GOLDSPRINTS_BOOTH_SCANNER_SERIAL_PORT = "/dev/serial0";

    expect(getConfig().testing.allowFakeQr).toBe(true);
  });

  it("enables fake QR automatically for manual scanner runs", () => {
    delete process.env.GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR;
    process.env.GOLDSPRINTS_BOOTH_CAMERA = "gphoto2";
    process.env.GOLDSPRINTS_BOOTH_SCANNER_MODE = "manual";

    expect(getConfig().testing.allowFakeQr).toBe(true);
  });

  it("keeps fake QR disabled by default for real camera and serial scanner runs", () => {
    delete process.env.GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR;
    process.env.GOLDSPRINTS_BOOTH_CAMERA = "gphoto2";
    process.env.GOLDSPRINTS_BOOTH_SCANNER_MODE = "serial";
    process.env.GOLDSPRINTS_BOOTH_SCANNER_SERIAL_PORT = "/dev/serial0";

    expect(getConfig().testing.allowFakeQr).toBe(false);
  });

  it("allows env override to disable fake QR even in simulator mode", () => {
    process.env.GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR = "0";
    process.env.GOLDSPRINTS_BOOTH_CAMERA = "simulator";

    expect(getConfig().testing.allowFakeQr).toBe(false);
  });

  it("resolves documented simulator photo paths from the repo root", () => {
    process.env.GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH = "tools/photo-booth-agent/package.json";

    expect(getConfig().camera.simulatorPhotoPath).toMatch(
      /tools\/photo-booth-agent\/package\.json$/
    );
  });

  it("resolves package-local simulator photo paths from the booth package", () => {
    process.env.GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH = "assets/README.md";

    expect(getConfig().camera.simulatorPhotoPath).toMatch(
      /tools\/photo-booth-agent\/assets\/README\.md$/
    );
  });

  it("uses a configured LED look as the default booth light selection", () => {
    process.env.GOLDSPRINTS_WLED_DEFAULT_LOOK = "pride";

    expect(getConfig().lights.defaultSelection).toMatchObject({
      lookId: "pride",
      label: "Pride"
    });
  });
});
