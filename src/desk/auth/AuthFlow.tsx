import { useCallback, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useLocation, type Location } from "react-router-dom";
import {
  sendPasswordResetEmail,
  signIn,
  signUp,
  updatePassword,
  resendVerificationEmail,
  checkUsernameAvailable,
  checkEmailAvailable,
  checkPhoneAvailable,
  signInWithGoogle,
  saveProfileFields,
} from "../../services/supabaseAuthService";
import { useDeskSession } from "../useDeskSession";
import { SessionBoundaryFallback } from "../DeskAuthGate";
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
  AuthDivider,
  GoogleSignInButton,
} from "./AuthLayout";
import {
  EMPTY_SIGN_UP,
  SIGN_UP_FIELDS,
  passwordProblem,
  signUpProblem,
  type SignUpFields,
} from "./authScreens";
import { EDUCATION_LEVELS, USER_TYPES, usernameProblem, emailProblem } from "../../config/accountSchema";
import { normalizeE164, e164Problem } from "../../config/countries";
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
 * Supabase's auth state; a successful sign-in needs no navigation of its
 * own here — PublicOnly (DeskAuthGate.tsx) is what notices the session flip
 * to "signed-in" and redirects away, following ?redirect= if one is present.
 *
 * Each screen below used to be one branch of a single-component switch,
 * reached only by changing in-memory state — the exact reason Back could
 * skip the whole flow in one step (no URL ever changed). Each is now its own
 * named export, mounted at its own route in DeskApp.tsx; the screens'
 * internals (form state, validation, the actual signIn()/signUp() calls)
 * are unchanged from before this file was split — only what supplies their
 * navigation callbacks changed, from setScreen(...) to useNavigate().
 */

function passedEmail(location: Location): string {
  const state = location.state as { email?: string } | null;
  return state?.email ?? "";
}

export function LandingRoute() {
  const navigate = useNavigate();
  return (
    <ScholarCoreLanding
      onGetStarted={() => navigate("/signup")}
      onSignIn={() => navigate("/signin")}
    />
  );
}

export function SignInRoute() {
  const navigate = useNavigate();
  return (
    <SignInScreen
      onRegister={() => navigate("/signup")}
      onForgot={() => navigate("/reset-password")}
    />
  );
}

export function SignUpRoute() {
  const navigate = useNavigate();
  return (
    <SignUpScreen
      onDone={(email) => navigate("/signup/check-email", { state: { email } })}
      onBack={() => navigate("/signin")}
    />
  );
}

export function ForgotRoute() {
  const navigate = useNavigate();
  return <ForgotScreen onBack={() => navigate("/signin")} />;
}

/** /reset-password/confirm — only ever rendered while RequireRecovery confirms session.status === "recovery". */
export function RecoverRoute() {
  const navigate = useNavigate();
  // Explicit navigation rather than relying purely on RequireRecovery's own
  // redirect-once-status-changes: updatePassword() succeeding and
  // useDeskSession's status actually flipping away from "recovery" are two
  // separate async steps, and this keeps the same "always land on sign-in
  // after a completed reset" behavior the screen already had, without a race
  // where the guard hasn't re-evaluated yet.
  return <RecoverScreen onDone={() => navigate("/signin", { replace: true })} />;
}

export function RegisteredRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = passedEmail(location);
  return (
    <RegisteredScreen
      email={email}
      onBack={() => navigate("/signin")}
      onResend={() => navigate("/signup/resend", { state: { email } })}
    />
  );
}

export function ResendVerificationRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = passedEmail(location);
  return <ResendVerificationScreen email={email} onBack={() => navigate("/signup/check-email", { state: { email } })} />;
}

export function OnboardingRoute() {
  const navigate = useNavigate();
  return <OnboardingScreen onDone={() => navigate("/projects", { replace: true })} />;
}

/**
 * /verify-email — self-guarding, like RequireAuth/PublicOnly/RequireRecovery
 * in DeskAuthGate.tsx, but kept here rather than made a fourth generic
 * wrapper there: it needs session.email and session.acknowledge() directly,
 * not just a status check, so folding it into a "children" wrapper would
 * just push those same reads back out to this file anyway.
 */
