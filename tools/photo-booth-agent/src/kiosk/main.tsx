import { StrictMode, useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_LIGHT_LOOK,
  LIGHT_LOOKS,
  type LightLookDefinition,
  type LightLookPreview
} from "../light-looks";
import type { LightSelection } from "../types";
import "./styles.css";

type HardwareStatus = "unknown" | "online" | "offline" | "simulated" | "error";

interface HardwareComponentHealth {
  status: HardwareStatus;
  message?: string | null;
  updatedAt: string;
}

interface UmbrellaState {
  mode: string;
  panelCount: number;
  currentPanel: number | null;
  message?: string | null;
}

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
}

interface DiagnosticsResult {
  checkedAt: string;
  scanner: HardwareComponentHealth;
  camera: HardwareComponentHealth;
  lights: HardwareComponentHealth;
  umbrella: HardwareComponentHealth;
  hallSensor: HardwareComponentHealth;
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
  hardware: {}
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

function HardwareBadge({ label, health }: { label: string; health?: HardwareComponentHealth }) {
  return (
    <span className={`hardware-badge hardware-badge--${health?.status ?? "unknown"}`}>
      {label}: {health?.status ?? "unknown"}
    </span>
  );
}

type LightLookStyle = CSSProperties & Record<string, string>;

function lightLookStyle(preview: LightLookPreview): LightLookStyle {
  return {
    "--look-color-1": preview.colors[0],
    "--look-color-2": preview.colors[1] ?? preview.colors[0],
    "--look-gradient": preview.colors.join(", ")
  };
}

function lightLookPreviewClass(look: LightLookDefinition): string {
  return `light-look-preview light-look-preview--${look.preview.type}`;
}

const LIGHT_WHEEL_ITEM_PITCH = 94;
const LIGHT_WHEEL_VISIBLE_RADIUS = 4;

function wrapLightLookIndex(index: number): number {
  return ((index % LIGHT_LOOKS.length) + LIGHT_LOOKS.length) % LIGHT_LOOKS.length;
}

function lookIndexForWheelPosition(position: number): number {
  return wrapLightLookIndex(Math.round(position));
}

function normalizeWheelDeltaY(event: WheelEvent): number {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * LIGHT_WHEEL_ITEM_PITCH * 3;
  }

  return event.deltaY;
}

