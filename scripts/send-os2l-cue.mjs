import net from "node:net";
import { parseArgs } from "node:util";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9996;
const DEFAULT_TIMEOUT_MS = 2_000;

const { values } = parseArgs({
  options: {
    action: {
      type: "string",
      default: "start"
    },
    event: {
      type: "string",
      default: "cue"
    },
    host: {
      type: "string",
      default: DEFAULT_HOST
    },
    id: {
      type: "string",
      default: "goldsprints-start"
    },
    message: {
      type: "string"
    },
    port: {
      type: "string",
      default: String(DEFAULT_PORT)
    },
    timeoutMs: {
      type: "string",
      default: String(DEFAULT_TIMEOUT_MS)
    }
  }
});

const port = Number(values.port);
const timeoutMs = Number(values.timeoutMs);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`Invalid timeoutMs: ${values.timeoutMs}`);
  process.exit(1);
}

// The backend trigger only looks for a few cue-like substrings, so the default
// JSON payload mirrors a simple start cue without requiring the full real-world
// OS2L sender format from VirtualDJ.
const payload =
  values.message ??
  JSON.stringify({
    action: values.action,
    evt: values.event,
    id: values.id,
    sentAt: new Date().toISOString(),
    source: "goldsprints-os2l-simulator"
  });

const socket = net.createConnection(
  {
    host: values.host,
    port
  },
  () => {
    socket.write(`${payload}\n`);
    socket.end();
  }
);

socket.setTimeout(timeoutMs, () => {
  console.error(
    `Timed out connecting to ${values.host}:${port}. Is the app running with OS2L enabled?`
  );
  socket.destroy();
  process.exitCode = 1;
});

socket.on("close", (hadError) => {
  if (!hadError && process.exitCode !== 1) {
    console.log(`Sent OS2L simulator cue to ${values.host}:${port}`);
    console.log(payload);
  }
});

socket.on("error", (error) => {
  console.error(`Failed to send OS2L simulator cue: ${error.message}`);
  process.exitCode = 1;
});
