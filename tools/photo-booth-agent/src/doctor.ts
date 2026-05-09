import path from "node:path";
import { getConfig } from "./config";
import {
  GPhotoCameraAdapter,
  ManualScannerAdapter,
  SerialScannerAdapter,
  SimulatedCameraAdapter,
  SimulatedLightAdapter,
  SimulatedScannerAdapter,
  SimulatedUmbrellaAdapter,
  UmbrellaProcessAdapter,
  WledSerialLightAdapter
} from "./adapters";

const config = getConfig();
const captureDir = path.join(config.dataDir, "doctor-captures");

const scanner =
  config.scanner.mode === "serial" && config.scanner.serialPort
    ? new SerialScannerAdapter({
        serialPort: config.scanner.serialPort,
        baudRate: config.scanner.baudRate
      })
    : config.scanner.mode === "manual"
      ? new ManualScannerAdapter()
      : new SimulatedScannerAdapter();

const camera =
  config.camera.mode === "gphoto2"
    ? new GPhotoCameraAdapter({ outputDir: captureDir, gphotoPath: config.camera.gphotoPath })
    : new SimulatedCameraAdapter({
        outputDir: captureDir,
        samplePhotoPath: config.camera.simulatorPhotoPath
      });

const lights =
  config.lights.mode === "wled-serial" && config.lights.serialPort
    ? new WledSerialLightAdapter({
        serialPort: config.lights.serialPort,
        baudRate: config.lights.baudRate,
        idlePreset: config.lights.idlePreset,
        defaultSelection: config.lights.defaultSelection
      })
    : new SimulatedLightAdapter(config.lights.defaultSelection);

const umbrella =
  config.umbrella.mode === "process"
    ? new UmbrellaProcessAdapter(config.umbrella)
    : new SimulatedUmbrellaAdapter(config.umbrella.panelCount);

const result = {
  checkedAt: new Date().toISOString(),
  scanner: await scanner.diagnose(),
  camera: await camera.diagnose(),
  lights: await lights.diagnose(),
  ...(await umbrella.diagnose())
};

await umbrella.shutdown();
await scanner.stop();

console.log(JSON.stringify(result, null, 2));