function LightLookWheel({
  selection,
  disabled,
  onChange
}: {
  selection: LightSelection;
  disabled: boolean;
  onChange: (lookId: string) => void;
}) {
  const suppressClickRef = useRef(false);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const wheelElementRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number | null;
    startY: number;
    startPosition: number;
    currentPosition: number;
    moved: boolean;
  }>({
    pointerId: null,
    startY: 0,
    startPosition: 0,
    currentPosition: 0,
    moved: false
  });
  const selectedIndex = Math.max(
    0,
    LIGHT_LOOKS.findIndex((look) => look.id === selection.lookId)
  );
  const [wheelPosition, setWheelPosition] = useState(selectedIndex);
  const centeredPosition = Math.round(wheelPosition);
  const centeredLook = LIGHT_LOOKS[lookIndexForWheelPosition(centeredPosition)];

  const clearWheelSettleTimer = () => {
    if (wheelSettleTimerRef.current) {
      window.clearTimeout(wheelSettleTimerRef.current);
      wheelSettleTimerRef.current = null;
    }
  };

  const selectPosition = (position: number) => {
    if (disabled) {
      return;
    }

    const nextPosition = Math.round(position);
    const nextIndex = lookIndexForWheelPosition(nextPosition);
    const look = LIGHT_LOOKS[nextIndex];
    setWheelPosition(nextPosition);
    if (look.id !== selection.lookId) {
      onChange(look.id);
    }
  };

  const scheduleWheelSettle = (position: number) => {
    clearWheelSettleTimer();
    wheelSettleTimerRef.current = window.setTimeout(() => {
      selectPosition(position);
    }, 120);
  };

  const finishDrag = (pointerId: number, target: HTMLDivElement) => {
    if (dragRef.current.pointerId !== pointerId) {
      return;
    }

    const moved = dragRef.current.moved;
    const snappedPosition = Math.round(dragRef.current.currentPosition);
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    dragRef.current = {
      pointerId: null,
      startY: 0,
      startPosition: snappedPosition,
      currentPosition: snappedPosition,
      moved: false
    };

    if (moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    setIsDragging(false);
    window.requestAnimationFrame(() => selectPosition(snappedPosition));
  };

  useEffect(() => {
    return () => clearWheelSettleTimer();
  }, []);

  const handleNativeWheel = useEffectEvent((event: WheelEvent) => {
    if (disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearWheelSettleTimer();
    const deltaPosition = normalizeWheelDeltaY(event) / LIGHT_WHEEL_ITEM_PITCH;
    setWheelPosition((currentPosition) => {
      const nextPosition = currentPosition + deltaPosition;
      scheduleWheelSettle(Math.round(nextPosition));
      return nextPosition;
    });
  });

  useEffect(() => {
    const wheelElement = wheelElementRef.current;
    if (!wheelElement) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => handleNativeWheel(event);
    wheelElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => wheelElement.removeEventListener("wheel", handleWheel);
  }, []);

  const visibleLooks = Array.from(
    { length: LIGHT_WHEEL_VISIBLE_RADIUS * 2 + 1 },
    (_, slotIndex) => {
      const logicalPosition = centeredPosition + slotIndex - LIGHT_WHEEL_VISIBLE_RADIUS;
      const look = LIGHT_LOOKS[wrapLightLookIndex(logicalPosition)];
      const distanceFromCenter = Math.abs(logicalPosition - wheelPosition);
      const scale = Math.max(0.72, 1.05 - distanceFromCenter * 0.08);
      const opacity = Math.max(0.34, 1 - distanceFromCenter * 0.18);

      return {
        logicalPosition,
        look,
        isActive: logicalPosition === centeredPosition,
        style: {
          "--look-y": `${(logicalPosition - wheelPosition) * LIGHT_WHEEL_ITEM_PITCH}px`,
          "--look-scale": String(scale),
          "--look-opacity": String(opacity),
          zIndex: 100 - Math.round(distanceFromCenter * 10)
        }
      };
    }
  );

  return (
    <section className="control-card light-wheel-card" aria-label="LED look selector">
      <h2>Light Look</h2>
      <div className="light-wheel-frame">
        <div className="light-wheel-shell">
          <div
            className={
              isDragging ? "light-look-wheel light-look-wheel--dragging" : "light-look-wheel"
            }
            ref={wheelElementRef}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={`light-look-${centeredLook.id}-${centeredPosition}`}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                selectPosition(wheelPosition - 1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                selectPosition(wheelPosition + 1);
              }
            }}
            onPointerDown={(event) => {
              if (disabled) {
                return;
              }

              clearWheelSettleTimer();
              setIsDragging(true);
              dragRef.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startPosition: wheelPosition,
                currentPosition: wheelPosition,
                moved: false
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragRef.current.pointerId !== event.pointerId) {
                return;
              }

              const deltaY = event.clientY - dragRef.current.startY;
              if (Math.abs(deltaY) > 3) {
                dragRef.current.moved = true;
              }

              const nextPosition = dragRef.current.startPosition - deltaY / LIGHT_WHEEL_ITEM_PITCH;
              dragRef.current.currentPosition = nextPosition;
              setWheelPosition(nextPosition);
              if (dragRef.current.moved) {
                event.preventDefault();
              }
            }}
            onPointerUp={(event) => finishDrag(event.pointerId, event.currentTarget)}
            onPointerCancel={(event) => finishDrag(event.pointerId, event.currentTarget)}
          >
            {visibleLooks.map(({ logicalPosition, look, isActive, style }) => (
              <button
                id={`light-look-${look.id}-${logicalPosition}`}
                key={logicalPosition}
                className={isActive ? "light-look-item light-look-item--active" : "light-look-item"}
                style={style}
                type="button"
                role="option"
                aria-label={look.label}
                aria-selected={isActive}
                disabled={disabled}
                onClick={(event) => {
                  if (suppressClickRef.current) {
                    event.preventDefault();
                    return;
                  }
                  selectPosition(logicalPosition);
                }}
              >
                <span
                  className={lightLookPreviewClass(look)}
                  style={lightLookStyle(look.preview)}
                  aria-hidden="true"
                />
                <span className="sr-only">{look.label}</span>
              </button>
            ))}
          </div>
          <div className="light-wheel-selection" aria-hidden="true" />
        </div>
      </div>
      <p>Spin the wheel to pick the booth lighting.</p>
    </section>
  );
}

