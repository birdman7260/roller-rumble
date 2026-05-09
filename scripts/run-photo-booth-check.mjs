import { runPhotoBoothPackageScript } from "./run-photo-booth-package.mjs";

const scriptName = process.argv[2];
if (!scriptName) {
  throw new Error("Provide the photo booth package script to run, such as typecheck or test.");
}

runPhotoBoothPackageScript(scriptName, process.argv.slice(3));