export function VerifyEmailRoute() {
  const navigate = useNavigate();
  const session = useDeskSession();

  if (session.status === "loading") return <SessionBoundaryFallback status="loading" />;
  if (session.status === "unconfigured") return <SessionBoundaryFallback status="unconfigured" />;
  if (session.status !== "email-verified") {
    return <Navigate to={session.status === "signed-in" ? "/projects" : "/signin"} replace />;
  }

  function handleContinue() {
    // Re-checked here rather than trusting the guard clause above: TypeScript
    // does not carry that narrowing into a closure handed off as an event
    // handler.
    if (session.status === "email-verified") session.acknowledge();
    // Explicit navigation rather than relying purely on this guard
    // re-rendering after the status flips — same reasoning as RecoverRoute.
    navigate("/projects", { replace: true });
  }

  return <EmailVerificationSuccessScreen email={session.email} onContinue={handleContinue} />;
}

export function SignInScreen({
  onRegister,
  onForgot,
  embedded = false,
}: {
  onRegister: () => void;
  onForgot: () => void;
  embedded?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username: username.trim(), password, captchaToken: captchaToken || undefined });
      if (result.success) return; // useDeskSession flips to "signed-in"; PublicOnly (DeskAuthGate.tsx) notices and navigates away.

      setError(result.error ?? "Could not sign you in.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error ?? "Could not sign in with Google.");
        setGoogleBusy(false);
      }
      // If success, the browser will redirect to Google, so we leave busy=true
    } catch (e) {
      setError((e as Error).message);
      setGoogleBusy(false);
    }
  }

  return (
    <AuthShell className={embedded ? "w-full" : undefined}>
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
        <SubmitButton busy={busy} busyLabel="Signing in…" disabled={!username.trim() || !password || googleBusy}>
          Sign in
        </SubmitButton>
      </AuthForm>

      <div className="mt-4">
        <AuthDivider />
      </div>
      <div className="mt-4">
        <GoogleSignInButton onClick={handleGoogleSignIn} busy={googleBusy} />
      </div>
      <div className="mt-6 flex flex-col items-start gap-2">
        <AuthLink onClick={onForgot}>Forgot your password?</AuthLink>
        <AuthLink onClick={onRegister}>Create an account</AuthLink>
      </div>
    </AuthShell>
  );
}

/** Availability verdict for one identifier field, tagged with the exact value it was checked against — see checkedAgainst()'s doc comment for why. */
type Availability = { checkedValue: string; status: "checking" | "available" | "taken" } | null;

function checkedAgainst(availability: Availability, currentValue: string): Availability {
  // A verdict only means something for the exact text it was run against —
  // if the user has since edited the field, an old "taken" would otherwise
  // keep showing against different text than what's now typed. Returning
  // null for a stale verdict, rather than clearing state on every keystroke,
  // means the check result survives being temporarily "stale" mid-typing and
  // reappears correctly if the user types back to the exact value that was
  // already checked (e.g. undoes an edit) — cheaper than a fresh RPC call.
  return availability && availability.checkedValue === currentValue ? availability : null;
}

