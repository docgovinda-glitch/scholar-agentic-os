import type { FormEvent, ReactNode } from "react";

/**
 * Shared chrome and controls for Desk's auth screens.
 *
 * Extracted rather than repeated across five screens so the accessible
 * behaviour is written once: every input gets a real <label> bound by id,
 * every error is announced, and the submit button's disabled state is derived
 * rather than hand-maintained. The legacy gate this replaces reimplemented
 * those per screen and drifted — placeholders standing in for labels in some
 * places, silent validation failures in others.
 */

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-10">
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-7">
      <p className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Scholar</p>
      {/* h1 is the screen's own title, not the wordmark — a screen reader
          user navigating by heading should land on "Create your account",
          not on the product name repeated five times. */}
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">{subtitle}</p>}
    </header>
  );
}

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus,
  required = true,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[color:var(--text-primary)]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        // Ties the hint to the input so it is read out with the field rather
        // than floating unattached below it.
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm"
      />
      {hint && (
        <p id={hintId} className="text-xs text-[color:var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Failures. role="alert" so they are announced, not merely displayed. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
    >
      {children}
    </p>
  );
}

/** Confirmations, e.g. "reset email sent". Same announcement treatment. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--state-info-subtle)] px-3 py-2 text-sm text-[color:var(--state-info)]"
    >
      {children}
    </p>
  );
}

export function SubmitButton({
  busy,
  disabled,
  children,
  busyLabel,
}: {
  busy: boolean;
  disabled: boolean;
  children: ReactNode;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-1 w-full rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
    >
      {busy ? busyLabel : children}
    </button>
  );
}

/** Navigation between auth screens. A button, not an anchor — it changes state, not location. */
export function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
    >
      {children}
    </button>
  );
}

export function AuthForm({
  onSubmit,
  children,
}: {
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {children}
    </form>
  );
}
