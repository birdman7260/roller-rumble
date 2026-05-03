import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { nowIso } from "../../shared/utils";

interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

interface MigrationRow {
  version: number;
}

const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9-]+)\.sql$/i;

function resolveMigrationsDir(): string {
  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Could not find SQLite migrations directory at ${migrationsDir}.`);
  }
  return migrationsDir;
}

function loadSqlMigrations(): SqlMigration[] {
  return fs
    .readdirSync(resolveMigrationsDir())
    .map((fileName) => {
      const match = MIGRATION_FILE_PATTERN.exec(fileName);
      if (!match) {
        return null;
      }

      const filePath = path.join(resolveMigrationsDir(), fileName);
      return {
        version: Number.parseInt(match[1], 10),
        name: match[2],
        sql: fs.readFileSync(filePath, "utf8")
      } satisfies SqlMigration;
    })
    .filter((migration): migration is SqlMigration => migration !== null)
    .sort((left, right) => left.version - right.version);
}

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    (
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
        .all() as MigrationRow[]
    ).map((row) => row.version)
  );
  const pendingMigrations = loadSqlMigrations().filter(
    (migration) => !appliedVersions.has(migration.version)
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  const applyPending = db.transaction((migrations: SqlMigration[]) => {
    for (const migration of migrations) {
      // Migrations live as first-class .sql files so SQLite tooling can format and inspect them directly.
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        nowIso()
      );
    }
  });

  applyPending(pendingMigrations);
}
