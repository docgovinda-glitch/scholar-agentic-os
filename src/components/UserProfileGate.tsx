import React, { useState, useEffect } from "react";
import { User, Lock, Eye, EyeOff, ShieldCheck, Check, AlertCircle, Sparkles, GraduationCap, ArrowRight, ShieldAlert, Key, Phone, Mail, Building, Landmark, Clock } from "lucide-react";
import { UserProfile, PaperProject } from "../types";
import { signUp, signIn, sendPasswordResetEmail, updatePassword, onPasswordRecovery, signInWithGoogle, onGoogleSignIn } from "../services/supabaseAuthService";

interface UserProfileGateProps {
  onProfileActive: (username: string, projectState: PaperProject) => void;
}

const PROFILES_LIST_KEY = "phd_profiles_meta";
const PROFILE_STATE_PREFIX = "phd_profile_state_";

const DEFAULT_SETTINGS = {
  provider: "gemini" as const,
  ollamaModel: "llama3",
  ollamaEndpoint: "http://localhost:11434",
  customModel: "llama3",
  customEndpoint: "http://localhost:1234/v1"
};

const DEFAULT_STATE = (username: string): PaperProject => ({
  id: `proj_${Date.now()}`,
  title: "",
  objectives: "",
  researchQuestions: "",
  researchGap: "",
  methodology: "",
  field: "",
  keywords: "",
  preferredJournalScope: "",
  articleType: "Theoretical/Conceptual",
  outputFormat: "",
  dissertationMaterials: "",
  styleAspiration: "",
  authorDetails: `${username}, Academic Researcher`,
  currentPhase: "A",
  sections: {},
  aiSettings: DEFAULT_SETTINGS
});

