// The embedded backend owns SQLite and runs migrations at startup. If it throws — a failed
// migration, a native module that won't load, anything fatal — the app would otherwise hang with
// no window and the error buried in a console no colleague will ever see. This module turns that
// dead end into a native dialog with a data-reset escape hatch. It takes its Electron and fs
// effects as injected dependencies so the decision logic stays testable without an Electron runtime.

const DELETE_AND_RESTART_BUTTON_INDEX = 0;
const QUIT_BUTTON_INDEX = 1;

export interface StartupFailureMessageBoxOptions {
  type: "error";
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
}

export interface StartupFailureHandlerOptions {
  error: unknown;
  dataDir: string;
  showMessageBox: (options: StartupFailureMessageBoxOptions) => Promise<{ response: number }>;
  removeDataDir: (dataDir: string) => void;
  relaunchApp: () => void;
  quitApp: () => void;
}

export function describeStartupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function handleStartupFailure(options: StartupFailureHandlerOptions): Promise<void> {
  const { error, dataDir, showMessageBox, removeDataDir, relaunchApp, quitApp } = options;

  const { response } = await showMessageBox({
    type: "error",
    title: "Roller Rumble couldn't start",
    message: "The app database could not be opened. This can happen after an update.",
    detail: describeStartupError(error),
    buttons: ["Delete all data and restart", "Quit"],
    defaultId: DELETE_AND_RESTART_BUTTON_INDEX,
    cancelId: QUIT_BUTTON_INDEX
  });

  if (response === DELETE_AND_RESTART_BUTTON_INDEX) {
    // Wipe the runtime folder so the relaunched app rebuilds a clean database from scratch.
    removeDataDir(dataDir);
    relaunchApp();
    return;
  }

  quitApp();
}
