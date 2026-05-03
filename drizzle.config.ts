import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(
  rootDir,
  process.env.GOLDSPRINTS_DATA_DIR ?? ".goldsprints-dev/runtime"
);

export default defineConfig({
  dialect: "sqlite",
  schema: path.join(rootDir, "src/backend/db/schema.ts"),
  out: path.join(rootDir, "src/backend/db/drizzle"),
  dbCredentials: {
    url: path.join(dataDir, "goldsprints.sqlite")
  }
});
