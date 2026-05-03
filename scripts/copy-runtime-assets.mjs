import fs from "node:fs";
import path from "node:path";

const assetCopies = [
  {
    from: path.resolve("src/backend/db/migrations"),
    to: path.resolve("dist/electron/migrations")
  }
];

for (const assetCopy of assetCopies) {
  fs.rmSync(assetCopy.to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(assetCopy.to), { recursive: true });
  fs.cpSync(assetCopy.from, assetCopy.to, { recursive: true });
}
