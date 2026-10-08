import { useLayoutEffect, useRef, useState } from "react";

/**
 * How many leading rows of a list fit a box `height` tall, given where each row ends. When some
 * rows must go, the ones kept also leave `footnoteSpace` for a line saying how many were left
 * out. The first row always stays, so a list never shows a footnote with nothing above it.
 */
export function countRowsThatFit({
  footnoteSpace,
  height,
  rowBottoms
}: {
  footnoteSpace: number;
  height: number;
  rowBottoms: readonly number[];
}): number {
  const lastBottom = rowBottoms.at(-1);
  if (lastBottom === undefined || lastBottom <= height) {
    return rowBottoms.length;
  }

  const limit = height - footnoteSpace;
  const fitting = rowBottoms.findIndex((bottom) => bottom > limit);
  return Math.max(1, fitting === -1 ? rowBottoms.length : fitting);
}

interface RowsFit {
  /** How many leading rows fit; the rest stay laid out but hidden, so they can be measured. */
  count: number;
  /** Where a footnote goes, just under the last row that fits, in px from the top of the box. */
  footnoteTop: number;
}

/**
 * Fits a list's rows to the box around it, for rows whose height depends on their content (a long
 * name wraps). Every row stays rendered so it can be measured; the caller hides the rows past
 * `count`. Re-measures whenever the box or the list changes size. The box must be positioned
 * (`position: relative`) so row offsets are measured from it.
 */
export function useRowsThatFit(
  rowCount: number,
  {
    footnote: footnoteMode
  }: {
    /**
     * Whether the list carries a footnote about rows left out: `when-cut` makes room for it only
     * once rows have to go, and `always` keeps room for it because rows were left out up front.
     */
    footnote: "none" | "when-cut" | "always";
  }
) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const footnoteRef = useRef<HTMLParagraphElement | null>(null);
  const [fit, setFit] = useState<RowsFit>({ count: rowCount, footnoteTop: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!box || !list || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const measure = () => {
      const rows = Array.from(list.children).filter(
        (row): row is HTMLElement => row instanceof HTMLElement
      );
      // The box is the rows' offset parent, so these are already measured from its top.
      const rowBottoms = rows.map((row) => row.offsetTop + row.offsetHeight);
      const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
      const footnote = footnoteMode === "none" ? null : footnoteRef.current;
      const footnoteSpace = footnote ? footnote.offsetHeight + gap : 0;
      const count =
        footnoteMode === "always"
          ? countRowsThatFit({
              footnoteSpace: 0,
              height: box.clientHeight - footnoteSpace,
              rowBottoms
            })
          : countRowsThatFit({ footnoteSpace, height: box.clientHeight, rowBottoms });
      const footnoteTop = count > 0 ? rowBottoms[count - 1] + gap : 0;

      setFit((current) =>
        current.count === count && current.footnoteTop === footnoteTop
          ? current
          : { count, footnoteTop }
      );
    };

    // The observer reports each target once as soon as it starts observing, which takes the first
    // measurement before the first paint.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(list);
    // A row can change height without the list doing so (one name wraps as another unwraps).
    for (const row of Array.from(list.children)) {
      observer.observe(row);
    }

    return () => {
      observer.disconnect();
    };
  }, [footnoteMode, rowCount]);

  return {
    boxRef,
    // Until the first measurement lands, and wherever layout cannot be measured, every row shows.
    count: Math.min(fit.count, rowCount),
    footnoteRef,
    footnoteTop: fit.footnoteTop,
    listRef
  };
}
