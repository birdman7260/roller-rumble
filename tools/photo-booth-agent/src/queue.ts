import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";

export interface QueuedBoothCapture {
  id: string;
  token: string;
  boothId: string;
  filePath: string;
  fileName: string;
  contentType: string;
  capturedAt: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface QueuedBoothCaptureRow {
  id: string;
  token: string;
  booth_id: string;
  file_path: string;
  file_name: string;
  content_type: string;
  captured_at: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

function mapQueuedCapture(row: QueuedBoothCaptureRow): QueuedBoothCapture {
  return {
    id: row.id,
    token: row.token,
    boothId: row.booth_id,
    filePath: row.file_path,
    fileName: row.file_name,
    contentType: row.content_type,
    capturedAt: row.captured_at,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at
  };
}

export class BoothQueue {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "photo-booth.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queued_captures (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        booth_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  enqueue(input: Omit<QueuedBoothCapture, "id" | "attempts" | "lastError" | "createdAt">): string {
    const id = nanoid();
    this.db
      .prepare(
        "INSERT INTO queued_captures (id, token, booth_id, file_path, file_name, content_type, captured_at, attempts, last_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)"
      )
      .run(
        id,
        input.token,
        input.boothId,
        input.filePath,
        input.fileName,
        input.contentType,
        input.capturedAt,
        new Date().toISOString()
      );

    return id;
  }

  listPending(): QueuedBoothCapture[] {
    return (
      this.db
        .prepare("SELECT * FROM queued_captures ORDER BY created_at ASC")
        .all() as QueuedBoothCaptureRow[]
    ).map(mapQueuedCapture);
  }

  markSynced(id: string): void {
    this.db.prepare("DELETE FROM queued_captures WHERE id = ?").run(id);
  }

  markFailed(id: string, errorMessage: string): void {
    this.db
      .prepare("UPDATE queued_captures SET attempts = attempts + 1, last_error = ? WHERE id = ?")
      .run(errorMessage, id);
  }

  close(): void {
    this.db.close();
  }
}
