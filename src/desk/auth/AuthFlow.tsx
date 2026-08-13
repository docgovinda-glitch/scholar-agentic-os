import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  onPasswordRecovery,
  sendPasswordResetEmail,
  signIn,
  signUp,
  updatePassword,
  resendVerificationEmail,
} from "../../services/supabaseAuthService";
import CaptchaWidget from "./CaptchaWidget";
import {
  AuthError,
  AuthForm,
  AuthHeading,
  AuthLink,
  AuthNotice,
  AuthShell,
  Field,
  PhoneField,
  SelectField,
  SubmitButton,
} from "./AuthLayout";
import {
  EMPTY_SIGN_UP,
  SIGN_UP_FIELDS,
  passwordProblem,
  signUpProblem,
  type AuthScreen,
  type SignUpFields,
} from "./authScreens";
import { EDUCATION_LEVELS, USER_TYPES } from "../../config/accountSchema";
import { getCaptchaConfig } from "../../services/captchaService";
import ScholarCoreLanding from "../ScholarCoreLanding";

/**
 * Desk's unauthenticated surface: sign in, register, recover a password.
 *
 * Every call goes through `src/services/supabaseAuthService.ts` unchanged.
 * That module carries a long tail of fixes for real production failures —
 * the "{}" error-message artifact, the PASSWORD_RECOVERY listener race, the
 * crash when Supabase is unconfigured — and reimplementing any of it here
 * would reintroduce bugs someone already paid for. This file is screens only.
 *
 * Nothing here signs anyone in by itself. `useDeskSession` is subscribed to
 * Supabase's auth state and swaps the whole gate out when a session appears,
 * so a successful sign-in needs no navigation of its own — pushing a route
 * here would race that subscription.
 */
export default function AuthFlow({
  initialScreen = "landing",
  verifiedEmail,
  onEmailVerificationAcknowledged,
}: {
  initialScreen?: AuthScreen;
  verifiedEmail?: string | null;
  /**
   * Called when the user dismisses the email-verification success screen.
   * They already hold a valid session at that point (Supabase auto-signs in
   * on verification) — this tells useDeskSession to drop its "email-verified"
   * status back to "signed-in" so DeskAuthGate renders the real app, rather
   * than making them re-enter credentials for a session they already have.
   */
  onEmailVerificationAcknowledged?: () => void;
} = {}) {
  const [screen, setScreen] = useState<AuthScreen>(initialScreen);
  const [registeredEmail, setRegisteredEmail] = useState<string>("");

  // Belt-and-suspenders: useDeskSession is the authoritative recovery-link
  // detector now (it runs first, before this component even mounts, and
  // passes the result down as `initialScreen`) — by the time this effect
  // could run, Supabase has typically already consumed the one-time
  // PASSWORD_RECOVERY event and stripped the URL's token fragment, so this
  // rarely fires on its own. Left in case a recovery event ever arrives
  // while this screen is already mounted rather than on a fresh page load.
  useEffect(() => onPasswordRecovery(() => setScreen("recover")), []);

  switch (screen) {
    case "landing":
      return (
        <ScholarCoreLanding
          onGetStarted={() => setScreen("sign-up")}
          onSignIn={() => setScreen("sign-in")}
        />
      );
    case "sign-up":
      return <SignUpScreen onDone={(email) => { setRegisteredEmail(email); setScreen("registered"); }} onBack={() => setScreen("sign-in")} />;
    case "forgot":
      return <ForgotScreen onBack={() => setScreen("sign-in")} />;
    case "recover":
      return <RecoverScreen onDone={() => setScreen("sign-in")} />;
    case "registered":
      return <RegisteredScreen email={registeredEmail} onBack={() => setScreen("sign-in")} onResend={() => setScreen("resend-verification")} />;
    case "resend-verification":
      return <ResendVerificationScreen email={registeredEmail} onBack={() => setScreen("registered")} />;
    case "email-verification-success":
      return (
        <EmailVerificationSuccessScreen
          email={verifiedEmail}
          onContinue={onEmailVerificationAcknowledged ?? (() => setScreen("sign-in"))}
        />
      );
    default:
      return (
        <SignInScreen
          onRegister={() => setScreen("sign-up")}
          onForgot={() => setScreen("forgot")}
        />
      );
  }
}

