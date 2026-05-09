import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SimulatedCameraAdapter } from "./camera";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "goldsprints-camera-"));
}

describe("simulated camera adapter", () => {
  it("copies a configured sample photo into the capture directory", async () => {
    const dir = createTempDir();
    const samplePath = path.join(dir, "sample.jpg");
    fs.writeFileSync(samplePath, "fake-jpeg-bytes");
    const camera = new SimulatedCameraAdapter({
      outputDir: path.join(dir, "captures"),
      samplePhotoPath: samplePath
    });

    const capture = await camera.capturePhoto("session");

    expect(capture.contentType).toBe("image/jpeg");
    expect(capture.fileName.endsWith(".jpg")).toBe(true);
    expect(fs.readFileSync(capture.filePath, "utf8")).toBe("fake-jpeg-bytes");
  });

  it("falls back to a valid png when the sample is missing", async () => {
    const dir = createTempDir();
    const camera = new SimulatedCameraAdapter({
      outputDir: path.join(dir, "captures"),
      samplePhotoPath: path.join(dir, "missing.jpg")
    });

    const capture = await camera.capturePhoto("session");

    expect(capture.contentType).toBe("image/png");
    expect(fs.existsSync(capture.filePath)).toBe(true);
  });
});
