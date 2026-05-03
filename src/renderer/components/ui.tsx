import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";

export function Panel({
  title,
  actions,
  className,
  children
}: PropsWithChildren<{
  title?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={clsx("panel", className)}>
      {(title != null || actions != null) && (
        <header className="panel__header">
          <div>{title ? <h2 className="panel__title">{title}</h2> : null}</div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-pill">
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
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  noResultsText = "No matching options"
}: {
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  noResultsText?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
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
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, options]);

  function selectOption(option: SearchableSelectOption): void {
    onValueChange(option.value);
    setDraftText(null);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={clsx("search-select", {
        "search-select--disabled": disabled
      })}
    >
      <input
        value={query}
        disabled={disabled}
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
                className={clsx("search-select__option", {
                  "search-select__option--selected": option.value === value
                })}
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
