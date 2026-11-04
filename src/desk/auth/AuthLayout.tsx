import { useState, type FormEvent, type ReactNode } from "react";
import type { Option } from "../../config/accountSchema";
import { COUNTRIES, type Country } from "../../config/countries";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

/**
 * Shared chrome and controls for Desk's auth screens.
 *
 * Extracted rather than repeated across screens so the accessible
 * behaviour is written once: every input gets a real <label> bound by id,
 * every error is announced, and the submit button's disabled state is derived
 * rather than hand-maintained.
 *
 * Also imported directly by desk/account/AccountSettingsScreen.tsx: Field,
 * SelectField, FileField and PhoneField are the one definition of each
 * control shared by Create Account and Account Settings.
 */

/**
 * Applied to a required field's <label> to paint a trailing " *" via CSS.
 */
function labelClass(required: boolean): string {
  return `text-[13px] font-semibold tracking-tight text-neutral-800 dark:text-neutral-200${required ? " required-mark" : ""}`;
}

export function AuthShell({
  children,
  className,
  maxWidth = "max-w-md",
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  if (className) {
    return (
      <div className={className}>
        <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
      </div>
    );
  }
  return (
    <div className="min-h-[100dvh] bg-paper-sand dark:bg-ink-900 flex flex-col justify-center px-4 py-8 sm:py-12">
      <div className={`mx-auto w-full ${maxWidth} bg-white dark:bg-ink-800 border border-neutral-200/90 dark:border-white/10 rounded-2xl shadow-sm p-6 sm:p-8`}>
        {children}
      </div>
    </div>
  );
}

export function AuthHeading({
  title,
  subtitle,
  badge = "SCHOLAR CORE",
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <header className="mb-4 text-left">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 flex items-center justify-center shrink-0">
          <ScholarCoreLogo size="sm" className="text-[color:var(--text-primary)]" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold tracking-wider uppercase text-neutral-800 dark:text-neutral-200 leading-none">
              {badge}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          </div>
          <span className="text-[10.5px] text-neutral-500 dark:text-neutral-400 font-medium leading-tight mt-0.5">
            Research & Academic Workspace
          </span>
        </div>
      </div>
      {/* h1 is the screen's own title for accessibility and page structure */}
      <h1 className="mt-2.5 text-xl sm:text-[22px] font-bold tracking-tight text-neutral-900 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {subtitle}
        </p>
      )}
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
  const isIdentifier =
    type === "email" ||
    type === "tel" ||
    autoComplete === "username" ||
    autoComplete === "email";

  return (
    <div className="flex flex-col gap-1.5 text-left">
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
          spellCheck={isIdentifier ? false : undefined}
          autoCapitalize={isIdentifier ? "off" : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full h-11 px-3.5 py-2 text-sm bg-white dark:bg-ink-900 border ${
            error
              ? "border-rose-400 dark:border-rose-500/80 focus:border-rose-600"
              : "border-neutral-300 dark:border-white/15 hover:border-neutral-400 dark:hover:border-white/25 focus:border-neutral-900 dark:focus:border-white"
          } rounded-md text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden transition-colors duration-150 disabled:bg-neutral-50 dark:disabled:bg-ink-850 disabled:text-neutral-400 ${
            showPasswordToggle ? "pr-20" : ""
          }`}
        />
        {showPasswordToggle && (
          <button
            type="button"
            data-compact="true"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 rounded-sm transition-colors cursor-pointer flex items-center gap-1"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
                <span>Hide</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Show</span>
              </>
            )}
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-[11.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
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
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className={labelClass(required)}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={id}
          value={value}
          required={required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 appearance-none px-3.5 py-2 pr-9 text-sm bg-white dark:bg-ink-900 border border-neutral-300 dark:border-white/15 hover:border-neutral-400 dark:hover:border-white/25 focus:border-neutral-900 dark:focus:border-white rounded-md text-neutral-900 dark:text-neutral-100 focus:outline-hidden transition-colors duration-150 cursor-pointer"
        >
          <option value="" disabled={required}>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-white dark:bg-ink-900 text-neutral-900 dark:text-neutral-100">
              {o.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-[11.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
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
 * Institutional ID document upload.
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
    <div className="flex flex-col gap-1.5 text-left">
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
          className="w-full text-sm py-2 px-3 bg-white dark:bg-ink-900 border border-neutral-300 dark:border-white/15 rounded-md cursor-pointer"
        />
      )}
      {file && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-ink-900/60 px-3.5 py-2.5 text-sm">
          <span className="truncate text-neutral-900 dark:text-white font-medium">
            {file.name} ({formatBytes(file.size)})
          </span>
          <button
            type="button"
            data-compact="true"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 cursor-pointer"
          >
            Remove
          </button>
        </div>
      )}
      <p id={hintId} className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
        {helpText}
        {maxBytes ? ` Max size ${formatBytes(maxBytes)}.` : ""}
      </p>
      {error && <AuthError>{error}</AuthError>}
    </div>
  );
}

/**
 * The one phone-number control used by both Create Account and Account Settings.
 */
export function PhoneField({
  idPrefix = "phone",
  label = "Phone",
  countryCode,
  onCountryCodeChange,
  number,
  onNumberChange,
  onBlur,
  required = true,
  hint,
  error,
}: {
  idPrefix?: string;
  label?: string;
  countryCode: string;
  onCountryCodeChange: (dialCode: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  /** Fired on blur of the number input — e.g. to trigger an async availability check. */
  onBlur?: () => void;
  required?: boolean;
  hint?: string;
  error?: string | null;
}) {
  const selected: Country | undefined = COUNTRIES.find((c) => c.dialCode === countryCode);
  const numberId = `${idPrefix}-number`;
  const countryId = `${idPrefix}-country-code`;
  const hintId = hint ? `${idPrefix}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={numberId} className={labelClass(required)}>
        {label}
      </label>
      <div
        className={`flex items-stretch h-11 rounded-md border ${
          error
            ? "border-rose-400 dark:border-rose-500/80 focus-within:border-rose-600"
            : "border-neutral-300 dark:border-white/15 hover:border-neutral-400 dark:hover:border-white/25 focus-within:border-neutral-900 dark:focus-within:border-white"
        } focus-within:ring-3 focus-within:ring-neutral-900/8 dark:focus-within:ring-white/10 transition-colors duration-150 overflow-hidden bg-white dark:bg-ink-900`}
      >
        <label className="sr-only" htmlFor={countryId}>
          Country code
        </label>
        <div className="relative flex items-center border-r border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-ink-800/70 shrink-0">
          <select
            id={countryId}
            name={countryId}
            value={selected ? `${selected.iso2}:${selected.dialCode}` : ""}
            onChange={(e) => onCountryCodeChange(e.target.value.split(":")[1] ?? e.target.value)}
            className="prompt-bare-input border-0 bg-transparent h-full appearance-none pl-2.5 pr-6 text-sm text-neutral-800 dark:text-neutral-200 font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="" disabled>Code</option>
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={`${c.iso2}:${c.dialCode}`} className="bg-white dark:bg-ink-900 text-neutral-900 dark:text-neutral-100">
                {c.flag} {c.dialCode}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <input
          id={numberId}
          name={numberId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={number}
          required={required}
          placeholder="e.g., 5551234567"
          onChange={(e) => onNumberChange(e.target.value)}
          onBlur={onBlur}
          className="prompt-bare-input border-0 bg-transparent w-full h-full px-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden"
        />
      </div>
      {hint && (
        <p id={hintId} className="text-[11.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {hint}
        </p>
      )}
      {error && <AuthError>{error}</AuthError>}
    </div>
  );
}

/** Failures. role="alert" so they are announced, not merely displayed. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-150 text-left"
    >
      <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 font-medium leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Confirmations, e.g. "reset email sent".
 */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-150 text-left"
    >
      <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 font-medium leading-relaxed">{children}</div>
    </div>
  );
}

