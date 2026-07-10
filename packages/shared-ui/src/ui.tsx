import { useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode
} from "react";

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
            setOpen(false);
            return;
          }

          if (event.key !== "Enter" || filteredOptions.length === 0) {
            return;
          }

          event.preventDefault();
          selectOption(filteredOptions[0]);
        }}
      />
      {open && !disabled ? (
        <div className="search-select__menu">
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
  const titleId = useId();

  if (!open) {
    return null;
  }

  // The dialog element only exists while open, so open it modally the moment it
  // mounts. showModal() gives focus trapping, Escape-to-close, and the backdrop
  // for free; initial focus lands on the cancel button (autoFocus below) so a
  // stray Enter can't confirm. A ref callback (rather than an effect watching a
  // prop) opens it synchronously at commit — no extra render, no late frame.
  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }}
      className="confirm-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape fires this; route it through onCancel so state stays the source
        // of truth, and swallow it while a confirm is in flight.
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
    >
      <div className="confirm-modal__card">
        {eyebrow ? <span className="confirm-modal__eyebrow">{eyebrow}</span> : null}
        <h2 id={titleId} className="confirm-modal__title">
          {title}
        </h2>
        <p className="confirm-modal__body">{body}</p>
        <div className="confirm-modal__actions">
          <Button autoFocus variant="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="accent" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