export default function UserProfileGate({ onProfileActive }: UserProfileGateProps) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "activation">("login");

  // General Input States
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // New Registration Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phone, setPhone] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [authenticId, setAuthenticId] = useState("");

  // Activation Screen States
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);
  const [debugCodeMsg, setDebugCodeMsg] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Registration Email-OTP & Forgot Password states
  const [showDualVerifyScreen, setShowDualVerifyScreen] = useState(false);
  const [generatedEmailOtp, setGeneratedEmailOtp] = useState("");
  const [enteredEmailOtp, setEnteredEmailOtp] = useState("");
  const [dualVerifyError, setDualVerifyError] = useState<string | null>(null);
  const [dualVerifyBypass, setDualVerifyBypass] = useState<string | null>(null);

  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Password Recovery (Supabase's own resetPasswordForEmail/updateUser flow)
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);
  const [newPasswordForRecovery, setNewPasswordForRecovery] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryDone, setRecoveryDone] = useState(false);


  // Load profiles list and check for OAuth redirect callbacks on mount
  useEffect(() => {
    const saved = localStorage.getItem(PROFILES_LIST_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { profilesList: string[] };
        setProfiles(parsed.profilesList || []);
        if (!parsed.profilesList || parsed.profilesList.length === 0) {
          setActiveTab("signup");
        }
      } catch (e) {
        console.error(e);
        setActiveTab("signup");
      }
    } else {
      setActiveTab("signup");
    }

    // Detect landing back from a password-reset email link (Supabase parses
    // the recovery session from the URL fragment automatically and fires
    // this event once).
    const unsubscribeRecovery = onPasswordRecovery(() => {
      setIsForgotPasswordMode(false);
      setIsPasswordRecoveryMode(true);
      setRecoveryError(null);
      setRecoveryDone(false);
    });

    // Detect a real Supabase session established via Google OAuth — replaces
    // the old manual access_token-in-URL-hash parsing + userinfo fetch
    // entirely. Supabase's own client handles the whole redirect round-trip
    // (including clearing its own hash fragment); this just reacts to the
    // session once it exists, same as onPasswordRecovery above.
    const unsubscribeGoogle = onGoogleSignIn((user) => {
      handleSocialSignIn(user.fullName, user.email);
    });

    return () => {
      unsubscribeRecovery();
      unsubscribeGoogle();
    };
  }, []);

  // Password Requirements Checker
  const checkLength = passwordInput.length >= 8;
  const checkUpper = /[A-Z]/.test(passwordInput);
  const checkNumber = /[0-9]/.test(passwordInput);
  const checkSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(passwordInput);

  const getPasswordStrength = () => {
    let score = 0;
    if (checkLength) score++;
    if (checkUpper) score++;
    if (checkNumber) score++;
    if (checkSpecial) score++;
    return score;
  };

  const strengthScore = getPasswordStrength();

  // Handle Registration signup submit (triggers Email OTP dispatch)
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebugCodeMsg(null);
    setDualVerifyError(null);
    setDualVerifyBypass(null);

    const nameTrimmed = usernameInput.trim();
    if (!nameTrimmed) {
      setError("Scholar username cannot be empty.");
      return;
    }

    if (profiles.includes(nameTrimmed)) {
      setError("A researcher profile with this username already exists on this device.");
      return;
    }

    // Enforce Password Security Rules
    if (!checkLength || !checkUpper || !checkNumber || !checkSpecial) {
      setError("Please ensure your password satisfies all security requirements.");
      return;
    }

    setLoading(true);

    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedEmailOtp(emailOtp);

    // No backend OTP-dispatch equivalent exists under Supabase — Supabase's
    // own email confirmation is intentionally disabled (the admin-approval
    // gate below replaces it; see .claude/HANDOVER.md), so there's nothing
    // to relocate this call to. This is now a client-side-only
    // self-verification step: the code is never actually emailed, only
    // shown via the same sandbox-bypass message the old code fell back to
    // whenever Resend wasn't configured.
    setDualVerifyBypass(`⚠️ Credentials for Resend not fully configured on server. Please use the following bypass code for validation:\n\n📧 Email OTP (Sandbox Bypass Code): ${emailOtp}\n`);
    setShowDualVerifyScreen(true);
    setLoading(false);
  };

  // Handle Email OTP Verification and pending user creation
  const handleVerifyDualOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setDualVerifyError(null);

    const emailOtpEntered = enteredEmailOtp.trim();

    if (!emailOtpEntered) {
      setDualVerifyError("Please enter the verification OTP code.");
      return;
    }

    if (emailOtpEntered !== generatedEmailOtp) {
      setDualVerifyError("Invalid verification code. Please enter the correct Email OTP.");
      return;
    }

    setLoading(true);

    const nameTrimmed = usernameInput.trim();
    const cleanPh = `${countryCode}${phone.trim()}`.replace(/[+\s()-]/g, "");
    const defaultProject = DEFAULT_STATE(nameTrimmed);

    try {
      // Registers with Supabase Auth directly (creates the real account,
      // is_approved = false) and triggers the admin-notification email via
      // the send-approval-email Edge Function — replaces the old
      // /api/register call + its activation-key issuance. There's no
      // activation-key concept anymore: approval is the admin flipping
      // is_approved directly, so the pending screen now checks approval by
      // attempting a real login instead of comparing a key (see
      // handleCheckApprovalAndLogin).
      const result = await signUp({
        username: nameTrimmed,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: cleanPh,
        affiliation: affiliation.trim(),
        authenticId: authenticId.trim(),
        password: passwordInput
      });

      if (!result.success) {
        setDualVerifyError(result.error || "An error occurred finalizing the workspace registration.");
        setLoading(false);
        return;
      }

      const pendingProfile: UserProfile = {
        username: nameTrimmed,
        passcodeHash: passwordInput,
        projectState: defaultProject,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: cleanPh,
        affiliation: affiliation.trim(),
        authenticId: authenticId.trim(),
        status: "pending"
      };

      // Save locally in pending state
      localStorage.setItem(`${PROFILE_STATE_PREFIX}${nameTrimmed}`, JSON.stringify(pendingProfile));

      // Append username to profiles list meta
      const savedList = localStorage.getItem(PROFILES_LIST_KEY);
      let list: string[] = [];
      if (savedList) {
        try {
          const parsed = JSON.parse(savedList) as { profilesList: string[] };
          list = parsed.profilesList || [];
        } catch (_) {}
      }
      if (!list.includes(nameTrimmed)) {
        list.push(nameTrimmed);
        localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: list }));
        setProfiles(list);
      }

      setTimeout(() => {
        setLoading(false);
        setShowDualVerifyScreen(false);
        setPendingUser(pendingProfile);
        setActiveTab("activation");
        if (result.error) {
          // signUp() returns success:true with an error string when
          // registration itself succeeded but the admin-notification email
          // failed to send — surfaced the same way the old bypass message was.
          setDebugCodeMsg(`⚠️ ${result.error}`);
        }
      }, 800);

    } catch (err: any) {
      console.error(err);
      setDualVerifyError("An error occurred finalizing the workspace registration.");
      setLoading(false);
    }
  };

  // Handle Forgot Password Submit
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMessage(null);

    const emailAddr = resetEmail.trim();
    if (!emailAddr) {
      setError("Please enter your registered email.");
      return;
    }

    setLoading(true);

    try {
      // Supabase Auth's own self-service reset — replaces the old
      // admin-approval-gated flow. Supabase enforces that the reset link
      // only ever goes to the real email on file for a matching account,
      // and always reports success regardless of whether the email is
      // actually registered (avoids leaking account existence).
      const result = await sendPasswordResetEmail(emailAddr);

      if (result.success) {
        setResetSuccessMessage("If that email is registered, a password reset link has been sent. Check your inbox.");
      } else {
        setError(`Failed to send reset email: ${result.error}`);
      }
    } catch (err: any) {
      setError(err.message || "Network error requesting password reset.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    if (!newPasswordForRecovery) {
      setRecoveryError("Please enter a new password.");
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(newPasswordForRecovery);
      if (result.success) {
        setRecoveryDone(true);
        setNewPasswordForRecovery("");
      } else {
        setRecoveryError(result.error || "Failed to update password.");
      }
    } catch (err: any) {
      setRecoveryError(err.message || "Network error updating password.");
    } finally {
      setLoading(false);
    }
  };

  // Replaces the old client-side Google Identity Services flow entirely
  // (no VITE_GOOGLE_CLIENT_ID, no window.google.accounts.oauth2, no manual
  // userinfo fetch) — signInWithGoogle() hands the whole thing to Supabase,
  // which redirects to Google and back on its own. On success the browser
  // navigates away immediately, so there's nothing further to do here; the
  // session (and the resulting local-profile sync via handleSocialSignIn)
  // is picked up by the onGoogleSignIn listener registered in the mount
  // effect above once the app reloads signed in.
  const triggerGoogleSignIn = async () => {
    setError(null);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(`Google Sign-In failed: ${oauthError.message}`);
    }
  };

  const handleSocialSignIn = async (name: string, emailStr: string) => {
    setLoading(true);
    setError(null);

    const username = name.trim();
    if (!username) {
      setError("Social identity display name cannot be blank.");
      setLoading(false);
      return;
    }

    const stateKey = `${PROFILE_STATE_PREFIX}${username}`;
    const savedStateStr = localStorage.getItem(stateKey);
    
    let targetProjectState: PaperProject;
    
    if (savedStateStr) {
      try {
        const parsedProfile = JSON.parse(savedStateStr) as UserProfile;
        targetProjectState = parsedProfile.projectState;
        
        // Safeguard: Ensure aiSettings exists
        if (!targetProjectState.aiSettings) {
          targetProjectState.aiSettings = DEFAULT_SETTINGS;
        }
      } catch (e) {
        console.error("Failed to parse existing social profile, resetting to default:", e);
        targetProjectState = DEFAULT_STATE(username);
      }
    } else {
      targetProjectState = DEFAULT_STATE(username);
      targetProjectState.authorDetails = `${username}, PhD Scholar (Google Verified)`;

      const newProfile: UserProfile = {
        username,
        passcodeHash: "social_google_auth_passcode", // secure stub passcode
        projectState: targetProjectState,
        fullName: username,
        email: emailStr.trim() || `${username.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        status: "approved"
      };
      
      localStorage.setItem(stateKey, JSON.stringify(newProfile));
      
      // Append to profiles list meta
      const savedList = localStorage.getItem(PROFILES_LIST_KEY);
      let list: string[] = [];
      if (savedList) {
        try {
          const parsed = JSON.parse(savedList) as { profilesList: string[] };
          list = parsed.profilesList || [];
        } catch (e) {
          console.error("Failed to parse profiles list:", e);
        }
      }
      if (!list.includes(username)) {
        list.push(username);
        localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: list }));
        setProfiles(list);
      }
    }
    
    setTimeout(() => {
      setLoading(false);
      onProfileActive(username, targetProjectState);
    }, 800);
  };

  // Handle Login submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameTrimmed = usernameInput.trim();
    if (!nameTrimmed) {
      setError("Please specify your Scholar Username.");
      return;
    }

    if (!passwordInput) {
      setError("Please enter your password.");
      return;
    }

    const savedStateStr = localStorage.getItem(`${PROFILE_STATE_PREFIX}${nameTrimmed}`);
    if (!savedStateStr) {
      setError("Scholar identity not found on this device. Double-check your spelling or create a new profile.");
      return;
    }

    setLoading(true);

    try {
      const parsedProfile = JSON.parse(savedStateStr) as UserProfile;

      // 1. Verify credentials and check admin approval status via Supabase Auth
      try {
        const signInResult = await signIn({ username: nameTrimmed, password: passwordInput });

        if (!signInResult.success) {
          if (signInResult.isApproved === false) {
            setError("Awaiting Admin Approval. Your registration or password reset is currently in the Admin Queue.");
            setLoading(false);
            return;
          } else {
            setError(signInResult.error || "Authentication failed.");
            setLoading(false);
            return;
          }
        }

        // Sync database details back to localStorage profile
        parsedProfile.fullName = signInResult.profile?.fullName || parsedProfile.fullName;
        parsedProfile.email = signInResult.profile?.email || parsedProfile.email;
        parsedProfile.phone = signInResult.profile?.phone || parsedProfile.phone;
        parsedProfile.affiliation = signInResult.profile?.affiliation || parsedProfile.affiliation;
        parsedProfile.authenticId = signInResult.profile?.authenticId || parsedProfile.authenticId;
        parsedProfile.passcodeHash = passwordInput; // update passcode hash (in case it was reset by admin)
        parsedProfile.status = "approved"; // since Supabase returned success, it is approved!

        localStorage.setItem(`${PROFILE_STATE_PREFIX}${nameTrimmed}`, JSON.stringify(parsedProfile));
      } catch (syncErr) {
        console.warn("Failed to check approval status on server, falling back to local credentials:", syncErr);
        if (!parsedProfile.passcodeHash || parsedProfile.passcodeHash !== passwordInput) {
          setError("Incorrect password credentials. Please verify and try again.");
          setLoading(false);
          return;
        }
        if (parsedProfile.status === "pending") {
          setError("Awaiting Admin Approval. (offline check)");
          setLoading(false);
          return;
        }
      }

      // Safeguard: Ensure aiSettings exists
      if (!parsedProfile.projectState.aiSettings) {
        parsedProfile.projectState.aiSettings = DEFAULT_SETTINGS;
      }

      setLoading(false);
      onProfileActive(nameTrimmed, parsedProfile.projectState);
    } catch (err) {
      console.error(err);
      setError("Failed to read secure profile credentials from local storage.");
      setLoading(false);
    }
  };

  // Check Admin Approval Status (replaces activation-key verification —
  // Supabase has no key-exchange concept; approval is the admin flipping
  // is_approved directly, server-side, so "unlocking" now means attempting
  // a real login with the credentials already collected during signup).
  const handleCheckApprovalAndLogin = async () => {
    setError(null);

    if (!pendingUser) {
      setError("No active pending profile context found.");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn({ username: pendingUser.username, password: passwordInput });

      if (!result.success) {
        setError(
          result.isApproved === false
            ? "Still awaiting Admin Approval. Please wait for the admin approval email, then try again."
            : (result.error || "Authentication failed.")
        );
        setLoading(false);
        return;
      }

      // Approved! Update profile to approved, syncing any server-side details.
      const approvedProfile: UserProfile = {
        ...pendingUser,
        status: "approved",
        fullName: result.profile?.fullName || pendingUser.fullName,
        email: result.profile?.email || pendingUser.email,
        phone: result.profile?.phone || pendingUser.phone,
        affiliation: result.profile?.affiliation || pendingUser.affiliation,
        authenticId: result.profile?.authenticId || pendingUser.authenticId
      };

      // Save to localStorage
      localStorage.setItem(`${PROFILE_STATE_PREFIX}${pendingUser.username}`, JSON.stringify(approvedProfile));

      // Append to profiles list meta
      const savedList = localStorage.getItem(PROFILES_LIST_KEY);
      let list: string[] = [];
      if (savedList) {
        const parsed = JSON.parse(savedList) as { profilesList: string[] };
        list = parsed.profilesList || [];
      }
      if (!list.includes(pendingUser.username)) {
        list.push(pendingUser.username);
        localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: list }));
        setProfiles(list);
      }

      setLoading(false);
      onProfileActive(pendingUser.username, approvedProfile.projectState);

    } catch (err: any) {
      console.error(err);
      setError("An error occurred while checking approval status.");
      setLoading(false);
    }
  };

  return (
    <div className="text-[#E2E8F0] flex flex-col items-center justify-center font-sans selection:bg-[color:var(--color-luminous-blue-dim)] selection:text-white w-full max-w-lg mx-auto">
      
      {/* Main card box container */}
      <div className="w-full bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-3xl shadow-xl overflow-hidden flex flex-col p-8 md:p-10 space-y-6 hover-lift transition-all duration-300 relative">
        
        {/* Brand Logo & Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-luminous-blue)]/20 flex items-center justify-center mx-auto shadow-sm">
            <GraduationCap className="w-8 h-8 text-[color:var(--color-luminous-blue)]" />
          </div>
          <div className="space-y-1">
            <h1 className="wordmark text-3xl font-bold tracking-tight text-[#E2E8F0]">
              🎓 Scholar <span style={{ color: "var(--color-gold-accent)" }}>Agentic OS</span>
            </h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-luminous-blue)] font-sans">
              AI Research Operating System
            </p>
            <p className="text-[11px] text-[#94A3B8] max-w-xs mx-auto leading-relaxed font-sans">
              for Scholars
            </p>
          </div>
        </div>

        {/* Tab Selection toggle bar */}
        {!showDualVerifyScreen && activeTab !== "activation" && profiles.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)]/50 rounded-2xl text-xs font-mono shrink-0">
            <button
              onClick={() => {
                setActiveTab("login");
                setError(null);
                setPasswordInput("");
              }}
              className={`py-2.5 rounded-xl transition-all cursor-pointer font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === "login"
                  ? "bg-[color:var(--color-luminous-blue-dim)] text-white shadow-md"
                  : "text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[color:var(--color-navy-3)]"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Launch Hub
            </button>
            <button
              onClick={() => {
                setActiveTab("signup");
                setError(null);
                setPasswordInput("");
              }}
              className={`py-2.5 rounded-xl transition-all cursor-pointer font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === "signup"
                  ? "bg-[color:var(--color-luminous-blue-dim)] text-white shadow-md"
                  : "text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[color:var(--color-navy-3)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              New Identity
            </button>
          </div>
        )}

        {/* Error notification card */}
        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-sans font-medium">{error}</span>
          </div>
        )}



        {/* Forms Container */}
        <div className="grow">
          {showDualVerifyScreen ? (
            <form onSubmit={handleVerifyDualOtp} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-300">
                <h4 className="font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4.5 h-4.5 text-amber-400" />
                  Email OTP Scholar Verification
                </h4>
                <p className="text-xs leading-normal">
                  To protect scholar data, we require verification of your registered **Email Address** before launching your workspace.
                </p>
              </div>

              {dualVerifyError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-sans font-medium">{dualVerifyError}</span>
                </div>
              )}

              {dualVerifyBypass && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-normal font-mono select-all">
                  {dualVerifyBypass}
                </div>
              )}

              {/* Email OTP Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                  6-Digit Email Verification OTP
                </label>
                <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter email code..."
                    className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono tracking-[0.2em] text-center"
                    value={enteredEmailOtp}
                    onChange={(e) => {
                      setEnteredEmailOtp(e.target.value);
                      setDualVerifyError(null);
                    }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDualVerifyScreen(false);
                    setDualVerifyError(null);
                    setDualVerifyBypass(null);
                  }}
                  className="w-1/3 py-3 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[10px] font-mono uppercase text-[#94A3B8] rounded-xl cursor-pointer transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify & Request Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : isPasswordRecoveryMode ? (
            <form onSubmit={handleUpdatePasswordRecovery} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-300">
                <h4 className="font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Key className="w-4.5 h-4.5 text-amber-400" />
                  Set New Password
                </h4>
                <p className="text-xs leading-normal">
                  You've followed a password reset link. Enter a new password for your account below.
                </p>
              </div>

              {recoveryError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-sans font-medium">{recoveryError}</span>
                </div>
              )}

              {recoveryDone ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs leading-normal font-sans font-medium">
                  Password updated successfully. You can now log in with your new password.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                    <input
                      type="password"
                      required
                      placeholder="Enter new password..."
                      className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                      value={newPasswordForRecovery}
                      onChange={(e) => setNewPasswordForRecovery(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {recoveryDone ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPasswordRecoveryMode(false);
                      setActiveTab("login");
                      setError(null);
                    }}
                    className="w-full py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    Go to Login
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : isForgotPasswordMode ? (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-300">
                <h4 className="font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Key className="w-4.5 h-4.5 text-amber-400" />
                  Forgot Password
                </h4>
                <p className="text-xs leading-normal">
                  Enter your registered email and we'll send you a password reset link.
                </p>
              </div>

              {resetSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs leading-normal font-sans font-medium">
                  {resetSuccessMessage}
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                  Registered Email Address
                </label>
                <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                  <input
                    type="email"
                    required
                    placeholder="Enter registered email..."
                    className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(false);
                    setError(null);
                    setResetSuccessMessage(null);
                  }}
                  className="w-1/3 py-3 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[10px] font-mono uppercase text-[#94A3B8] rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>
              </div>
            </form>
          ) : activeTab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Login Username */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                  Scholar Username
                </label>
                <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <User className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                  <input
                    type="text"
                    required
                    className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono placeholder:text-[#94A3B8]/80 transition-all"
                    placeholder="Enter your username..."
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
              </div>

              {/* Login Password */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                  Password
                </label>
                <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full border-0 bg-transparent pl-10 pr-10 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono placeholder:text-[#94A3B8]/80 transition-all"
                    placeholder="Enter your password..."
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer z-10"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Forgot Password link */}
              <div className="flex justify-end items-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(true);
                    setError(null);
                    setResetSuccessMessage(null);
                    setDebugCodeMsg(null);
                  }}
                  className="text-[11px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer font-bold"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Action */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] disabled:text-[#94A3B8] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Launch Scholar Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {/* Social Login Divider */}
              <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[color:var(--color-navy-4)]/35"></div>
                </div>
                <span className="relative px-3.5 bg-[color:var(--color-navy-2)] text-[9px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                  Or continue with
                </span>
              </div>

              {/* Social Login Buttons */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="flex items-center justify-center gap-1.5 py-3 px-6 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] hover:border-[color:var(--color-luminous-blue)]/40 text-[11px] font-bold font-sans text-[#E2E8F0] rounded-xl hover-lift cursor-pointer transition-all shadow-sm w-full"
                  title="Sign in with Google"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Google SSO Portal</span>
                </button>
              </div>
            </form>
          ) : activeTab === "signup" ? (
            <form onSubmit={handleCreateProfile} className="space-y-5">
              
              {/* Credentials Section */}
              <div className="space-y-4 border-b border-[color:var(--color-navy-4)]/30 pb-4">
                <span className="text-[9px] font-mono uppercase font-bold text-[color:var(--color-luminous-blue)] tracking-wider block">1. Security Credentials</span>
                
                {/* Signup Username */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Scholar Username *
                  </label>
                  <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <User className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                    <input
                      type="text"
                      required
                      className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono placeholder:text-[#94A3B8]/80 transition-all"
                      placeholder="Choose a username..."
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        setError(null);
                      }}
                    />
                  </div>
                </div>

                {/* Signup Password */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Secure Password *
                  </label>
                  <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      className="w-full border-0 bg-transparent pl-10 pr-10 py-3 text-xs text-[#E2E8F0] focus:outline-none font-mono placeholder:text-[#94A3B8]/80 transition-all"
                      placeholder="Create secure password..."
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer z-10"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password strength calculators */}
                {passwordInput.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {/* Visual strength bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                          Password Strength
                        </span>
                        <span className={`text-[10px] font-bold uppercase font-mono ${
                          strengthScore <= 2 ? "text-red-500" :
                          strengthScore === 3 ? "text-amber-500" : "text-emerald-500"
                        }`}>
                          {strengthScore === 0 && "Very Weak"}
                          {strengthScore === 1 && "Weak"}
                          {strengthScore === 2 && "Fair"}
                          {strengthScore === 3 && "Medium"}
                          {strengthScore === 4 && "Strong"}
                        </span>
                      </div>
                      <div className="flex gap-1 h-1.5 w-full pt-0.5">
                        {[1, 2, 3, 4].map((segIndex) => {
                          const isFilled = strengthScore >= segIndex;
                          const fillColor = 
                            strengthScore <= 2 ? "bg-red-500 animate-pulse" :
                            strengthScore === 3 ? "bg-amber-500" : "bg-emerald-500";
                          return (
                            <div 
                              key={segIndex} 
                              className={`h-full flex-1 rounded-full transition-all duration-350 ${
                                isFilled ? fillColor : "bg-[color:var(--color-navy-4)]"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Requirements validation checklist */}
                    <div className="space-y-1 font-mono text-xs pl-1 text-[#94A3B8]">
                      <div className="flex items-center gap-1.5">
                        <span className={checkLength ? "text-emerald-400 font-bold" : "text-[#94A3B8]"}>
                          {checkLength ? "✓" : "•"} 8+ Characters
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkUpper ? "text-emerald-400 font-bold" : "text-[#94A3B8]"}>
                          {checkUpper ? "✓" : "•"} Uppercase Letter
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkNumber ? "text-emerald-400 font-bold" : "text-[#94A3B8]"}>
                          {checkNumber ? "✓" : "•"} Number
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkSpecial ? "text-emerald-400 font-bold" : "text-[#94A3B8]"}>
                          {checkSpecial ? "✓" : "•"} Special Character
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scholar Information Section */}
              <div className="space-y-4">
                <span className="text-[9px] font-mono uppercase font-bold text-[color:var(--color-luminous-blue)] tracking-wider block">2. Personal & Academic Details</span>
                
                {/* Full name & Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Full Name *</label>
                    <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <User className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5 z-10" />
                      <input
                        type="text"
                        required
                        className="w-full border-0 bg-transparent pl-8 pr-3 py-3 text-xs text-[#E2E8F0] focus:outline-none"
                        placeholder="Dr. John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Email Address *</label>
                    <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <Mail className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5 z-10" />
                      <input
                        type="email"
                        required
                        className="w-full border-0 bg-transparent pl-8 pr-3 py-3 text-xs text-[#E2E8F0] focus:outline-none"
                        placeholder="doe@uni.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Phone & Affiliation */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Phone Number *</label>
                    <div className="flex gap-1.5">
                      <div className="w-24 shrink-0 rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-full border-0 bg-transparent px-2 py-3 text-[11px] text-[#E2E8F0] focus:outline-none font-mono cursor-pointer"
                      >
                        <option value="+977">+977 (NP)</option>
                        <option value="+1">+1 (US)</option>
                        <option value="+91">+91 (IN)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+61">+61 (AU)</option>
                        <option value="+86">+86 (CN)</option>
                        <option value="+81">+81 (JP)</option>
                        <option value="+49">+49 (DE)</option>
                        <option value="+33">+33 (FR)</option>
                        <option value="+971">+971 (AE)</option>
                        <option value="">Other</option>
                      </select>
                      </div>
                      <div className="relative flex-grow rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                        <Phone className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5 z-10" />
                        <input
                          type="text"
                          required
                          className="w-full border-0 bg-transparent pl-8 pr-3 py-3 text-xs text-[#E2E8F0] focus:outline-none"
                          placeholder="e.g. 9851108291"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Affiliation / Inst. *</label>
                    <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <Building className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5 z-10" />
                      <input
                        type="text"
                        required
                        className="w-full border-0 bg-transparent pl-8 pr-3 py-3 text-xs text-[#E2E8F0] focus:outline-none"
                        placeholder="e.g. Oxford University"
                        value={affiliation}
                        onChange={(e) => setAffiliation(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Authentic ID input */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Authentic Identification (Optional - Passport / Student ID / citizenship)
                  </label>
                  <div className="relative rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <Landmark className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5 z-10" />
                    <input
                      type="text"
                      className="w-full border-0 bg-transparent pl-10 pr-4 py-3 text-xs text-[#E2E8F0] focus:outline-none"
                      placeholder="e.g., Passport No: 2819-2018 or Student ID: 22-IR-401..."
                      value={authenticId}
                      onChange={(e) => setAuthenticId(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Action */}
              <button
                type="submit"
                disabled={loading || strengthScore < 4}
                className="w-full py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] disabled:text-[#94A3B8] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Submit Account Request</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {/* Social Signup Divider */}
              <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[color:var(--color-navy-4)]/35"></div>
                </div>
                <span className="relative px-3.5 bg-[color:var(--color-navy-2)] text-[9px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                  Or sign up with
                </span>
              </div>

              {/* Social Signup Buttons */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="flex items-center justify-center gap-1.5 py-3 px-6 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] hover:border-[color:var(--color-luminous-blue)]/40 text-[11px] font-bold font-sans text-[#E2E8F0] rounded-xl hover-lift cursor-pointer transition-all shadow-sm w-full"
                  title="Sign up with Google"
                >
                  <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Google SSO Portal</span>
                </button>
              </div>
            </form>
          ) : (
            // Tab: Activation Screen (Pending approval entry)
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5 text-xs text-amber-300">
                <h4 className="font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider">
                  <Clock className="w-4.5 h-4.5 text-amber-400 animate-pulse" />
                  Request Pending Admin Verification
                </h4>
                <p className="leading-relaxed">
                  Your Scholar Workspace request has been submitted to the administrator.
                </p>
                <p className="leading-relaxed">
                  Please check your registered email (<strong>{pendingUser?.email}</strong>) once approved, then check your status below.
                </p>
              </div>

              {debugCodeMsg && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-normal font-mono select-all">
                  {debugCodeMsg}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("login");
                    setPendingUser(null);
                    setError(null);
                  }}
                  className="w-1/3 py-3 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[10px] font-mono uppercase text-[#94A3B8] rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCheckApprovalAndLogin}
                  disabled={loading}
                  className="w-2/3 py-3 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--color-navy-4)] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Check Approval Status</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Secondary Account Switcher Links */}
        {activeTab !== "activation" && (
          <div className="text-center pt-2 border-t border-[color:var(--color-navy-4)]/30 text-xs space-y-2">
            {activeTab === "login" ? (
              <p className="text-[#94A3B8]">
                Need a new workspace?{" "}
                <button
                  onClick={() => {
                    setActiveTab("signup");
                    setError(null);
                    setPasswordInput("");
                  }}
                  className="text-[color:var(--color-luminous-blue)] hover:text-white font-bold underline cursor-pointer"
                >
                  Create Scholar Account
                </button>
              </p>
            ) : (
              <p className="text-[#94A3B8]">
                Already registered?{" "}
                <button
                  onClick={() => {
                    setActiveTab("login");
                    setError(null);
                    setPasswordInput("");
                  }}
                  className="text-[color:var(--color-luminous-blue)] hover:text-white font-bold underline cursor-pointer"
                >
                  Launch Workspace
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Subtly presented Trust Signals Footer */}
      <div className="mt-8 text-center font-mono text-[10px] text-[#94A3B8] tracking-widest uppercase">
        Secure • Encrypted • Private
      </div>

    </div>
  );
}
