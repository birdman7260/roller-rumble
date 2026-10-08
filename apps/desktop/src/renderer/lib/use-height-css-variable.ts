import { useLayoutEffect, useRef } from "react";

/**
 * Publishes an element's rendered height as a CSS custom property on the document root, kept in
 * step with every resize, so page layout can make room for chrome whose height is only known at
 * runtime (it wraps, gains or loses a row). The property is removed on unmount, so CSS fallbacks
 * take over whenever the element is not on screen.
 *
 * Call it from the component that renders the measured element, so the measurement lives exactly
 * as long as the element does.
 */
export function useHeightCssVariable<T extends HTMLElement>(name: string) {
  const elementRef = useRef<T | null>(null);

  // A layout effect, so the first paint already makes room for the element.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }

    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(name, `${element.getBoundingClientRect().height}px`);
    };

    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    // Border box, to match the getBoundingClientRect height being published.
    observer?.observe(element, { box: "border-box" });

    return () => {
      observer?.disconnect();
      root.style.removeProperty(name);
    };
  }, [name]);

  return elementRef;
}
