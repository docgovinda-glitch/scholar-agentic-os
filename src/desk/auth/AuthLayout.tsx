import { useState, type FormEvent, type ReactNode } from "react";
import type { Option } from "../../config/accountSchema";
import { COUNTRIES, type Country } from "../../config/countries";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

/**
 * Shared chrome and controls for Desk's auth screens.
 *
 * Extracted rather than repeated across five screens so the accessible
 * behaviour is written once: every input gets a real <label> bound by id,
 * every error is announced, and the submit button's disabled state is derived
 * rather than hand-maintained. The legacy gate this replaces reimplemented
 * those per screen and drifted — placeholders standing in for labels in some
 * places, silent validation failures in others.
 *
 * Also imported directly by desk/account/AccountSettingsScreen.tsx: Field,
 * SelectField, FileField and PhoneField are the one definition of each
 * control shared by Create Account and Account Settings (see
 * config/accountSchema.ts's header comment for why that sharing matters) —
 * neither screen re-implements its own version.
 */

/**
 * Applied to a required field's <label> to paint a trailing " *" — see
 * index.css's .required-mark rule for why this is a CSS ::after and not a
 * DOM text node: a literal "*" character, even wrapped in aria-hidden, was
 * confirmed (via a failing getByLabelText("Full name")) to still be
 * included in the accessible name Testing Library and screen readers
 * compute from a label's content.
 */
function labelClass(required: boolean): string {
  return `text-sm font-medium text-[color:var(--text-primary)]${required ? " required-mark" : ""}`;
}

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
      <ScholarCoreLogo size="sm" className="text-[color:var(--text-primary)]" />
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
  onBlur,
  autoComplete,
  hint,
  error,
  autoFocus,
  required = true,
  disabled = false,
  showPasswordToggle = false,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired on blur — e.g. to trigger an async availability check without re-running it on every keystroke. */
  onBlur?: () => void;
  autoComplete?: string;
  hint?: string;
  /** A validation/availability problem, shown the same way PhoneField and FileField already show theirs. */
  error?: string | null;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Only meaningful when type="password" — adds a Show/Hide toggle button. */
  showPasswordToggle?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const resolvedType = showPasswordToggle ? (visible ? "text" : "password") : type;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass(required)}>
        {label}
      </label>
      <div className={showPasswordToggle ? "relative" : undefined}>
        <input
          id={id}
          name={id}
          type={resolvedType}
          value={value}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          // Ties the hint/error to the input so it is read out with the field
          // rather than floating unattached below it.
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full px-3 py-2 text-sm ${showPasswordToggle ? "pr-14" : ""}`}
        />
        {showPasswordToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-[color:var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-[color:var(--state-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required = true,
  hint,
  placeholder = "Select…",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass(required)}>
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        required={required}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm"
      >
        <option value="" disabled={required}>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className="text-xs text-[color:var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 3 : 1)} MB`;
}

/**
 * Institutional ID document upload. Shows required/accepted-format/max-size
 * status up front, then the selected file's name and size with a Remove
 * action once one is chosen — never a silent, unlabeled file input.
 */
export function FileField({
  id,
  label,
  file,
  onChange,
  accept,
  maxBytes,
  required = true,
  helpText,
  error,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept: string;
  maxBytes?: number;
  required?: boolean;
  helpText?: string;
  error?: string | null;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass(required)}>
        {label}
      </label>
      {!file && (
        <input
          id={id}
          name={id}
          type="file"
          accept={accept}
          required={required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      )}
      {file && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2 text-sm">
          <span className="truncate text-[color:var(--text-primary)]">
            {file.name} ({formatBytes(file.size)})
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer"
          >
            Remove
          </button>
        </div>
      )}
      <p id={hintId} className="text-xs text-[color:var(--text-muted)]">
        {helpText}
        {maxBytes ? ` Max size ${formatBytes(maxBytes)}.` : ""}
      </p>
      {error && <AuthError>{error}</AuthError>}
    </div>
  );
}

/**
 * The one phone-number control used by both Create Account and Account
 * Settings: a searchable country selector (flag + dial code) plus a local
 * number input, kept as two separate pieces of state (phoneCountryCode,
 * phone) exactly as accountSchema.ts's canonical schema stores them —
 * countries.ts's normalizeE164/e164Problem are what combine them, so this
 * component never invents its own formatting or validation.
 */
export function PhoneField({
  idPrefix = "phone",
  countryCode,
  onCountryCodeChange,
  number,
  onNumberChange,
  onBlur,
  required = true,
  error,
}: {
  idPrefix?: string;
  countryCode: string;
  onCountryCodeChange: (dialCode: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  /** Fired on blur of the number input — e.g. to trigger an async availability check. */
  onBlur?: () => void;
  required?: boolean;
  error?: string | null;
}) {
  const selected: Country | undefined = COUNTRIES.find((c) => c.dialCode === countryCode);
  const numberId = `${idPrefix}-number`;
  const countryId = `${idPrefix}-country-code`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={numberId} className={labelClass(required)}>
        Phone
      </label>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={countryId}>
          Country code
        </label>
        <select
          id={countryId}
          name={countryId}
          value={selected ? `${selected.iso2}:${selected.dialCode}` : ""}
          onChange={(e) => onCountryCodeChange(e.target.value.split(":")[1] ?? e.target.value)}
          className="w-28 shrink-0 px-2 py-2 text-sm"
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso2} value={`${c.iso2}:${c.dialCode}`}>
              {c.flag} {c.dialCode}
            </option>
          ))}
        </select>
        <input
          id={numberId}
          name={numberId}
          type="tel"
          inputMode="numeric"
          value={number}
          required={required}
          placeholder="e.g., 5551234567"
          onChange={(e) => onNumberChange(e.target.value)}
          onBlur={onBlur}
          className="w-full px-3 py-2 text-sm"
        />
      </div>
      {error && <AuthError>{error}</AuthError>}
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

/**
 * Confirmations, e.g. "reset email sent". Same announcement treatment as
 * AuthError, but for a non-alarming message.
 *
 * Uses the brand accent's tinted surface (--accent-subtle/--accent-border),
 * not --state-info/--state-info-subtle's generic blue: a flat sky-blue box
 * here read as a different product bolted onto the page rather than part of
 * Scholar Core, next to --accent-colored links and the wordmark right above
 * it. --state-info-subtle is kept in index.css for any future genuinely
 * neutral (non-brand) informational surface, just no longer used here.
 */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-3 py-2 text-sm text-[color:var(--accent)]"
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
