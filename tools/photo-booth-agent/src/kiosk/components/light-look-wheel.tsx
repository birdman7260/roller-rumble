import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { LIGHT_LOOKS, type LightLookDefinition, type LightLookPreview } from "../../light-looks";
import type { LightSelection } from "../../types";
import { normalizeWheelDeltaY, WHEEL_ITEM_PITCH } from "./wheel-input";

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

const LIGHT_WHEEL_VISIBLE_RADIUS = 4;

function wrapLightLookIndex(index: number): number {
  return ((index % LIGHT_LOOKS.length) + LIGHT_LOOKS.length) % LIGHT_LOOKS.length;
}

function lookIndexForWheelPosition(position: number): number {
  return wrapLightLookIndex(Math.round(position));
}

export function LightLookWheel({
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
    const deltaPosition = normalizeWheelDeltaY(event) / WHEEL_ITEM_PITCH;
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

    // The picker must own wheel input so trackpads do not scroll the whole kiosk page.
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
          "--look-y": `${(logicalPosition - wheelPosition) * WHEEL_ITEM_PITCH}px`,
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

              const nextPosition = dragRef.current.startPosition - deltaY / WHEEL_ITEM_PITCH;
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
