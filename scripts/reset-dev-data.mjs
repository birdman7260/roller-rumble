import fs from "node:fs";
import path from "node:path";

const devRuntimeDir = path.resolve(process.argv[2] ?? ".goldsprints-dev/runtime");

fs.rmSync(devRuntimeDir, { recursive: true, force: true });

process.stdout.write(`Removed dev runtime data at ${devRuntimeDir}\n`);
