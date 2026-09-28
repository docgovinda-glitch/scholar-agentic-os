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
  return `text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-neutral-300${required ? " required-mark" : ""}`;
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
  return (
    <div className={className ?? "min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col justify-center px-4 py-10"}>
      <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
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
    <header className="mb-6 text-left">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 shadow-2xs flex items-center justify-center shrink-0">
          <ScholarCoreLogo size="sm" className="text-[color:var(--text-primary)]" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-700 dark:text-amber-400">
              {badge}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-medium">
            Research & Academic Workspace
          </span>
        </div>
      </div>
      {/* h1 is the screen's own title for accessibility and page structure */}
      <h1 className="mt-3.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
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
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full px-3.5 py-2.5 text-sm bg-white dark:bg-neutral-900 border ${
            error
              ? "border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500/10"
              : "border-slate-300 dark:border-neutral-700 hover:border-slate-400 dark:hover:border-neutral-600 focus:border-slate-900 dark:focus:border-neutral-200 focus:ring-slate-900/5 dark:focus:ring-white/10"
          } rounded-xl text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-4 transition-all duration-150 shadow-2xs disabled:bg-slate-50 disabled:text-slate-400 ${
            showPasswordToggle ? "pr-16" : ""
          }`}
        />
        {showPasswordToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
                <span>Hide</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <p id={hintId} className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 leading-normal">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          className="w-full appearance-none px-3.5 py-2.5 pr-10 text-sm bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700 hover:border-slate-400 dark:hover:border-neutral-600 focus:border-slate-900 dark:focus:border-neutral-200 focus:ring-4 focus:ring-slate-900/5 dark:focus:ring-white/10 rounded-xl text-slate-900 dark:text-neutral-100 focus:outline-hidden transition-all duration-150 shadow-2xs cursor-pointer"
        >
          <option value="" disabled={required}>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100">
              {o.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 leading-normal">
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
          className="w-full text-sm py-2 px-3 bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700 rounded-xl cursor-pointer"
        />
      )}
      {file && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60 px-3.5 py-2.5 text-sm">
          <span className="truncate text-slate-900 dark:text-white font-medium">
            {file.name} ({formatBytes(file.size)})
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 cursor-pointer"
          >
            Remove
          </button>
        </div>
      )}
      <p id={hintId} className="text-xs text-slate-500 dark:text-neutral-400">
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
        className={`flex rounded-xl border ${
          error
            ? "border-rose-400 dark:border-rose-600 focus-within:border-rose-500 focus-within:ring-rose-500/10"
            : "border-slate-300 dark:border-neutral-700 hover:border-slate-400 dark:hover:border-neutral-600 focus-within:border-slate-900 dark:focus-within:border-neutral-200 focus-within:ring-slate-900/5 dark:focus-within:ring-white/10"
        } focus-within:ring-4 transition-all duration-150 shadow-2xs overflow-hidden bg-white dark:bg-neutral-900`}
      >
        <label className="sr-only" htmlFor={countryId}>
          Country code
        </label>
        <div className="relative border-r border-slate-200 dark:border-neutral-800 bg-slate-50/70 dark:bg-neutral-800/40 shrink-0">
          <select
            id={countryId}
            name={countryId}
            value={selected ? `${selected.iso2}:${selected.dialCode}` : ""}
            onChange={(e) => onCountryCodeChange(e.target.value.split(":")[1] ?? e.target.value)}
            className="appearance-none pl-3 pr-7 py-2.5 text-sm bg-transparent border-0 text-slate-800 dark:text-neutral-200 font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="" disabled>Code</option>
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={`${c.iso2}:${c.dialCode}`} className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100">
                {c.flag} {c.dialCode}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
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
          className="w-full px-3.5 py-2.5 text-sm bg-transparent border-0 text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-hidden"
        />
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 leading-normal">
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
      className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 shadow-2xs animate-in fade-in duration-150 text-left"
    >
      <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 font-medium">{children}</div>
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
      className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-300 shadow-2xs animate-in fade-in duration-150 text-left"
    >
      <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 font-medium">{children}</div>
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
      className="mt-3 w-full rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-white font-semibold px-4 py-3 text-sm shadow-md hover:shadow-lg shadow-slate-900/10 active:scale-[0.99] transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 cursor-pointer inline-flex items-center justify-center gap-2 group"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>{busyLabel}</span>
        </>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>{children}</span>
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      onClick={onClick}
      className="text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
      {children}
    </form>
  );
}

export function AuthDivider() {
  return (
    <div className="relative flex items-center py-2">
      <div className="flex-grow border-t border-slate-200 dark:border-neutral-800"></div>
      <span className="shrink-0 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
        Or continue with
      </span>
      <div className="flex-grow border-t border-slate-200 dark:border-neutral-800"></div>
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
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-850 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:shadow-xs active:scale-[0.99] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>Connecting to Google…</span>
        </>
      ) : (
        <>
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
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
