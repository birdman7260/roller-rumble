import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode
} from "react";
import { floatMenuAgainst } from "./floating-menu";

// Keep these primitives dependency-light so both the Electron renderer and the isolated booth kiosk
// package can import them without dragging either runtime into the other.
function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({
  title,
  actions,
  className,
  children,
  collapsible = false,
  defaultCollapsed = false,
  ...props
}: PropsWithChildren<{
  title?: string;
  actions?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}> &
  HTMLAttributes<HTMLElement>) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const isCollapsible = collapsible && title != null;

  return (
    <section
      {...props}
      className={cx(
        "panel",
        isCollapsible && "panel--collapsible",
        collapsed && "panel--collapsed",
        className
      )}
    >
      {(title != null || actions != null) && (
        <header className="panel__header">
          <div>
            {title ? (
              isCollapsible ? (
                <button
                  type="button"
                  className="panel__toggle"
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  <span className="panel__toggle-icon" aria-hidden="true">
                    {collapsed ? "▸" : "▾"}
                  </span>
                  <h2 className="panel__title">{title}</h2>
                </button>
              ) : (
                <h2 className="panel__title">{title}</h2>
              )
            ) : null}
          </div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      )}
      {collapsed ? null : children}
    </section>
  );
}

export function Button({
  variant = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "accent" | "ghost";
}) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "button",
        variant === "accent" && "button--accent",
        variant === "ghost" && "button--ghost",
        className
      )}
    />
  );
}

/**
 * A file picker that looks like a `Button`. The native input stays in the label (visually
 * hidden but focusable), so the label text is its accessible name and keyboard focus still works.
 */
export function FileButton({
  variant = "default",
  className,
  children,
  disabled,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  variant?: "default" | "accent" | "ghost";
  children: ReactNode;
}) {
  return (
    <label
      className={cx(
        "button",
        "file-button",
        variant === "accent" && "button--accent",
        variant === "ghost" && "button--ghost",
        disabled && "file-button--disabled",
        className
      )}
    >
      {children}
      <input {...inputProps} type="file" disabled={disabled} className="visually-hidden" />
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("text-input", className)} />;
}

export function StatPill({
  label,
  value,
  className
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("stat-pill", className)}>
      <span className="stat-pill__label">{label}</span>
      <strong className="stat-pill__value">{value}</strong>
    </div>
  );
}

export interface StepProgressStep {
  id: string;
  label: string;
}

/**
 * A multi-step flow's progress bar: every step's label in order, the current one marked with
 * `aria-current="step"`, and a "Step X of N" line for screen readers.
 */
export function StepProgress({
  steps,
  currentStepId,
  className
}: {
  steps: readonly StepProgressStep[];
  currentStepId: string;
  className?: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <div className={cx("step-progress", className)}>
      <p className="visually-hidden">
        Step {currentIndex + 1} of {steps.length}
      </p>
      <ol className="step-progress__list">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cx(
              "step-progress__step",
              index < currentIndex && "step-progress__step--done",
              index === currentIndex && "step-progress__step--current"
            )}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            <span className="step-progress__marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="step-progress__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export interface SearchableSelectOption {
  value: string;
  label: string;
}

/**
 * A text field that filters `options` as the user types and offers the matches in a menu. The menu
 * floats over everything — including modal dialogs and scrolling panels — instead of pushing the
 * content below it down.
 */
export function SearchableSelect({
  id,
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  noResultsText = "No matching options",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy
}: {
  id?: string;
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  noResultsText?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [draftText, setDraftText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The text box can temporarily drift into a search query while the parent still owns the stable
  // selected ID. When there is no active draft search, we derive the label back from props.
  const query = draftText ?? selectedOption?.label ?? "";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const menuShown = open && !disabled;

  // Layout effect so the menu is placed before the first paint rather than flashing at the
  // popover's default centred position.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const menu = menuRef.current;
    if (!menuShown || !input || !menu) {
      return;
    }

    return floatMenuAgainst(input, menu);
  }, [menuShown]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;

  function selectOption(option: SearchableSelectOption): void {
    onValueChange(option.value);
    setDraftText(null);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cx("search-select", disabled && "search-select--disabled")}>
      <input
        ref={inputRef}
        id={id}
        value={query}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="search-select__input"
        placeholder={placeholder}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setDraftText(nextQuery);
          setOpen(true);

          if (value && nextQuery !== selectedOption?.label) {
            onValueChange("");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (menuShown) {
              // Close just the menu, not a dialog the field sits in.
              event.preventDefault();
              setOpen(false);
            }
            return;
          }

          if (event.key !== "Enter" || filteredOptions.length === 0) {
            return;
          }

          event.preventDefault();
          selectOption(filteredOptions[0]);
        }}
      />
      {menuShown ? (
        <div ref={menuRef} popover="manual" className="search-select__menu">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cx(
                  "search-select__option",
                  option.value === value && "search-select__option--selected"
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  selectOption(option);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="search-select__empty">{noResultsText}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A native modal dialog: focus trapping, Escape-to-dismiss, and the backdrop come from
 * `showModal()`. The shell owns the card, eyebrow, and title; callers supply the body and actions.
 */
export function Modal({
  open,
  eyebrow,
  title,
  className,
  dismissDisabled = false,
  onDismiss,
  actions,
  children
}: {
  open: boolean;
  eyebrow?: string;
  title: string;
  className?: string;
  /** Ignore Escape, e.g. while the dialog's action is in flight. */
  dismissDisabled?: boolean;
  onDismiss: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  // The dialog element only exists while open, so open it modally the moment it
  // mounts. A ref callback (rather than an effect watching a prop) opens it
  // synchronously at commit — no extra render, no late frame. showModal() moves
  // focus to the first focusable control unless a child sets autoFocus.
  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }}
      className={cx("confirm-modal", className)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape fires this; route it through onDismiss so state stays the source
        // of truth, and swallow it while dismissing is disabled.
        event.preventDefault();
        if (!dismissDisabled) {
          onDismiss();
        }
      }}
    >
      <div className="confirm-modal__card">
        {eyebrow ? <span className="confirm-modal__eyebrow">{eyebrow}</span> : null}
        <h2 id={titleId} className="confirm-modal__title">
          {title}
        </h2>
        {children}
        <div className="confirm-modal__actions">{actions}</div>
      </div>
    </dialog>
  );
}

export function ConfirmModal({
  open,
  busy = false,
  eyebrow,
  title,
  body,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel
}: {
  open: boolean;
  busy?: boolean;
  eyebrow?: string;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Initial focus lands on the cancel button (autoFocus below) so a stray Enter can't confirm.
  return (
    <Modal
      open={open}
      eyebrow={eyebrow}
      title={title}
      dismissDisabled={busy}
      onDismiss={onCancel}
      actions={
        <>
          <Button autoFocus variant="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="accent" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-modal__body">{body}</p>
    </Modal>
  );
}