export function SignUpScreen({
  onDone,
  onBack,
  embedded = false,
}: {
  onDone: (email: string) => void;
  onBack: () => void;
  embedded?: boolean;
}) {
  const [fields, setFields] = useState<SignUpFields>(EMPTY_SIGN_UP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<Availability>(null);
  const [emailAvailability, setEmailAvailability] = useState<Availability>(null);
  const [phoneAvailability, setPhoneAvailability] = useState<Availability>(null);

  const set = useCallback(
    (key: keyof SignUpFields) => (value: string) => setFields((f) => ({ ...f, [key]: value })),
    []
  );

  const username = fields.username.trim();
  const email = fields.email.trim();
  const phoneE164 = normalizeE164(fields.phoneCountryCode, fields.phone);

  const usernameStatus = checkedAgainst(usernameAvailability, username);
  const emailStatus = checkedAgainst(emailAvailability, email);
  const phoneStatus = checkedAgainst(phoneAvailability, phoneE164 ?? "");

  const USERNAME_TAKEN_MESSAGE = "This username is already taken. Please choose a different username.";
  const EMAIL_TAKEN_MESSAGE = "This email address is already registered. Please use a different email address, or sign in if this is your account.";
  const PHONE_TAKEN_MESSAGE = "This mobile number is already registered. Please use a different mobile number.";

  async function checkUsernameField() {
    const value = fields.username.trim();
    if (!value || usernameProblem(value)) return;
    setUsernameAvailability({ checkedValue: value, status: "checking" });
    const available = await checkUsernameAvailable(value);
    setUsernameAvailability({ checkedValue: value, status: available ? "available" : "taken" });
  }

  async function checkEmailField() {
    const value = fields.email.trim();
    if (!value || emailProblem(value)) return;
    setEmailAvailability({ checkedValue: value, status: "checking" });
    const available = await checkEmailAvailable(value);
    setEmailAvailability({ checkedValue: value, status: available ? "available" : "taken" });
  }

  async function checkPhoneField() {
    if (e164Problem(fields.phoneCountryCode, fields.phone)) return;
    const e164 = normalizeE164(fields.phoneCountryCode, fields.phone);
    if (!e164) return;
    setPhoneAvailability({ checkedValue: e164, status: "checking" });
    const available = await checkPhoneAvailable(e164);
    setPhoneAvailability({ checkedValue: e164, status: available ? "available" : "taken" });
  }

  const captchaRequired = getCaptchaConfig().enabled;
  const problem =
    signUpProblem(fields) ??
    (usernameStatus?.status === "taken" ? USERNAME_TAKEN_MESSAGE : null) ??
    (emailStatus?.status === "taken" ? EMAIL_TAKEN_MESSAGE : null) ??
    (phoneStatus?.status === "taken" ? PHONE_TAKEN_MESSAGE : null) ??
    (usernameStatus?.status === "checking" || emailStatus?.status === "checking" || phoneStatus?.status === "checking"
      ? "Checking availability…"
      : null) ??
    (captchaRequired && !captchaToken ? "Complete the CAPTCHA challenge." : null);

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error ?? "Could not sign in with Google.");
        setGoogleBusy(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setGoogleBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      // Defense-in-depth, not the primary check: re-verify all three
      // identifiers are still free immediately before submitting, in case
      // this screen never ran an on-blur check at all (e.g. every field was
      // filled by browser autofill and the user went straight to submit —
      // `problem` above only catches a check that already ran and came back
      // "taken", not one that never ran) or because availability could have
      // changed since an earlier check (someone else registered the same
      // identifier in between). The database's own unique constraints are
      // what actually prevent a duplicate no matter what this says.
      const [usernameOk, emailOk, phoneOk] = await Promise.all([
        checkUsernameAvailable(username),
        checkEmailAvailable(email),
        phoneE164 ? checkPhoneAvailable(phoneE164) : Promise.resolve(true),
      ]);
      if (!usernameOk) {
        setUsernameAvailability({ checkedValue: username, status: "taken" });
        setError(USERNAME_TAKEN_MESSAGE);
        return;
      }
      if (!emailOk) {
        setEmailAvailability({ checkedValue: email, status: "taken" });
        setError(EMAIL_TAKEN_MESSAGE);
        return;
      }
      if (!phoneOk) {
        setPhoneAvailability({ checkedValue: phoneE164 ?? "", status: "taken" });
        setError(PHONE_TAKEN_MESSAGE);
        return;
      }

      const result = await signUp({
        ...fields,
        username,
        email,
        captchaToken: captchaToken || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Registration failed.");
        return;
      }
      onDone(email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell className={embedded ? "w-full" : undefined}>
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
            onBlur={f.key === "username" ? checkUsernameField : f.key === "email" ? checkEmailField : undefined}
            error={
              f.key === "username" && usernameStatus?.status === "taken"
                ? USERNAME_TAKEN_MESSAGE
                : f.key === "email" && emailStatus?.status === "taken"
                  ? EMAIL_TAKEN_MESSAGE
                  : null
            }
          />
        ))}
        <PhoneField
          idPrefix="signup-phone"
          countryCode={fields.phoneCountryCode}
          onCountryCodeChange={set("phoneCountryCode")}
          number={fields.phone}
          onNumberChange={set("phone")}
          onBlur={checkPhoneField}
          error={phoneStatus?.status === "taken" ? PHONE_TAKEN_MESSAGE : null}
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
        <SubmitButton busy={busy} busyLabel="Creating account…" disabled={problem !== null || googleBusy}>
          Create account
        </SubmitButton>
      </AuthForm>

      <div className="mt-4">
        <AuthDivider />
      </div>
      <div className="mt-4">
        <GoogleSignInButton onClick={handleGoogleSignIn} busy={googleBusy} />
      </div>

      <div className="mt-6">
        <AuthLink onClick={onBack}>Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}

