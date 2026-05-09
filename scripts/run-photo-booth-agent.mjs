import { runPhotoBoothPackageScript } from "./run-photo-booth-package.mjs";

const forwardedArgs = process.argv.slice(2);
const normalizedArgs = forwardedArgs[0] === "--" ? forwardedArgs.slice(1) : forwardedArgs;

runPhotoBoothPackageScript("agent", normalizedArgs);