function SignInScreen({
  onRegister,
  onForgot,
}: {
  onRegister: () => void;
  onForgot: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username: username.trim(), password, captchaToken: captchaToken || undefined });
      if (result.success) return; // useDeskSession takes over from here.

      setError(result.error ?? "Could not sign you in.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="Sign in" subtitle="Reach your work." />
      <AuthForm onSubmit={handleSubmit}>
        <Field
          id="username"
          label="User ID, email, or mobile number"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          hint="Enter your username, email address, or mobile number in E.164 format (e.g., +15551234567)"
          autoFocus
        />
        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {/*
          Sign-in needs the challenge too, not just sign-up: Supabase Auth's
          CAPTCHA setting is per-project, so enabling it protects the password
          grant at the same moment it protects signup. Without this the widget
          would only exist on the registration screen and every existing user
          would be locked out the moment CAPTCHA was switched on. Renders
          nothing at all when VITE_CAPTCHA_SITE_KEY is unset.
        */}
        <CaptchaWidget onTokenReady={setCaptchaToken} />
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy} busyLabel="Signing in…" disabled={!username.trim() || !password}>
          Sign in
        </SubmitButton>
      </AuthForm>
      <div className="mt-6 flex flex-col items-start gap-2">
        <AuthLink onClick={onForgot}>Forgot your password?</AuthLink>
        <AuthLink onClick={onRegister}>Create an account</AuthLink>
      </div>
    </AuthShell>
  );
}

