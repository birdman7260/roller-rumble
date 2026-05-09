import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { UmbrellaState } from "../../types";
import { UMBRELLA_PANELS } from "../../umbrella-panels";
import { normalizeWheelDeltaY, WHEEL_ITEM_PITCH } from "./wheel-input";

const UMBRELLA_PANEL_COMMAND_DELAY_MS = 140;

type UmbrellaWheelStyle = CSSProperties & Record<"--wheel-rotation", string>;
type UmbrellaPanelStyle = CSSProperties &
  Record<"--panel-angle" | "--panel-chord-ratio" | "--panel-hue", string>;

function wrapPanelIndex(index: number, panelCount: number): number {
  return ((index % panelCount) + panelCount) % panelCount;
}

function normalizedPointerAngle(
  event: PointerEvent | ReactPointerEvent<HTMLElement>,
  element: HTMLElement
): number {
  const rect = element.getBoundingClientRect();
  const centerX = rect.right;
  const centerY = rect.top + rect.height / 2;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX);
}

function shortestAngleDelta(currentAngle: number, startAngle: number): number {
  let delta = currentAngle - startAngle;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

export function UmbrellaPanelPicker({
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
  const panelCount = Math.max(1, UMBRELLA_PANELS.length);
  const panelAngleStep = 360 / panelCount;
  const panelChordRatio = `${Math.tan(Math.PI / panelCount) * 100}%`;
  const selectedPanel = wrapPanelIndex(umbrella.currentPanel ?? 0, panelCount);
  const wheelElementRef = useRef<HTMLDivElement | null>(null);
  const commandTimerRef = useRef<number | null>(null);
  const lastCommandedPanelRef = useRef(selectedPanel);
  const suppressPanelClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panelPosition, setPanelPosition] = useState(selectedPanel);
  const panelDragRef = useRef<{
    pointerId: number | null;
    startAngle: number;
    startPosition: number;
    currentPosition: number;
    moved: boolean;
  }>({
    pointerId: null,
    startAngle: 0,
    startPosition: selectedPanel,
    currentPosition: selectedPanel,
    moved: false
  });
  const centeredPosition = Math.round(panelPosition);
  const selectedLogicalPanel = wrapPanelIndex(centeredPosition, panelCount);
  const wheelStyle: UmbrellaWheelStyle = {
    "--wheel-rotation": `${90 - panelPosition * panelAngleStep}deg`
  };

  const clearCommandTimer = () => {
    if (commandTimerRef.current) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = null;
    }
  };

  const commandPanel = (logicalPosition: number) => {
    if (disabled) {
      return;
    }

    const panelIndex = wrapPanelIndex(Math.round(logicalPosition), panelCount);
    if (lastCommandedPanelRef.current === panelIndex) {
      return;
    }

    lastCommandedPanelRef.current = panelIndex;
    onPanel(panelIndex);
  };

  const schedulePanelSettle = (logicalPosition: number) => {
    clearCommandTimer();
    commandTimerRef.current = window.setTimeout(() => {
      selectPanelPosition(logicalPosition);
    }, UMBRELLA_PANEL_COMMAND_DELAY_MS);
  };

  const selectPanelPosition = (logicalPosition: number) => {
    const snappedPosition = Math.round(logicalPosition);
    setPanelPosition(snappedPosition);
    commandPanel(snappedPosition);
  };

  const finishPanelDrag = (pointerId: number, target: HTMLDivElement) => {
    if (panelDragRef.current.pointerId !== pointerId) {
      return;
    }

    const moved = panelDragRef.current.moved;
    const snappedPosition = Math.round(panelDragRef.current.currentPosition);
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    panelDragRef.current = {
      pointerId: null,
      startAngle: 0,
      startPosition: snappedPosition,
      currentPosition: snappedPosition,
      moved: false
    };

    if (moved) {
      suppressPanelClickRef.current = true;
      window.setTimeout(() => {
        suppressPanelClickRef.current = false;
      }, 0);
    }
    setIsDragging(false);
    window.requestAnimationFrame(() => selectPanelPosition(snappedPosition));
  };

  useEffect(() => {
    if (!isDragging && umbrella.currentPanel !== null) {
      lastCommandedPanelRef.current = selectedPanel;
    }
  }, [isDragging, selectedPanel, umbrella.currentPanel]);

  useEffect(() => {
    return () => clearCommandTimer();
  }, []);

  const handleNativePanelWheel = useEffectEvent((event: WheelEvent) => {
    if (disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearCommandTimer();
    const deltaPosition = normalizeWheelDeltaY(event) / WHEEL_ITEM_PITCH;
    setPanelPosition((currentPosition) => {
      const nextPosition = currentPosition + deltaPosition;
      commandPanel(nextPosition);
      schedulePanelSettle(Math.round(nextPosition));
      return nextPosition;
    });
  });

  useEffect(() => {
    const wheelElement = wheelElementRef.current;
    if (!wheelElement) {
      return undefined;
    }

    // The picker captures wheel input so the motor command follows the selected slice, not page scroll.
    const handleWheel = (event: WheelEvent) => handleNativePanelWheel(event);
    wheelElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => wheelElement.removeEventListener("wheel", handleWheel);
  }, []);

  const wheelPanels = UMBRELLA_PANELS.map((panel, panelIndex) => {
    const isActive = panelIndex === selectedLogicalPanel;
    const style: UmbrellaPanelStyle = {
      "--panel-angle": `${panelIndex * panelAngleStep}deg`,
      "--panel-chord-ratio": panelChordRatio,
      "--panel-hue": `${(panelIndex * 360) / panelCount}deg`
    };

    return {
      panel,
      panelIndex,
      isActive,
      style
    };
  });

  return (
    <section className="control-card umbrella-picker-card">
      <h2>Umbrella Panels</h2>
      <div
        ref={wheelElementRef}
        className={
          isDragging
            ? "umbrella-panel-picker umbrella-panel-picker--dragging"
            : "umbrella-panel-picker"
        }
        role="listbox"
        tabIndex={0}
        aria-activedescendant={`umbrella-panel-${UMBRELLA_PANELS[selectedLogicalPanel]?.id}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            selectPanelPosition(panelPosition - 1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            selectPanelPosition(panelPosition + 1);
          }
        }}
        onPointerDown={(event) => {
          if (disabled) {
            return;
          }

          clearCommandTimer();
          setIsDragging(true);
          panelDragRef.current = {
            pointerId: event.pointerId,
            startAngle: normalizedPointerAngle(event, event.currentTarget),
            startPosition: panelPosition,
            currentPosition: panelPosition,
            moved: false
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (panelDragRef.current.pointerId !== event.pointerId) {
            return;
          }

          const angleDelta = shortestAngleDelta(
            normalizedPointerAngle(event, event.currentTarget),
            panelDragRef.current.startAngle
          );
          if (Math.abs(angleDelta) > 0.015) {
            panelDragRef.current.moved = true;
          }

          const nextPosition =
            panelDragRef.current.startPosition - (angleDelta * 180) / Math.PI / panelAngleStep;
          panelDragRef.current.currentPosition = nextPosition;
          setPanelPosition(nextPosition);
          commandPanel(nextPosition);
          if (panelDragRef.current.moved) {
            event.preventDefault();
          }
        }}
        onPointerUp={(event) => finishPanelDrag(event.pointerId, event.currentTarget)}
        onPointerCancel={(event) => finishPanelDrag(event.pointerId, event.currentTarget)}
      >
        <div className="umbrella-panel-wheel" style={wheelStyle}>
          {wheelPanels.map(({ panel, panelIndex, isActive, style }) => (
            <button
              id={`umbrella-panel-${panel.id}`}
              key={panel.id}
              className={
                isActive
                  ? "umbrella-panel-slice umbrella-panel-slice--active"
                  : "umbrella-panel-slice"
              }
              style={style}
              type="button"
              role="option"
              aria-label={panel.label}
              aria-selected={isActive}
              disabled={disabled}
              onClick={(event) => {
                if (suppressPanelClickRef.current) {
                  event.preventDefault();
                  return;
                }
                selectPanelPosition(panelIndex);
              }}
            >
              <img
                className="umbrella-panel-slice__image"
                src={panel.imageSrc}
                alt=""
                aria-hidden="true"
                draggable="false"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
              <span className="sr-only">{panel.label}</span>
            </button>
          ))}
        </div>
      </div>
      <button className="button button--ghost" disabled={disabled} onClick={onSpin}>
        Slow Spin
      </button>
      <p>{umbrella.message ?? `Mode: ${umbrella.mode}`}</p>
    </section>
  );
}
