import { Fragment, useState } from "react";
import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute } from "react";
import { Button, TextInput } from "@roller-rumble/shared-ui";
import { validateContactDetails } from "./registration-steps";
import type { ContactDetails } from "./registration-steps";

type ContactField = keyof ContactDetails;

const contactFields: {
  field: ContactField;
  label: string;
  type: HTMLInputTypeAttribute;
  autoComplete: HTMLInputAutoCompleteAttribute;
  placeholder: string;
}[] = [
  {
    field: "realName",
    label: "Your name",
    type: "text",
    autoComplete: "name",
    placeholder: "Alex Fast"
  },
  { field: "phone", label: "Phone", type: "tel", autoComplete: "tel", placeholder: "555-0100" },
  {
    field: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
    placeholder: "alex@example.com"
  }
];

/**
 * Step 1, "Your details": the racer's `contact details`. Only the event hosts see them; a field's
 * error shows once the racer leaves it, and Continue waits until all three are valid.
 */
export function ContactDetailsStep({
  details,
  onChange,
  onContinue
}: {
  details: ContactDetails;
  onChange: (patch: Partial<ContactDetails>) => void;
  onContinue: () => void;
}) {
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const errors = validateContactDetails(details);
  const canContinue = Object.keys(errors).length === 0;

  return (
    <form
      className="form-grid"
      noValidate
      action={() => {
        if (canContinue) {
          onContinue();
        }
      }}
    >
      <div className="racer-section-heading">
        <strong>Your details</strong>
        <p>Only the event hosts see these, so they can reach you about your races.</p>
      </div>
      {contactFields.map(({ field, label, type, autoComplete, placeholder }) => {
        const inputId = `registration-${field}`;
        const errorId = `${inputId}-error`;
        const error = touched[field] ? errors[field] : undefined;
        return (
          <Fragment key={field}>
            <label htmlFor={inputId}>
              {label}
              <TextInput
                id={inputId}
                type={type}
                autoComplete={autoComplete}
                placeholder={placeholder}
                value={details[field]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  onChange({ [field]: event.target.value });
                }}
                onBlur={() => {
                  setTouched((current) => ({ ...current, [field]: true }));
                }}
              />
            </label>
            {error ? (
              <span id={errorId} className="form-error">
                {error}
              </span>
            ) : null}
          </Fragment>
        );
      })}
      <div className="registration-step-actions">
        <Button type="submit" variant="accent" disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </form>
  );
}
