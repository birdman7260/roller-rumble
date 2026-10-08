export interface FloatingMenuPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export interface FloatingMenuSizing {
  /** Space between the field and the menu. */
  gap: number;
  /** Space the menu keeps from the edge of the visible area. */
  edgeMargin: number;
  /** The tallest the menu grows before it scrolls. */
  maxHeight: number;
}

/**
 * Where a menu anchored to a field should sit, in the same coordinates as `anchor` and `viewport`
 * (client pixels). `viewport` is the visible area — on phones that is the visual viewport, which
 * shrinks while the keyboard is up.
 */
export function placeFloatingMenu({
  anchor,
  viewport,
  contentHeight,
  sizing: { gap, edgeMargin, maxHeight }
}: {
  anchor: { top: number; bottom: number; left: number; width: number };
  viewport: { top: number; height: number };
  /** The menu's natural height, before any max-height clamps it. */
  contentHeight: number;
  sizing: FloatingMenuSizing;
}): FloatingMenuPlacement {
  const spaceBelow = Math.max(0, viewport.top + viewport.height - anchor.bottom - gap - edgeMargin);
  const spaceAbove = Math.max(0, anchor.top - viewport.top - gap - edgeMargin);
  const neededHeight = Math.min(contentHeight, maxHeight);
  // Prefer dropping down; only flip when the menu won't fit below and there is more room above.
  const opensUpward = spaceBelow < neededHeight && spaceAbove > spaceBelow;

  if (opensUpward) {
    const upwardMaxHeight = Math.min(maxHeight, spaceAbove);
    return {
      top: anchor.top - gap - Math.min(contentHeight, upwardMaxHeight),
      left: anchor.left,
      width: anchor.width,
      maxHeight: upwardMaxHeight
    };
  }

  return {
    top: anchor.bottom + gap,
    left: anchor.left,
    width: anchor.width,
    maxHeight: Math.min(maxHeight, spaceBelow)
  };
}

const MENU_SIZING: FloatingMenuSizing = { gap: 6, edgeMargin: 8, maxHeight: 224 };

/**
 * Floats `menu` against `anchor` until the returned cleanup runs. Where the Popover API exists the
 * menu is promoted to the top layer as a manual popover, so no ancestor's overflow, stacking
 * context, or modal `<dialog>` can clip or cover it. `menu` must carry the `popover` attribute and
 * be a descendant of whatever owns outside-click handling, so clicks inside it still count as
 * inside.
 *
 * The menu is re-placed every frame while open: the field can move without any scroll or resize
 * event — a dialog's entrance animation, a live update adding rows above it — and a single
 * `getBoundingClientRect()` a frame is cheap next to chasing each of those causes.
 */
export function floatMenuAgainst(anchor: HTMLElement, menu: HTMLElement): () => void {
  // Same guards as the toast viewport: older Safari has no Popover API, and there the menu still
  // floats with plain position: fixed.
  const supportsPopover = typeof menu.showPopover === "function";
  if (supportsPopover && !menu.matches(":popover-open")) {
    menu.showPopover();
  }

  let lastStyle = "";
  let frame = 0;

  function reposition(): void {
    const visualViewport = window.visualViewport;
    const placement = placeFloatingMenu({
      anchor: anchor.getBoundingClientRect(),
      viewport: visualViewport
        ? { top: visualViewport.offsetTop, height: visualViewport.height }
        : { top: 0, height: window.innerHeight },
      // scrollHeight ignores any max-height already applied; add the border it leaves out.
      contentHeight: menu.scrollHeight + menu.offsetHeight - menu.clientHeight,
      sizing: MENU_SIZING
    });

    // Only touch the style when something moved, so an idle open menu causes no style work.
    const nextStyle = `${placement.top},${placement.left},${placement.width},${placement.maxHeight}`;
    if (nextStyle !== lastStyle) {
      lastStyle = nextStyle;
      menu.style.top = `${placement.top}px`;
      menu.style.left = `${placement.left}px`;
      menu.style.width = `${placement.width}px`;
      menu.style.maxHeight = `${placement.maxHeight}px`;
    }

    frame = requestAnimationFrame(reposition);
  }

  reposition();

  return () => {
    cancelAnimationFrame(frame);
    if (supportsPopover && menu.isConnected && menu.matches(":popover-open")) {
      menu.hidePopover();
    }
  };
}
