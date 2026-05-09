import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BoothQueue } from "./queue";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "goldsprints-booth-queue-"));
  tempDirs.push(dir);
  return dir;
}

function createCaptureInput(index: number) {
  return {
    token: `token-${index}`,
    boothId: "booth-test",
    filePath: `/tmp/capture-${index}.jpg`,
    fileName: `capture-${index}.jpg`,
    contentType: "image/jpeg",
    capturedAt: new Date(1_700_000_000_000 + index).toISOString()
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("BoothQueue", () => {
  it("persists queued captures in SQLite pending order", () => {
    const dir = createTempDir();
    const queue = new BoothQueue(dir);

    queue.enqueue(createCaptureInput(1));
    queue.enqueue(createCaptureInput(2));
    queue.close();

    const reopened = new BoothQueue(dir);
    const pending = reopened.listPending();
    reopened.close();

    expect(fs.existsSync(path.join(dir, "photo-booth.sqlite"))).toBe(true);
    expect(pending.map((capture) => capture.token)).toEqual(["token-1", "token-2"]);
  });

  it("records sync failures and removes synced captures", () => {
    const queue = new BoothQueue(createTempDir());
    const failedId = queue.enqueue(createCaptureInput(1));
    const syncedId = queue.enqueue(createCaptureInput(2));

    queue.markFailed(failedId, "network offline");
    queue.markSynced(syncedId);
    const pending = queue.listPending();
    queue.close();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(failedId);
    expect(pending[0]?.attempts).toBe(1);
    expect(pending[0]?.lastError).toBe("network offline");
  });
});
