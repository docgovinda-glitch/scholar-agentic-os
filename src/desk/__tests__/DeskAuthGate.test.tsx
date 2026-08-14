// @vitest-environment jsdom
//
// The gate that stops Desk rendering to an anonymous visitor, and the auth
// screens behind it.
//
// Desk shipped for a while with no gate at all — main.tsx mounted it outside
// any auth provider, against endpoints that required none. This is the client
// half of closing that. It is deliberately not the enforcing half: a
// client-side gate protects nothing on its own, which is why
// server/routes/__tests__/project.authz.test.ts exists and why the
// "unconfigured" case below still refuses to render children.
//
// DeskAuthGate.tsx used to be a single component that decided whether to
// render its children at all, swapping in AuthFlow's internal switch for
// every unauthenticated case. It is now a set of route guards (RequireAuth,
// PublicOnly, RequireRecovery) with each real screen mounted at its own URL —
// this file's TestApp mirrors DeskApp.tsx's actual route tree (minus the
// workspace itself, which has its own dependency graph and its own tests) so
// these tests exercise real navigation, not a simulated one.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Routes, Route, useNavigate } from "react-router-dom";
import { renderWithRouter, type RenderWithRouterOptions } from "../../testUtils/renderWithRouter";

const useDeskSession = vi.fn();
vi.mock("../useDeskSession", () => ({ useDeskSession: () => useDeskSession() }));

const signIn = vi.fn();
const signUp = vi.fn();
const sendPasswordResetEmail = vi.fn();
const updatePassword = vi.fn();
const resendVerificationEmail = vi.fn();
const checkUsernameAvailable = vi.fn();
const checkEmailAvailable = vi.fn();
const checkPhoneAvailable = vi.fn();

vi.mock("../../services/supabaseAuthService", () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  signUp: (...a: unknown[]) => signUp(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
  updatePassword: (...a: unknown[]) => updatePassword(...a),
  resendVerificationEmail: (...a: unknown[]) => resendVerificationEmail(...a),
  checkUsernameAvailable: (...a: unknown[]) => checkUsernameAvailable(...a),
  checkEmailAvailable: (...a: unknown[]) => checkEmailAvailable(...a),
  checkPhoneAvailable: (...a: unknown[]) => checkPhoneAvailable(...a),
}));

const { RequireAuth, PublicOnly, RequireRecovery } = await import("../DeskAuthGate");
const {
  LandingRoute,
  SignInRoute,
  SignUpRoute,
  ForgotRoute,
  RecoverRoute,
  RegisteredRoute,
  ResendVerificationRoute,
  VerifyEmailRoute,
} = await import("../auth/AuthFlow");

const Protected = () => <p>Your work</p>;

/**
 * Test-only affordance for exercising real Back/Forward semantics —
 * production has no such button; the browser chrome supplies this.
 * navigate(-1)/navigate(1) drive the same history stack a real Back/Forward
 * press would, whether that stack is window.history (BrowserRouter,
 * production) or MemoryRouter's in-memory one (here).
 */
function BackForwardControls() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate(-1)}>Test Back</button>
      <button onClick={() => navigate(1)}>Test Forward</button>
    </div>
  );
}

/**
 * Mirrors DeskApp.tsx's real route tree, with DeskRoutes (the full
 * project-list/workspace app, its own dependency graph) swapped for a
 * trivial Protected placeholder — this file exercises the auth boundary and
 * screens, not the workspace behind it.
 */
function TestApp() {
  return (
    <>
      <BackForwardControls />
      <Routes>
        <Route path="/" element={<PublicOnly><LandingRoute /></PublicOnly>} />
        <Route path="/signin" element={<PublicOnly><SignInRoute /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><SignUpRoute /></PublicOnly>} />
        <Route path="/signup/check-email" element={<PublicOnly><RegisteredRoute /></PublicOnly>} />
        <Route path="/signup/resend" element={<PublicOnly><ResendVerificationRoute /></PublicOnly>} />
        <Route path="/reset-password" element={<PublicOnly><ForgotRoute /></PublicOnly>} />
        <Route
          path="/reset-password/confirm"
          element={
            <RequireRecovery>
              <RecoverRoute />
            </RequireRecovery>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailRoute />} />
        <Route path="/*" element={<RequireAuth />}>
          <Route path="*" element={<Protected />} />
        </Route>
      </Routes>
    </>
  );
}