export function ForgotScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void;
  embedded?: boolean;
}) {
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
      <AuthShell className={embedded ? "w-full" : undefined}>
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
    <AuthShell className={embedded ? "w-full" : undefined}>
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

export function RegisteredScreen({
  email,
  onBack,
  onResend,
  embedded = false,
}: {
  email: string;
  onBack: () => void;
  onResend: () => void;
  embedded?: boolean;
}) {
  return (
    <AuthShell className={embedded ? "w-full" : undefined}>
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

export function ResendVerificationScreen({
  email,
  onBack,
  embedded = false,
}: {
  email: string;
  onBack: () => void;
  embedded?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setBusy(true);
    setError(null);
    try {
      const result = await resendVerificationEmail({ email });
      if (result.success) onBack(); // back to the "Check your email" screen
      else setError(result.error ?? "Could not resend the email. Please wait a few minutes and try again.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell className={embedded ? "w-full" : undefined}>
      <AuthHeading title="Resend verification email" subtitle={`Send a new link to ${email}`} />
      {error && (
        <div className="mb-6">
          <AuthError>{error}</AuthError>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <SubmitButton busy={busy} busyLabel="Sending…" disabled={!email} onClick={handleResend}>
          Send email
        </SubmitButton>
        <div className="mt-2 text-center">
          <AuthLink onClick={onBack}>Back</AuthLink>
        </div>
      </div>
    </AuthShell>
  );
}

function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [userType, setUserType] = useState<string>("");
  const [educationLevel, setEducationLevel] = useState<string>("");
  const [affiliation, setAffiliation] = useState("");
  const [phoneState, setPhoneState] = useState<{ number: string; code: string }>({ number: "", code: "" });
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPhone = normalizeE164(phoneState.code, phoneState.number);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await saveProfileFields({
        userType,
        educationLevel,
        affiliation: affiliation.trim(),
        phone: parsedPhone || "",
        phoneCountryCode: phoneState.code,
      });

      if (result.success) {
        onDone();
      } else {
        setError(result.error ?? "Could not save your profile details.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading 
        title="Complete your profile" 
        subtitle="Before you start researching, please tell us a bit about yourself." 
      />
      <AuthForm onSubmit={handleSubmit}>
        <SelectField
          id="user_type"
          label="Role"
          value={userType}
          onChange={setUserType}
          options={USER_TYPES}
          placeholder="Select your role…"
        />
        <SelectField
          id="education_level"
          label="Highest education level"
          value={educationLevel}
          onChange={setEducationLevel}
          options={EDUCATION_LEVELS}
          placeholder="Select education level…"
        />
        <Field
          id="affiliation"
          label="Institution or Company"
          value={affiliation}
          onChange={setAffiliation}
          hint="Optional. Where do you study or work?"
          required={false}
        />
        <PhoneField
          idPrefix="phone"
          label="Mobile number"
          number={phoneState.number}
          onNumberChange={(n) => setPhoneState((s) => ({ ...s, number: n }))}
          countryCode={phoneState.code}
          onCountryCodeChange={(c) => setPhoneState((s) => ({ ...s, code: c }))}
          required={false}
          hint="Optional. Used for SMS recovery."
        />
        
        {error && <AuthError>{error}</AuthError>}
        
        <SubmitButton busy={busy} busyLabel="Saving…" disabled={!userType || !educationLevel}>
          Continue to Scholar Core
        </SubmitButton>
      </AuthForm>
    </AuthShell>
  );
}