function UmbrellaWheel({
  umbrella,
  disabled,
  onSpin,
  onPanel
}: {
  umbrella: UmbrellaState;
  disabled: boolean;
  onSpin: () => void;
  onPanel: (panelIndex: number) => void;
}) {
  return (
    <section className="control-card">
      <h2>Umbrella Panels</h2>
      <div className="panel-wheel">
        {Array.from({ length: umbrella.panelCount }).map((_, index) => (
          <button
            key={index}
            className={
              umbrella.currentPanel === index ? "panel-button panel-button--active" : "panel-button"
            }
            disabled={disabled}
            onClick={() => onPanel(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <button className="button button--ghost" disabled={disabled} onClick={onSpin}>
        Slow Spin
      </button>
      <p>{umbrella.message ?? `Mode: ${umbrella.mode}`}</p>
    </section>
  );
}

function DiagnosticsPanel({
  diagnostics,
  hardware,
  onRun
}: {
  diagnostics: DiagnosticsResult | null;
  hardware: BoothState["hardware"];
  onRun: () => void;
}) {
  const components = diagnostics ?? hardware;
  return (
    <section className="diagnostics">
      <div className="diagnostics__header">
        <h2>Diagnostics</h2>
        <button className="button button--ghost" onClick={onRun}>
          Run Checks
        </button>
      </div>
      <div className="hardware-grid">
        {["scanner", "camera", "lights", "umbrella", "hallSensor"].map((key) => {
          const health = components[key as keyof typeof components] as
            | HardwareComponentHealth
            | undefined;
          return <HardwareBadge key={key} label={key} health={health} />;
        })}
      </div>
    </section>
  );
}

function App() {
  const [state, setState] = useState<BoothState>(defaultState);
  const [manualScan, setManualScan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);

  useEffect(() => {
    fetch("/api/state")
      .then((response) => response.json())
      .then((payload: BoothState) => setState(payload))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load booth state.")
      );

    const events = new EventSource("/api/events");
    events.onmessage = (event) => {
      setState(JSON.parse(String(event.data)) as BoothState);
    };
    events.onerror = () => setError("Lost live connection to the booth agent.");
    return () => events.close();
  }, []);

  const runAction = (action: Promise<BoothState | DiagnosticsResult>) => {
    action
      .then((payload) => {
        if ("flow" in payload) {
          setState(payload);
        } else {
          setDiagnostics(payload);
        }
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Booth action failed.")
      );
  };

  const disabled = ["capturing", "syncing"].includes(state.flow);
  const canCapture = state.flow === "photo-mode";
  const canReview = state.flow === "reviewing";

  return (
    <main className={`kiosk kiosk--${state.flow}`}>
      <section className="hero-card">
        <div>
          <p className="eyebrow">GoldSprints Kaleidoscope</p>
          <h1>{state.racerName ?? "Scan Your Racer QR"}</h1>
          <p>{error ?? state.message ?? "Show your racer QR to the mounted scanner."}</p>
        </div>
        <div className="status-row">
          <HardwareBadge label="scanner" health={state.hardware.scanner} />
          <HardwareBadge label="camera" health={state.hardware.camera} />
          <HardwareBadge label="lights" health={state.hardware.lights} />
          <HardwareBadge label="umbrella" health={state.hardware.umbrella} />
          <span className="hardware-badge">pending sync: {state.pendingUploadCount}</span>
        </div>
      </section>

      {state.flow === "idle" || state.flow === "error" ? (
        <section className="scan-card">
          <input
            value={manualScan}
            placeholder="Manual QR token, or fake:Test Rider when fake QR testing is enabled"
            onChange={(event) => setManualScan(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && manualScan.trim()) {
                runAction(post("/api/scan", { payload: manualScan }));
                setManualScan("");
              }
            }}
          />
          <button
            className="button"
            onClick={() => {
              runAction(post("/api/scan", { payload: manualScan }));
              setManualScan("");
            }}
          >
            Start Photo Mode
          </button>
        </section>
      ) : null}

      {state.flow === "photo-mode" ? (
        <section className="photo-layout">
          <LightLookWheel
            selection={state.lightSelection}
            disabled={disabled}
            onChange={(lookId) => runAction(post("/api/lights/selection", { lookId }))}
          />
          <div className="capture-card">
            <button
              className="capture-button"
              disabled={!canCapture}
              onClick={() => runAction(post("/api/capture"))}
            >
              Take Photo
            </button>
            <button className="button button--ghost" onClick={() => runAction(post("/api/cancel"))}>
              Cancel
            </button>
          </div>
          <UmbrellaWheel
            umbrella={state.umbrella}
            disabled={disabled}
            onSpin={() => runAction(post("/api/umbrella/spin"))}
            onPanel={(panelIndex) => runAction(post("/api/umbrella/panel", { panelIndex }))}
          />
        </section>
      ) : null}

      {state.flow === "capturing" ? (
        <section className="capture-countdown">
          <h2>Hold still</h2>
          <p>The umbrella is freezing and the Sony is firing.</p>
        </section>
      ) : null}

      {canReview ? (
        <section className="review-card">
          {state.previewUrl ? <img src={state.previewUrl} alt="Captured avatar preview" /> : null}
          <div className="review-actions">
            <button className="button" onClick={() => runAction(post("/api/accept"))}>
              Keep
            </button>
            <button className="button button--ghost" onClick={() => runAction(post("/api/retake"))}>
              Retry
            </button>
          </div>
        </section>
      ) : null}

      {state.flow === "syncing" ? (
        <section className="capture-countdown">
          <h2>Saving</h2>
          <p>Your avatar is being saved to the race system.</p>
        </section>
      ) : null}

      <footer>
        <button
          className="button button--ghost"
          onClick={() => setShowDiagnostics((current) => !current)}
        >
          {showDiagnostics ? "Hide Diagnostics" : "Diagnostics"}
        </button>
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
