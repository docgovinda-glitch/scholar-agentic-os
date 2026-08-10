import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  onPasswordRecovery,
  sendPasswordResetEmail,
  signIn,
  signUp,
  updatePassword,
} from "../../services/supabaseAuthService";
import {
  AuthError,
  AuthForm,
  AuthHeading,
  AuthLink,
  AuthNotice,
  AuthShell,
  Field,
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
export default function AuthFlow() {
  const [screen, setScreen] = useState<AuthScreen>("sign-in");

  // A recovery link lands the user on the app with a recovery session already
  // established. This must be checked on mount rather than reached by
  // navigation: the user clicked a link in their email, not a button here.
  useEffect(() => onPasswordRecovery(() => setScreen("recover")), []);

  switch (screen) {
    case "sign-up":
      return <SignUpScreen onDone={() => setScreen("registered")} onBack={() => setScreen("sign-in")} />;
    case "forgot":
      return <ForgotScreen onBack={() => setScreen("sign-in")} />;
    case "recover":
      return <RecoverScreen onDone={() => setScreen("sign-in")} />;
    case "registered":
      return <RegisteredScreen onBack={() => setScreen("sign-in")} />;
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username: username.trim(), password });
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
        <Field id="username" label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
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

function SignUpScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [fields, setFields] = useState<SignUpFields>(EMPTY_SIGN_UP);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = useCallback(
    (key: keyof SignUpFields) => (value: string) => setFields((f) => ({ ...f, [key]: value })),
    []
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = signUpProblem(fields);
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      const result = await signUp({ ...fields, username: fields.username.trim(), email: fields.email.trim() });
      if (!result.success) {
        setError(result.error ?? "Registration failed.");
        return;
      }
      onDone();
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
        {SIGN_UP_FIELDS.map((f, i) => (
          <Field
            key={f.key}
            id={`signup-${f.key}`}
            label={f.label}
            type={f.type}
            hint={f.hint}
            autoComplete={f.autoComplete}
            autoFocus={i === 0}
            value={fields[f.key]}
            onChange={set(f.key)}
          />
        ))}
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy} busyLabel="Creating account…" disabled={signUpProblem(fields) !== null}>
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendPasswordResetEmail(email.trim());
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

function RegisteredScreen({ onBack }: { onBack: () => void }) {
  return (
    <AuthShell>
      <AuthHeading title="Account created" />
      <AuthNotice>
        Check your email to verify your account. Once verified, you can sign in immediately.
      </AuthNotice>
      <div className="mt-6">
        <AuthLink onClick={onBack}>Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}