export function SubmitButton({
  busy,
  disabled,
  children,
  busyLabel,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  children: ReactNode;
  busyLabel: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className="mt-1.5 w-full h-11 rounded-md bg-neutral-900 hover:bg-ink-950 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 text-white font-semibold px-4 text-sm shadow-xs hover:shadow-sm active:scale-[0.99] transition-all duration-150 disabled:bg-neutral-800 disabled:text-white/90 dark:disabled:bg-neutral-200 dark:disabled:text-neutral-900 disabled:!opacity-85 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 cursor-pointer inline-flex items-center justify-center gap-2 group"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />
          <span>{busyLabel}</span>
        </>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>{children}</span>
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Navigation between auth screens. A button, not an anchor — it changes state, not location. */
export function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-compact="true"
      onClick={onClick}
      className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white underline-offset-4 hover:underline transition-colors cursor-pointer"
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

export function AuthDivider() {
  return (
    <div className="relative flex items-center py-1.5">
      <div className="flex-grow border-t border-neutral-200 dark:border-white/10"></div>
      <span className="shrink-0 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Or continue with
      </span>
      <div className="flex-grow border-t border-neutral-200 dark:border-white/10"></div>
    </div>
  );
}

export function GoogleSignInButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="flex w-full h-11 items-center justify-center gap-3 rounded-md border border-neutral-300 dark:border-white/15 bg-white dark:bg-ink-750 hover:bg-neutral-50 dark:hover:bg-ink-700 hover:border-neutral-400 dark:hover:border-white/25 px-4 text-sm font-semibold text-neutral-800 dark:text-neutral-100 shadow-2xs active:scale-[0.99] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />
          <span>Connecting to Google…</span>
        </>
      ) : (
        <>
          <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );
}