const gate = (options?: RenderWithRouterOptions) => renderWithRouter(<TestApp />, options);

beforeEach(() => {
  signIn.mockResolvedValue({ success: true });
  signUp.mockResolvedValue({ success: true });
  sendPasswordResetEmail.mockResolvedValue({ success: true });
  updatePassword.mockResolvedValue({ success: true });
  resendVerificationEmail.mockResolvedValue({ success: true, emailSent: true });
  // Every identifier is available by default so existing signup tests that
  // don't care about duplicate detection aren't blocked by it; individual
  // tests below override these to exercise the "taken" paths.
  checkUsernameAvailable.mockResolvedValue(true);
  checkEmailAvailable.mockResolvedValue(true);
  checkPhoneAvailable.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeskAuthGate", () => {
  it("renders the app once a session exists", () => {
    useDeskSession.mockReturnValue({ status: "signed-in", userId: "u1", email: "a@example.com" });
    gate();
    expect(screen.getByText("Your work")).toBeInTheDocument();
  });

  it("shows sign-in, and no app content, when signed out", () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });
    gate();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("goes straight to the set-new-password screen on a recovery session, without waiting on AuthFlow's own detection", () => {
    // useDeskSession's "recovery" status carries everything AuthFlow needs
    // directly (see its doc comment): by the time AuthFlow could mount and
    // check for itself, Supabase has already consumed the one-time
    // PASSWORD_RECOVERY event, so recoveryCallback is deliberately left
    // unfired here.
    useDeskSession.mockReturnValue({ status: "recovery" });
    gate();
    expect(screen.getByText(/Set a new password/i)).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("shows the verification success screen, not app content, on an email-verified session", () => {
    const acknowledge = vi.fn();
    useDeskSession.mockReturnValue({ status: "email-verified", userId: "u1", email: "a@example.com", acknowledge });
    gate();
    expect(screen.getByText(/Email verified/i)).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("calls acknowledge() when Continue is clicked, so the app can actually be reached", () => {
    // Regression test: acknowledge() must be wired all the way from
    // useDeskSession through the /verify-email route to the success screen's
    // button — a version of this that only changed local screen state would
    // pass every other assertion here while still leaving the user
    // permanently stuck, since useDeskSession's session status is what
    // actually decides whether app content renders.
    const acknowledge = vi.fn();
    useDeskSession.mockReturnValue({ status: "email-verified", userId: "u1", email: "a@example.com", acknowledge });
    gate();

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(acknowledge).toHaveBeenCalled();
  });

  it("does not render app content while the session is still resolving", () => {
    useDeskSession.mockReturnValue({ status: "loading" });
    gate();
    // Rendering children optimistically here would flash the signed-in UI to
    // someone who turns out to be signed out.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("refuses to render app content when Supabase is not configured", () => {
    useDeskSession.mockReturnValue({ status: "unconfigured" });
    gate();
    // Failing open here would serve the whole client to anyone whenever the
    // env vars were missing — a misconfiguration becoming an access-control
    // failure. It fails closed, and says why.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign-in is not configured/i)).toBeInTheDocument();
  });
});

describe("browser history", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  it("Homepage -> Signup -> Back -> Homepage -> Forward -> Signup: the exact sequence broken by the reported bug", async () => {
    const locations: string[] = [];
    gate({ onLocationChange: (loc) => locations.push(loc.pathname) });
    expect(screen.getByRole("heading", { name: "SCHOLAR CORE" })).toBeInTheDocument();
    expect(locations.at(-1)).toBe("/");

    // Get Started must change the URL, not just what's on screen — this is
    // the direct fix for the reported bug.
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(locations.at(-1)).toBe("/signup");

    fireEvent.click(screen.getByRole("button", { name: "Test Back" }));
    expect(await screen.findByRole("heading", { name: "SCHOLAR CORE" })).toBeInTheDocument();
    expect(locations.at(-1)).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Test Forward" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(locations.at(-1)).toBe("/signup");
  });

  it("refreshing on /signup lands back on /signup, not the homepage", () => {
    gate({ initialEntries: ["/signup"] });
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  it("a signed-in visitor hitting /signup directly is redirected into the app, not shown a stale form", () => {
    useDeskSession.mockReturnValue({ status: "signed-in", userId: "u1", email: "a@example.com" });
    gate({ initialEntries: ["/signup"] });
    expect(screen.getByText("Your work")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create your account" })).not.toBeInTheDocument();
  });

  it("a signed-out visitor hitting a protected route directly is redirected to sign in, with a way back to it", async () => {
    gate({ initialEntries: ["/some/protected/path"] });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });
});

describe("sign in", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  function navigateToSignIn() {
    gate();
    // The landing page shows first; navigate to sign-in from there
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("labels its inputs, rather than relying on placeholders", () => {
    navigateToSignIn();
    // A placeholder is not a label: it vanishes on focus and is not reliably
    // announced.
    expect(screen.getByLabelText("User ID, email, or mobile number")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("keeps submit disabled until both fields are filled", () => {
    navigateToSignIn();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("surfaces a credentials failure as an announced error", async () => {
    signIn.mockResolvedValue({ success: false, error: "Incorrect password credentials." });
    navigateToSignIn();

    fireEvent.change(screen.getByLabelText("User ID, email, or mobile number"), { target: { value: "amara" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password credentials.");
  });

  it("does not navigate on success — the session subscription does that", async () => {
    navigateToSignIn();
    fireEvent.change(screen.getByLabelText("User ID, email, or mobile number"), { target: { value: "amara" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    // Still on sign-in: useDeskSession swaps the gate out when the session
    // appears. Routing here too would race that.
    //
    // findByRole (not getByRole): signIn having been called and the
    // component's busy-state finally{} block having re-rendered the button
    // back from "Signing in…" to "Sign in" are two separate microtask ticks —
    // asserting with a retrying query avoids racing that gap, which a
    // synchronous getByRole intermittently lost under a loaded CI runner.
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("registration", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  function navigateToSignUp() {
    gate();
    // The landing page shows first; navigate to sign-up from there
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
  }

  function openSignUp() {
    navigateToSignUp();
  }

  /** Fills every required field except whatever the caller omits, so a test can isolate one gating condition at a time. Institution is intentionally not included — it's optional. */
  function fillSignUpForm({ skip = [] as string[] } = {}) {
    const textFields: Array<[string, string]> = [
      ["Full name", "Amara Okafor"],
      ["Username", "amara"],
      ["Email", "amara@example.com"],
      ["Phone", "9800000000"],
      ["Password", "longenough1"],
    ];
    for (const [label, value] of textFields) {
      if (skip.includes(label)) continue;
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    if (!skip.includes("User Type")) {
      fireEvent.change(screen.getByLabelText("User Type"), { target: { value: "student" } });
    }
    if (!skip.includes("Level of Education")) {
      fireEvent.change(screen.getByLabelText("Level of Education"), { target: { value: "undergraduate" } });
    }
  }

  it("collects every field an administrator reviews, and none of the removed institutional-ID fields", () => {
    openSignUp();
    for (const label of ["Full name", "Username", "Email", "Phone", "Institution", "User Type", "Level of Education", "Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Institutional ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Institutional ID Document")).not.toBeInTheDocument();
    expect(screen.queryByText(/institutional id/i)).not.toBeInTheDocument();
  });

  it("keeps submit disabled until all required fields are valid", () => {
    openSignUp();
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();

    fillSignUpForm({ skip: ["Password"] });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    expect(submit).toBeEnabled();
  });

  it("allows submission with Institution left blank — it is optional", () => {
    openSignUp();
    fillSignUpForm();
    expect(screen.getByLabelText("Institution")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("checks username availability on blur and blocks submission when it's taken", async () => {
    checkUsernameAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Username"));

    expect(await screen.findByText(/username is already taken/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(checkUsernameAvailable).toHaveBeenCalledWith("amara");
  });

  it("checks email availability on blur and blocks submission when it's taken, suggesting sign-in", async () => {
    checkEmailAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Email"));

    expect(await screen.findByText(/email address is already registered/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in if this is your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  it("checks phone availability on blur and blocks submission when it's taken", async () => {
    checkPhoneAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Phone"));

    expect(await screen.findByText(/mobile number is already registered/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(checkPhoneAvailable).toHaveBeenCalledWith("+9779800000000");
  });

  it("re-checks availability once more at submit time as a defense against a check that never ran", async () => {
    // No blur ever fires here — this simulates every field being filled by
    // browser autofill and the user going straight to Create account, which
    // the on-blur checks alone would never catch.
    checkEmailAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    // Renders twice by design — once as the field-level error under Email,
    // once as the form-level AuthError — hence findAllByText, not findByText.
    await waitFor(() => expect(screen.getAllByText(/email address is already registered/i).length).toBeGreaterThan(0));
    expect(signUp).not.toHaveBeenCalled();
  });

  it("clears a stale 'taken' verdict once the field is edited to a different value", async () => {
    checkUsernameAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();
    fireEvent.blur(screen.getByLabelText("Username"));
    expect(await screen.findByText(/username is already taken/i)).toBeInTheDocument();

    checkUsernameAvailable.mockResolvedValue(true);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "amara2" } });
    expect(screen.queryByText(/username is already taken/i)).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Username"));
    await waitFor(() => expect(checkUsernameAvailable).toHaveBeenLastCalledWith("amara2"));
    expect(screen.queryByText(/username is already taken/i)).not.toBeInTheDocument();
  });

  it("shows a confirmation that the account was created", async () => {
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Account created/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Check your inbox/i);
  });

  it("passes the structured phone and role fields through to signUp", async () => {
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "9800000000",
          phoneCountryCode: "+977",
          userType: "student",
          educationLevel: "undergraduate",
        })
      )
    );
  });

  it.each([
    "scholar@gmail.com",
    "scholar@yahoo.com",
    "scholar@outlook.com",
    "scholar@protonmail.com",
    "scholar@tribhuvan.edu.np",
    "scholar@my-research-lab.org",
  ])("accepts %s — no Gmail-only or provider-specific restriction", async (email) => {
    openSignUp();
    fillSignUpForm();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email })));
  });
});

describe("password reset", () => {
  it("does not confirm whether an address has an account", async () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });
    gate();
    // Navigate through landing page to sign-in, then to Forgot password
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    // Confirming existence would turn this form into an account-enumeration
    // oracle, so the wording is conditional either way.
    expect(await screen.findByRole("status")).toHaveTextContent(/If an account exists/i);
  });

  // How a visitor's session actually becomes "recovery" — Supabase's
  // PASSWORD_RECOVERY event flipping useDeskSession's status (see its doc
  // comment) — and how that redirects them here from wherever they were is
  // covered by "goes straight to the set-new-password screen on a recovery
  // session" above (RequireRecovery reads that status fresh on every render,
  // the same as every other guard). These exercise the screen itself.
  describe("once on the set-new-password screen", () => {
    beforeEach(() => useDeskSession.mockReturnValue({ status: "recovery" }));

    it("blocks submission while the two passwords differ", () => {
      gate({ initialEntries: ["/reset-password/confirm"] });

      fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
      fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough2" } });

      expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);

      fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough1" } });
      expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled();
    });

    it("saves the new password through the auth service", async () => {
      gate({ initialEntries: ["/reset-password/confirm"] });

      fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
      fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough1" } });
      fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

      await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("longenough1"));
    });
  });
});