function SignUpScreen({ onDone, onBack }: { onDone: (email: string) => void; onBack: () => void }) {
  const [fields, setFields] = useState<SignUpFields>(EMPTY_SIGN_UP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const set = useCallback(
    (key: keyof SignUpFields) => (value: string) => setFields((f) => ({ ...f, [key]: value })),
    []
  );

  const captchaRequired = getCaptchaConfig().enabled;
  const problem = signUpProblem(fields) ?? (captchaRequired && !captchaToken ? "Complete the CAPTCHA challenge." : null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      const result = await signUp({
        ...fields,
        username: fields.username.trim(),
        email: fields.email.trim(),
        captchaToken: captchaToken || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Registration failed.");
        return;
      }
      onDone(fields.email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Create your account"
        subtitle="Verify your email to get started."
      />
      <AuthForm onSubmit={handleSubmit}>
        {SIGN_UP_FIELDS.filter((f) => f.key !== "password").map((f, i) => (
          <Field
            key={f.key}
            id={`signup-${f.key}`}
            label={f.label}
            type={f.type}
            hint={f.hint}
            autoComplete={f.autoComplete}
            autoFocus={i === 0}
            required={f.required ?? true}
            value={fields[f.key]}
            onChange={set(f.key)}
          />
        ))}
        <PhoneField
          idPrefix="signup-phone"
          countryCode={fields.phoneCountryCode}
          onCountryCodeChange={set("phoneCountryCode")}
          number={fields.phone}
          onNumberChange={set("phone")}
        />
        <SelectField
          id="signup-userType"
          label="User Type"
          value={fields.userType}
          onChange={set("userType")}
          options={USER_TYPES}
        />
        <SelectField
          id="signup-educationLevel"
          label="Level of Education"
          value={fields.educationLevel}
          onChange={set("educationLevel")}
          options={EDUCATION_LEVELS}
        />
        <Field
          id="signup-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={fields.password}
          onChange={set("password")}
          showPasswordToggle
        />
        <CaptchaWidget onTokenReady={setCaptchaToken} />
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy} busyLabel="Creating account…" disabled={problem !== null}>
          Create account
        </SubmitButton>
      </AuthForm>
      <div className="mt-6">
        <AuthLink onClick={onBack}>Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}

function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendPasswordResetEmail(email.trim(), captchaToken || undefined);
      if (result.success) setSent(true);
      else setError(result.error ?? "Could not send the reset email.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <AuthHeading title="Check your email" />
        {/* Deliberately does not confirm whether the address has an account:
            that would turn this form into a way to test which emails are
            registered. */}
        <AuthNotice>
          If an account exists for {email.trim()}, a reset link is on its way. The link opens Scholar and lets you set
          a new password.
        </AuthNotice>
        <div className="mt-6">
          <AuthLink onClick={onBack}>Back to sign in</AuthLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading title="Reset your password" subtitle="We will email you a link to set a new one." />
      <AuthForm onSubmit={handleSubmit}>
        <Field id="reset-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
        {/* /recover is covered by the same project-wide CAPTCHA setting — see SignInScreen. */}
        <CaptchaWidget onTokenReady={setCaptchaToken} />
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy} busyLabel="Sending…" disabled={!email.trim()}>
          Send reset link
        </SubmitButton>
      </AuthForm>
      <div className="mt-6">
        <AuthLink onClick={onBack}>Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}

function RecoverScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm !== "" && password !== confirm;
  const problem = passwordProblem(password) ?? (mismatch ? "The two passwords do not match." : null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      const result = await updatePassword(password);
      if (result.success) onDone();
      else setError(result.error ?? "Could not update the password.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="Set a new password" subtitle="You followed a reset link, so you can choose a new password now." />
      <AuthForm onSubmit={handleSubmit}>
        <Field
          id="new-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 8 characters."
          autoFocus
        />
        <Field
          id="confirm-password"
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {/* Shown as soon as they diverge, rather than on submit — retyping a
            password you cannot see is worth catching early. */}
        {mismatch && <AuthError>The two passwords do not match.</AuthError>}
        {error && !mismatch && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy} busyLabel="Saving…" disabled={problem !== null}>
          Save new password
        </SubmitButton>
      </AuthForm>
    </AuthShell>
  );
}

function RegisteredScreen({ email, onBack, onResend }: { email: string; onBack: () => void; onResend: () => void }) {
  return (
    <AuthShell>
      <AuthHeading title="Account created" />
      <AuthNotice>
        {email ? (
          <>
            A verification email has been sent to <strong>{email}</strong>. Check your inbox and click the link to verify your account and sign in.
          </>
        ) : (
          <>
            A verification email has been sent to your inbox. Click the link to verify your account and sign in.
          </>
        )}
      </AuthNotice>
      <div className="mt-6 flex flex-col items-start gap-3">
        <button
          onClick={onResend}
          className="text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          Didn't receive the email? Resend it
        </button>
        <AuthLink onClick={onBack}>Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}

function EmailVerificationSuccessScreen({ email, onContinue }: { email?: string | null; onContinue: () => void }) {
  return (
    <AuthShell>
      <AuthHeading title="Email verified!" subtitle="Your account is now active and ready to use." />
      <AuthNotice>
        {email ? (
          <>
            Your email address <strong>{email}</strong> has been successfully verified. You're signed in and ready to go.
          </>
        ) : (
          <>
            Your email address has been successfully verified. You're signed in and ready to go.
          </>
        )}
      </AuthNotice>
      <div className="mt-6">
        <button
          onClick={onContinue}
          className="w-full rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
        >
          Continue to Scholar Core
        </button>
      </div>
    </AuthShell>
  );
}

function ResendVerificationScreen({ email, onBack }: { email: string; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await resendVerificationEmail({ email: email.trim() });
      if (result.success) {
        setMessage("Verification email resent! Check your inbox.");
      } else {
        setError(result.error ?? "Could not resend the email.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="Resend verification email" />
      <AuthNotice>
        We'll send another verification email to <strong>{email}</strong>.
      </AuthNotice>
      <AuthForm onSubmit={(e) => { e.preventDefault(); handleResend(); }}>
        {message && <AuthNotice>{message}</AuthNotice>}
        {error && <AuthError>{error}</AuthError>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Sending…" : "Resend email"}
        </button>
      </AuthForm>
      <div className="mt-6">
        <AuthLink onClick={onBack}>Back</AuthLink>
      </div>
    </AuthShell>
  );
}
