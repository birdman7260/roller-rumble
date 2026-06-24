import { StrictMode, useEffect, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { Button, Panel, StatPill, TextInput } from "@roller-rumble/shared-ui";
import "@roller-rumble/shared-ui/styles.css";
import { applyThemeToDocument } from "@roller-rumble/shared-ui/theme";
import { themes } from "@roller-rumble/shared/themes";
import type { ThemeDefinition } from "@roller-rumble/shared/types";
import { DEFAULT_LIGHT_LOOK } from "../light-looks";
import type {
  DiagnosticsResult,
  HardwareComponentHealth,
  LightSelection,
  UmbrellaState
} from "../types";
import { DiagnosticsPanel, HardwareBadge } from "./components/hardware-status";
import { LightLookWheel } from "./components/light-look-wheel";
import { UmbrellaPanelPicker } from "./components/umbrella-panel-picker";
import "./styles.css";

interface BoothState {
  flow: "idle" | "token-scanned" | "photo-mode" | "capturing" | "reviewing" | "syncing" | "error";
  racerName: string | null;
  previewUrl: string | null;
  message: string | null;
  lightSelection: LightSelection;
  umbrella: UmbrellaState;
  captureCountdownEndsAt: string | null;
  pendingUploadCount: number;
  hardware: Record<string, HardwareComponentHealth>;
  theme: ThemeDefinition;
}

const defaultState: BoothState = {
  flow: "idle",
  racerName: null,
  previewUrl: null,
  message: null,
  lightSelection: { ...DEFAULT_LIGHT_LOOK.selection },
  umbrella: {
    mode: "parked",
    panelCount: 8,
    currentPanel: 0
  },
  captureCountdownEndsAt: null,
  pendingUploadCount: 0,
  hardware: {},
  theme: themes[0]
};

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "Request failed"
    );
  }
  return payload;
}

async function fetchBoothState(): Promise<BoothState> {
  const response = await fetch("/api/state");
  return (await response.json()) as BoothState;
}

interface KioskUiState {
  diagnostics: DiagnosticsResult | null;
  error: string | null;
  manualScan: string;
  showDiagnostics: boolean;
  state: BoothState;
}

const initialKioskUiState: KioskUiState = {
  diagnostics: null,
  error: null,
  manualScan: "",
  showDiagnostics: false,
  state: defaultState
};

function kioskUiReducer(state: KioskUiState, patch: Partial<KioskUiState>): KioskUiState {
  return { ...state, ...patch };
}

function App() {
  const [uiState, setUiState] = useReducer(kioskUiReducer, initialKioskUiState);
  const { diagnostics, error, manualScan, showDiagnostics, state } = uiState;

  useEffect(() => {
    fetchBoothState()
      .then((payload) => setUiState({ state: payload }))
      .catch((caught: unknown) =>
        setUiState({
          error: caught instanceof Error ? caught.message : "Could not load booth state."
        })
      );

    const events = new EventSource("/api/events");
    events.onmessage = (event) => {
      setUiState({ state: JSON.parse(String(event.data)) as BoothState });
    };
    events.onerror = () => setUiState({ error: "Lost live connection to the booth agent." });
    return () => events.close();
  }, []);

  const runAction = (action: Promise<BoothState | DiagnosticsResult>) => {
    action
      .then((payload) => {
        if ("flow" in payload) {
          setUiState({ state: payload });
        } else {
          setUiState({ diagnostics: payload });
        }
        setUiState({ error: null });
      })
      .catch((caught: unknown) =>
        setUiState({ error: caught instanceof Error ? caught.message : "Booth action failed." })
      );
  };

  const disabled = ["capturing", "syncing"].includes(state.flow);
  const canCapture = state.flow === "photo-mode";
  const canReview = state.flow === "reviewing";

  useEffect(() => {
    applyThemeToDocument(state.theme);
  }, [state.theme]);

  return (
    <main className={`kiosk kiosk--${state.flow}`}>
      <Panel className="hero-card">
        <div>
          <p className="eyebrow">Roller Rumble Kaleidoscope</p>
          <h1>{state.racerName ?? "Scan Your Racer QR"}</h1>
          <p>{error ?? state.message ?? "Show your racer QR to the mounted scanner."}</p>
        </div>
        <div className="status-row">
          <HardwareBadge label="scanner" health={state.hardware.scanner} />
          <HardwareBadge label="camera" health={state.hardware.camera} />
          <HardwareBadge label="lights" health={state.hardware.lights} />
          <HardwareBadge label="umbrella" health={state.hardware.umbrella} />
          <StatPill
            className="hardware-badge"
            label="pending sync"
            value={state.pendingUploadCount}
          />
        </div>
      </Panel>

      {state.flow === "idle" || state.flow === "error" ? (
        <Panel className="scan-card">
          <TextInput
            value={manualScan}
            placeholder="Manual QR token, or fake:Test Rider when fake QR testing is enabled"
            onChange={(event) => setUiState({ manualScan: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && manualScan.trim()) {
                runAction(post("/api/scan", { payload: manualScan }));
                setUiState({ manualScan: "" });
              }
            }}
          />
          <Button
            onClick={() => {
              runAction(post("/api/scan", { payload: manualScan }));
              setUiState({ manualScan: "" });
            }}
          >
            Start Photo Mode
          </Button>
        </Panel>
      ) : null}

      {state.flow === "photo-mode" ? (
        <section className="photo-layout">
          <LightLookWheel
            selection={state.lightSelection}
            disabled={disabled}
            onChange={(lookId) => runAction(post("/api/lights/selection", { lookId }))}
          />
          <Panel className="capture-card">
            <button
              type="button"
              className="capture-button"
              disabled={!canCapture}
              onClick={() => runAction(post("/api/capture"))}
            >
              Take Photo
            </button>
            <Button variant="ghost" onClick={() => runAction(post("/api/cancel"))}>
              Cancel
            </Button>
          </Panel>
          <UmbrellaPanelPicker
            umbrella={state.umbrella}
            disabled={disabled}
            onSpin={() => runAction(post("/api/umbrella/spin"))}
            onPanel={(panelIndex) => runAction(post("/api/umbrella/panel", { panelIndex }))}
          />
        </section>
      ) : null}

      {state.flow === "capturing" ? (
        <Panel className="capture-countdown">
          <h2>Hold still</h2>
          <p>The umbrella is freezing and the Sony is firing.</p>
        </Panel>
      ) : null}

      {canReview ? (
        <Panel className="review-card">
          {state.previewUrl ? <img src={state.previewUrl} alt="Captured avatar preview" /> : null}
          <div className="review-actions">
            <Button onClick={() => runAction(post("/api/accept"))}>Keep</Button>
            <Button variant="ghost" onClick={() => runAction(post("/api/retake"))}>
              Retry
            </Button>
          </div>
        </Panel>
      ) : null}

      {state.flow === "syncing" ? (
        <Panel className="capture-countdown">
          <h2>Saving</h2>
          <p>Your avatar is being saved to the race system.</p>
        </Panel>
      ) : null}

      <footer>
        <Button variant="ghost" onClick={() => setUiState({ showDiagnostics: !showDiagnostics })}>
          {showDiagnostics ? "Hide Diagnostics" : "Diagnostics"}
        </Button>
      </footer>

      {showDiagnostics ? (
        <DiagnosticsPanel
          diagnostics={diagnostics}
          hardware={state.hardware}
          onRun={() => runAction(post("/api/diagnostics/run"))}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
