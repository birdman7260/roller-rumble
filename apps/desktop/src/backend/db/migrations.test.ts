import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationVersionPattern = /^(\d+)_/;
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

describe("SQLite migrations", () => {
  it("uses each migration version only once", () => {
    const versions = fs
      .readdirSync(migrationsDir)
      .map((fileName) => migrationVersionPattern.exec(fileName)?.[1])
      .filter((version): version is string => version !== undefined);

    expect(new Set(versions).size).toBe(versions.length);
  });

  it("keeps queue occurrence changes in their own migration", () => {
    const queueOccurrenceMigration = fs.readFileSync(
      path.join(migrationsDir, "0004_queue-occurrences.sql"),
      "utf8"
    );

    expect(queueOccurrenceMigration).toContain("ADD COLUMN lock_type");
    expect(queueOccurrenceMigration).toContain("ADD COLUMN occurrence_ids_json");
    expect(queueOccurrenceMigration).toContain("ADD COLUMN priority_score");
    expect(queueOccurrenceMigration).toContain("CREATE TABLE IF NOT EXISTS queue_occurrences");
  });
});
