import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { ToastContext } from "./toast-context";
import type { ToastOptions, ToastVariant } from "./toast-context";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

interface ToastRecord {
  id: number;
  message: string;
  variant: ToastVariant;
}

// Keep only the most recent handful so a burst of taps can't bury the screen.
const TOAST_LIMIT = 3;
// How long a toast lingers before it starts sliding away.
const TOAST_DURATION_MS = 3500;
// Must match the toast-leave animation duration in styles.css; the record is
// removed on a timer (not animationend) so dismissal is deterministic even when
// prefers-reduced-motion swaps in an opacity-only animation.
const TOAST_LEAVE_MS = 220;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(0);

  function dismissToast(id: number): void {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast({ message, variant = "success" }: ToastOptions): void {
    nextIdRef.current += 1;
    const record: ToastRecord = { id: nextIdRef.current, message, variant };
    setToasts((current) => [...current, record].slice(-TOAST_LIMIT));
  }

  return (
    <ToastContext value={showToast}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext>
  );
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  // Only mount the popover element while toasts are present. When the list
  // empties the element unmounts entirely, so an empty container can never leave
  // a stray box on screen — even if this stylesheet fails to load — and the show
  // effect below can stay mount-only rather than reacting to state.
  if (toasts.length === 0) {
    return null;
  }

  return <ToastViewportSurface toasts={toasts} onDismiss={onDismiss} />;
}

function ToastViewportSurface({
  toasts,
  onDismiss
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Promote the viewport into the browser's top layer via the Popover API. The
  // top layer lets it escape transformed / will-change ancestors (which would
  // otherwise trap position: fixed) without pulling react-dom's createPortal
  // into shared-ui — matching how ConfirmModal uses <dialog> to escape the tree.
  // A manual popover is non-modal, so the page underneath stays interactive.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof element.showPopover !== "function") {
      return;
    }
    if (!element.matches(":popover-open")) {
      element.showPopover();
    }
    return () => {
      if (element.isConnected && element.matches(":popover-open")) {
        element.hidePopover();
      }
    };
  }, []);

  return (
    <div ref={viewportRef} popover="manual" className="toast-viewport">
      <ol className="toast-viewport__list" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </ol>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);

  // Read the latest onDismiss from a ref so the removal effect below does not
  // depend on it and get re-armed every time the provider re-renders.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // Auto-dismiss: begin the exit once the racer has had time to read it. Mount-only
  // so setLeaving() cannot reset its own timer.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true);
    }, TOAST_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Drop the record once the exit animation has had time to play.
  useEffect(() => {
    if (!leaving) {
      return;
    }
    const timer = setTimeout(() => {
      onDismissRef.current(toast.id);
    }, TOAST_LEAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving, toast.id]);

  return (
    <li className="toast-viewport__item">
      <button
        type="button"
        className={cx("toast", `toast--${toast.variant}`, leaving && "toast--leaving")}
        onClick={() => {
          setLeaving(true);
        }}
      >
        {toast.message}
      </button>
    </li>
  );
}
