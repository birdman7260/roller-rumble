import { useEffect, useRef } from "react";

/**
 * Tiles a CSS grid's children masonry-style by measuring each child and setting
 * its `grid-row-end` span. Pair with a grid that uses a small `grid-auto-rows`
 * and `grid-auto-flow: dense` (see the `.page-grid--masonry` CSS helper).
 */
export function useMasonryGrid() {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let animationFrame = 0;
    const updateLayout = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const styles = getComputedStyle(grid);
        const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
        const rowGap = Number.parseFloat(styles.rowGap) || 0;
        const rowUnit = rowHeight + rowGap;

        for (const child of Array.from(grid.children)) {
          if (!(child instanceof HTMLElement)) {
            continue;
          }

          child.style.gridRowEnd = "";
          const height = child.getBoundingClientRect().height;
          const span = Math.max(1, Math.ceil((height + rowGap) / rowUnit));
          child.style.gridRowEnd = `span ${span}`;
        }
      });
    };

    const observer = new ResizeObserver(updateLayout);
    observer.observe(grid);
    for (const child of Array.from(grid.children)) {
      observer.observe(child);
    }

    updateLayout();
    window.addEventListener("resize", updateLayout);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateLayout);
      observer.disconnect();
    };
  }, []);

  return gridRef;
}
