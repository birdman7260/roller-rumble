import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHealth, type HardwareComponentHealth } from "../types";

const execFileAsync = promisify(execFile);
const transparentPixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export interface CapturedPhoto {
  filePath: string;
  fileName: string;
  contentType: string;
  capturedAt: string;
}

export interface CameraAdapter {
  capturePhoto(sessionId: string): Promise<CapturedPhoto>;
  diagnose(): Promise<HardwareComponentHealth>;
  getHealth(): HardwareComponentHealth;
}

export class GPhotoCameraAdapter implements CameraAdapter {
  private health = createHealth("unknown", "gPhoto2 camera has not been checked yet.");

  constructor(
    private readonly options: {
      outputDir: string;
      gphotoPath: string;
    }
  ) {}

  async capturePhoto(sessionId: string): Promise<CapturedPhoto> {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    const capturedAt = new Date().toISOString();
    const fileName = `${sessionId}-${Date.now()}.jpg`;
    const filePath = path.join(this.options.outputDir, fileName);

    await execFileAsync(this.options.gphotoPath, [
      "--capture-image-and-download",
      "--filename",
      filePath,
      "--force-overwrite"
    ]);
    this.health = createHealth("online", "Captured photo through gPhoto2.");

    return {
      filePath,
      fileName,
      contentType: "image/jpeg",
      capturedAt
    };
  }

  async diagnose(): Promise<HardwareComponentHealth> {
    try {
      const { stdout } = await execFileAsync(this.options.gphotoPath, ["--auto-detect"]);
      const foundCamera = stdout
        .split("\n")
        .some((line) => line.trim() && !line.startsWith("Model") && !line.startsWith("-"));
      this.health = foundCamera
        ? createHealth("online", "gPhoto2 detected a connected camera.")
        : createHealth("offline", "gPhoto2 did not detect a connected camera.");
    } catch (error) {
      this.health = createHealth(
        "error",
        error instanceof Error ? error.message : "gPhoto2 camera diagnostic failed."
      );
    }

    return this.health;
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }
}

export class SimulatedCameraAdapter implements CameraAdapter {
  private health: HardwareComponentHealth;

  constructor(
    private readonly options: {
      outputDir: string;
      samplePhotoPath: string;
    }
  ) {
    this.health = createHealth(
      "simulated",
      `Camera simulator is waiting for ${options.samplePhotoPath}.`
    );
  }

  async capturePhoto(sessionId: string): Promise<CapturedPhoto> {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    const capturedAt = new Date().toISOString();
    const sample = await this.tryReadSamplePhoto();
    const extension = sample?.extension ?? ".png";
    const contentType = sample?.contentType ?? "image/png";
    const fileName = `${sessionId}-${Date.now()}${extension}`;
    const filePath = path.join(this.options.outputDir, fileName);

    if (sample) {
      await fs.copyFile(sample.filePath, filePath);
      this.health = createHealth(
        "simulated",
        `Copied simulated DSLR photo from ${sample.filePath}.`
      );
    } else {
      // A tiny valid PNG keeps local booth-agent testing possible without a tethered DSLR or sample.
      await fs.writeFile(filePath, Buffer.from(transparentPixelPng, "base64"));
      this.health = createHealth(
        "simulated",
        `Simulator camera sample missing at ${this.options.samplePhotoPath}; used transparent fallback.`
      );
    }

    return {
      filePath,
      fileName,
      contentType,
      capturedAt
    };
  }

  async diagnose(): Promise<HardwareComponentHealth> {
    const sample = await this.tryReadSamplePhoto();
    this.health = sample
      ? createHealth("simulated", `Simulator camera will copy ${sample.filePath}.`)
      : createHealth(
          "simulated",
          `Simulator camera sample missing at ${this.options.samplePhotoPath}; using transparent fallback.`
        );
    return this.health;
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }

  private async tryReadSamplePhoto(): Promise<{
    filePath: string;
    extension: string;
    contentType: string;
  } | null> {
    const extension = path.extname(this.options.samplePhotoPath).toLowerCase();
    const contentType = getImageContentType(extension);
    if (!contentType) {
      return null;
    }

    try {
      await fs.access(this.options.samplePhotoPath);
      return {
        filePath: this.options.samplePhotoPath,
        extension,
        contentType
      };
    } catch {
      return null;
    }
  }
}

function getImageContentType(extension: string): string | null {
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}
