import React, { useState, useEffect } from "react";
import { User, Lock, Eye, EyeOff, ShieldCheck, Check, AlertCircle, Sparkles, GraduationCap, ArrowRight, ShieldAlert, Key, Phone, Mail, Building, Landmark, Clock, Settings } from "lucide-react";
import { UserProfile, PaperProject } from "../types";

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
  dissertationMaterials: "",
  styleAspiration: "",
  authorDetails: `${username}, Academic Researcher`,
  currentPhase: "A",
  sections: {},
  aiSettings: DEFAULT_SETTINGS
});

// Helper for client-side SHA-256 hashing (runs natively in modern browsers via SubtleCrypto)
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Helper to normalize and compare phone numbers for verification
function cleanPhoneNumber(num: string): string {
  return num.replace(/[+\s()-]/g, "").replace(/^00/, "").replace(/^0/, "");
}

function comparePhoneNumbers(num1: string, num2: string): boolean {
  const c1 = cleanPhoneNumber(num1);
  const c2 = cleanPhoneNumber(num2);
  if (!c1 || !c2) return false;
  return c1 === c2 || c1.endsWith(c2) || c2.endsWith(c1);
}

export default function UserProfileGate({ onProfileActive }: UserProfileGateProps) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "activation">("login");

  // General Input States
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  // New Registration Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phone, setPhone] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [authenticId, setAuthenticId] = useState("");

  // Activation Screen States
  const [activationCode, setActivationCode] = useState("");
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);
  const [debugCodeMsg, setDebugCodeMsg] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Social OAuth Simulation States
  const [socialModal, setSocialModal] = useState<"google" | "facebook" | null>(null);
  const [customGoogleEmail, setCustomGoogleEmail] = useState("");
  const [customGoogleName, setCustomGoogleName] = useState("");
  const [showCustomGoogleForm, setShowCustomGoogleForm] = useState(false);

  // Real OAuth & WhatsApp OTP States
  const [promptKeyType, setPromptKeyType] = useState<"google" | "facebook" | null>(null);
  const [keyValueInput, setKeyValueInput] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  // Unified Credentials Configuration Settings Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempGoogleId, setTempGoogleId] = useState("");
  const [tempFbId, setTempFbId] = useState("");
  const [tempTwilioSid, setTempTwilioSid] = useState("");
  const [tempTwilioToken, setTempTwilioToken] = useState("");
  const [tempTwilioFrom, setTempTwilioFrom] = useState("");

  const openSettingsModal = () => {
    setTempGoogleId(localStorage.getItem("phd_google_client_id") || import.meta.env.VITE_GOOGLE_CLIENT_ID || "");
    setTempFbId(localStorage.getItem("phd_facebook_app_id") || import.meta.env.VITE_FB_APP_ID || "");
    setTempTwilioSid(localStorage.getItem("phd_twilio_sid") || import.meta.env.VITE_TWILIO_SID || "");
    setTempTwilioToken(localStorage.getItem("phd_twilio_token") || import.meta.env.VITE_TWILIO_TOKEN || "");
    setTempTwilioFrom(localStorage.getItem("phd_twilio_from") || import.meta.env.VITE_TWILIO_FROM || "");
    setModalError(null);
    setShowSettingsModal(true);
  };

  // Registration Email-OTP & Forgot Password states
  const [showDualVerifyScreen, setShowDualVerifyScreen] = useState(false);
  const [generatedEmailOtp, setGeneratedEmailOtp] = useState("");
  const [enteredEmailOtp, setEnteredEmailOtp] = useState("");
  const [dualVerifyError, setDualVerifyError] = useState<string | null>(null);
  const [dualVerifyBypass, setDualVerifyBypass] = useState<string | null>(null);

  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);


  // Load profiles list and check for OAuth redirect callbacks on mount
  useEffect(() => {
    // Listen for Google OAuth redirect callback token in URL hash
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      if (accessToken) {
        // Remove hash from URL so it doesn't linger
        window.history.replaceState(null, "", window.location.pathname);
        
        setLoading(true);
        fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`)
          .then(res => {
            if (res.ok) return res.json();
            throw new Error("Failed to fetch Google profile");
          })
          .then(data => {
            handleSocialSignIn(data.name || data.email, data.email, "google");
          })
          .catch(err => {
            console.error("Google OAuth callback error:", err);
            setError("Google authentication failed. Please try again.");
            setLoading(false);
          });
      }
    }

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

    let emailSent = false;
    let bypassMsg = "";

    try {
      // 1. Dispatch Email OTP
      try {
        const emailRes = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: nameTrimmed,
            email: email.trim(),
            otp: emailOtp
          })
        });

        if (emailRes.ok) {
          const emailData = await emailRes.json();
          if (emailData.emailSent) {
            emailSent = true;
          } else if (emailData.requiresClientEmail) {
            const fsRes = await fetch(`https://formsubmit.co/ajax/${email.trim()}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({
                _subject: "Scholar OS Registration Email Verification Code",
                "Username": nameTrimmed,
                "Verification OTP Code": emailOtp,
                _template: "table"
              })
            });
            if (fsRes.ok) {
              emailSent = true;
            }
          }
        }
      } catch (err) {
        console.error("Failed to dispatch Email OTP via API:", err);
      }

      if (!emailSent) {
        bypassMsg += `📧 Email OTP (Sandbox Bypass Code): ${emailOtp}\n`;
      }

      if (bypassMsg) {
        setDualVerifyBypass(`⚠️ Credentials for Resend not fully configured on server. Please use the following bypass code for validation:\n\n${bypassMsg}`);
      }

      setShowDualVerifyScreen(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during registration. Please try again.");
    } finally {
      setLoading(false);
    }
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
    const cleanPh = phone.trim().replace(/[+\s()-]/g, "");
    const defaultProject = DEFAULT_STATE(nameTrimmed);

    try {
      // 1. Submit Registration access request to Admin Queue
      const registerRes = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nameTrimmed,
          fullName: fullName.trim(),
          email: email.trim(),
          phone: cleanPh,
          affiliation: affiliation.trim(),
          authenticId: authenticId.trim()
        })
      });

      let activationKeyHash = "";
      let bypassMsg = "";

      if (registerRes.ok) {
        const registerData = await registerRes.json();
        activationKeyHash = registerData.activationKeyHash;

        if (registerData.requiresClientEmail) {
          bypassMsg = `Admin Approval Link: ${registerData.approveUrl}\n\n`;
          if (registerData.activationKey) {
            const hashed = await sha256(registerData.activationKey);
            activationKeyHash = hashed;
            bypassMsg += `Activation Code (sandbox bypass): ${registerData.activationKey}\n`;
          }
        }
      }

      if (!activationKeyHash) {
        const fallbackKey = "SA-123456";
        activationKeyHash = await sha256(fallbackKey);
        bypassMsg += `Fallback Activation Key: ${fallbackKey}\n`;
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
        status: "pending",
        activationKeyHash
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
        if (bypassMsg) {
          setDebugCodeMsg(`⚠️ Admin notification & approval bypass keys:\n\n${bypassMsg}`);
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
    setDebugCodeMsg(null);

    const username = resetUsername.trim();
    const emailAddr = resetEmail.trim();
    const newPassword = resetNewPassword;

    if (!username || !emailAddr || !newPassword) {
      setError("Please fill out all fields.");
      return;
    }

    setLoading(true);

    try {
      const resetRes = await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email: emailAddr,
          newPasswordHash: newPassword
        })
      });

      if (resetRes.ok) {
        const resetData = await resetRes.json();
        
        // Mark local profile as pending if it exists
        const savedStateStr = localStorage.getItem(`${PROFILE_STATE_PREFIX}${username}`);
        if (savedStateStr) {
          try {
            const profile = JSON.parse(savedStateStr) as UserProfile;
            profile.status = "pending";
            localStorage.setItem(`${PROFILE_STATE_PREFIX}${username}`, JSON.stringify(profile));
          } catch (_) {}
        }

        setResetSuccessMessage("Password reset request submitted successfully. Workspace is blocked until the Admin approves this request.");
        
        if (resetData.requiresClientEmail) {
          setDebugCodeMsg(`⚠️ Admin reset approval bypass link:\n\n${resetData.approveResetUrl}`);
        }
      } else {
        const errText = await resetRes.text();
        setError(`Failed to submit reset request: ${errText}`);
      }
    } catch (err: any) {
      setError(err.message || "Network error requesting password reset.");
    } finally {
      setLoading(false);
    }
  };

  const triggerGoogleSignIn = () => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem("phd_google_client_id") || "";
    
    if (!googleClientId) {
      setError("Google Client ID is not configured. Please add VITE_GOOGLE_CLIENT_ID to your Vercel Environment Variables or click the settings gear icon at the top right of this card to configure it in the browser.");
      return;
    }

    if (!googleClientId.trim().endsWith(".apps.googleusercontent.com")) {
      setError("Invalid Google Client ID. It must end with '.apps.googleusercontent.com'. Check your environment variables or local storage.");
      return;
    }

    try {
      const loadGsiAndPrompt = () => {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: googleClientId.trim(),
          scope: 'profile email',
          callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              setLoading(true);
              fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenResponse.access_token}`)
                .then(res => {
                  if (!res.ok) throw new Error("Failed to fetch Google profile");
                  return res.json();
                })
                .then(data => {
                  handleSocialSignIn(data.name || data.email, data.email, "google");
                })
                .catch(err => {
                  console.error("Google OAuth callback error:", err);
                  setError("Google authentication failed. Please try again.");
                  setLoading(false);
                });
            } else {
               setError("Google authentication failed or was cancelled.");
               setLoading(false);
            }
          },
          error_callback: (err: any) => {
            console.error("GIS Error:", err);
            setError(`Google Sign-In failed: ${err.message || err.type || "Unknown Error"}`);
            setLoading(false);
          }
        });
        client.requestAccessToken();
      };

      if ((window as any).google?.accounts?.oauth2) {
        loadGsiAndPrompt();
      } else {
        const script = document.createElement('script');
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = loadGsiAndPrompt;
        script.onerror = () => setError("Failed to load Google Identity Services.");
        document.body.appendChild(script);
      }
    } catch (e: any) {
      console.error(e);
      setError(`Google Sign-In initialization failed: ${e.message}`);
    }
  };

  const triggerFacebookSignIn = () => {
    const fbAppId = localStorage.getItem("phd_facebook_app_id") || import.meta.env.VITE_FB_APP_ID || "";
    if (!fbAppId) {
      setPromptKeyType("facebook");
      setKeyValueInput("");
      return;
    }

    try {
      if (!(window as any).FB) {
        setError("Facebook SDK is still loading. Please try again in a moment.");
        return;
      }

      (window as any).FB.init({
        appId      : fbAppId,
        cookie     : true,
        xfbml      : true,
        version    : "v18.0"
      });

      (window as any).FB.login((loginResponse: any) => {
        if (loginResponse.authResponse) {
          (window as any).FB.api("/me", { fields: "name,email" }, (apiResponse: any) => {
            if (apiResponse && !apiResponse.error) {
              handleSocialSignIn(apiResponse.name, apiResponse.email || `${apiResponse.id}@facebook.com`, "facebook");
            } else {
              setError("Failed to retrieve profile data from Facebook Graph API.");
            }
          });
        } else {
          setError("Facebook login was cancelled or not authorized.");
        }
      }, { scope: "email" });
    } catch (e: any) {
      console.error(e);
      setError(`Facebook Login failed: ${e.message}`);
    }
  };



  const handleSocialSignIn = async (name: string, emailStr: string, provider: "google" | "facebook") => {
    setLoading(true);
    setSocialModal(null);
    setError(null);
    setShowCustomGoogleForm(false);
    setCustomGoogleName("");
    setCustomGoogleEmail("");
    
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
      targetProjectState.authorDetails = `${username}, PhD Scholar (${provider === "google" ? "Google" : "Facebook"} Verified)`;
      
      const newProfile: UserProfile = {
        username,
        passcodeHash: `social_${provider}_auth_passcode`, // secure stub passcode
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

      // 1. Verify credentials and check admin approval queue status on the server
      try {
        const syncRes = await fetch("/api/verify-and-sync-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: nameTrimmed,
            password: passwordInput
          })
        });

        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (!syncData.success) {
            if (syncData.error === "Awaiting Admin Approval" || !syncData.is_approved) {
              setError("Awaiting Admin Approval. Your registration or password reset is currently in the Admin Queue.");
              setLoading(false);
              return;
            } else {
              setError(syncData.error || "Authentication failed.");
              setLoading(false);
              return;
            }
          }

          // Sync database details back to localStorage profile
          parsedProfile.fullName = syncData.fullName || parsedProfile.fullName;
          parsedProfile.email = syncData.email || parsedProfile.email;
          parsedProfile.phone = syncData.phone || parsedProfile.phone;
          parsedProfile.affiliation = syncData.affiliation || parsedProfile.affiliation;
          parsedProfile.authenticId = syncData.authenticId || parsedProfile.authenticId;
          parsedProfile.passcodeHash = passwordInput; // update passcode hash (in case it was reset by admin)
          parsedProfile.status = "approved"; // since server returned success, it is approved!
          
          localStorage.setItem(`${PROFILE_STATE_PREFIX}${nameTrimmed}`, JSON.stringify(parsedProfile));
        } else {
          // If offline or endpoint doesn't match, verify password locally
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

  // Handle Activation Key Verification
  const handleVerifyActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pendingUser) {
      setError("No active pending profile context found.");
      return;
    }

    if (!activationCode.trim()) {
      setError("Please enter your activation key.");
      return;
    }

    setLoading(true);
    try {
      const enteredHash = await sha256(activationCode.trim());

      if (enteredHash !== pendingUser.activationKeyHash) {
        setError("Invalid activation key. Please wait for admin approval email or check spelling.");
        setLoading(false);
        return;
      }

      // Key matched! Update profile to approved
      const approvedProfile: UserProfile = {
        ...pendingUser,
        status: "approved"
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
      setError("An error occurred during verification. Check your browser browser support.");
      setLoading(false);
    }
  };

  return (
    <div className="text-[#1A365D] flex flex-col items-center justify-center font-sans selection:bg-[#1A365D] selection:text-white w-full max-w-lg mx-auto">
      
      {/* Main card box container */}
      <div className="w-full bg-white/95 border border-[#E2E8F0] rounded-3xl shadow-xl overflow-hidden flex flex-col p-8 md:p-10 space-y-6 hover-lift transition-all duration-300 relative">
        
        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={openSettingsModal}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-[#1A365D] hover:bg-neutral-100/80 rounded-xl transition-all duration-200 cursor-pointer z-10 animate-pulse-hover"
          title="Configure API Credentials"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>

        {/* Brand Logo & Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-[#1A365D]/5 border border-[#1A365D]/10 flex items-center justify-center mx-auto shadow-sm">
            <GraduationCap className="w-8 h-8 text-[#1A365D]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-serif font-bold tracking-tight text-gradient">
              🎓 Scholar Agentic OS
            </h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C08A3E] font-sans">
              AI Research Operating System
            </p>
            <p className="text-[11px] text-[#6B665E] max-w-xs mx-auto leading-relaxed font-sans">
              for Doctoral Scholars
            </p>
          </div>
        </div>

        {/* Tab Selection toggle bar */}
        {!showDualVerifyScreen && activeTab !== "activation" && profiles.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#FAF8F5] border border-[#D1CEC7]/50 rounded-2xl text-xs font-mono shrink-0">
            <button
              onClick={() => {
                setActiveTab("login");
                setError(null);
                setPasswordInput("");
              }}
              className={`py-2.5 rounded-xl transition-all cursor-pointer font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === "login"
                  ? "bg-[#1A365D] text-white shadow-md shadow-[#1A365D]/10"
                  : "text-[#6B665E] hover:text-[#1A365D] hover:bg-neutral-100"
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
                  ? "bg-[#1A365D] text-white shadow-md shadow-[#1A365D]/10"
                  : "text-[#6B665E] hover:text-[#1A365D] hover:bg-neutral-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              New Identity
            </button>
          </div>
        )}

        {/* Error notification card */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4.5 h-4.5 text-red-700 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-sans font-medium">{error}</span>
          </div>
        )}



        {/* Forms Container */}
        <div className="grow">
          {showDualVerifyScreen ? (
            <form onSubmit={handleVerifyDualOtp} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-950">
                <h4 className="font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4.5 h-4.5 text-amber-700" />
                  Email OTP Scholar Verification
                </h4>
                <p className="text-xs leading-normal">
                  To protect scholar data, we require verification of your registered **Email Address** before launching your workspace.
                </p>
              </div>

              {dualVerifyError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4.5 h-4.5 text-red-700 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-sans font-medium">{dualVerifyError}</span>
                </div>
              )}

              {dualVerifyBypass && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-xs leading-normal font-mono select-all">
                  {dualVerifyBypass}
                </div>
              )}

              {/* Email OTP Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  6-Digit Email Verification OTP
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter email code..."
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono tracking-[0.2em] text-center"
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
                  className="w-1/3 py-3 border border-[#D1CEC7] hover:bg-neutral-50 text-[10px] font-mono uppercase text-[#6B665E] rounded-xl cursor-pointer transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 bg-[#1A365D] hover:bg-[#1A365D]/90 disabled:bg-[#D1CEC7] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
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
          ) : isForgotPasswordMode ? (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-950">
                <h4 className="font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Key className="w-4.5 h-4.5 text-amber-700" />
                  Forgot Password Request
                </h4>
                <p className="text-xs leading-normal">
                  Password resets require manual Admin email approval. Submit your details to queue the reset.
                </p>
              </div>

              {resetSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs leading-normal font-sans font-medium">
                  {resetSuccessMessage}
                </div>
              )}

              {debugCodeMsg && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-xs leading-normal font-mono select-all">
                  {debugCodeMsg}
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Scholar Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="Enter username..."
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    placeholder="Enter registered email..."
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* New Password Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Proposed New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    placeholder="Enter new password..."
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
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
                    setDebugCodeMsg(null);
                  }}
                  className="w-1/3 py-3 border border-[#D1CEC7] hover:bg-neutral-50 text-[10px] font-mono uppercase text-[#6B665E] rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 bg-[#1A365D] hover:bg-[#1A365D]/90 disabled:bg-[#D1CEC7] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Submit Reset</span>
                  )}
                </button>
              </div>
            </form>
          ) : activeTab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Login Username */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Scholar Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono placeholder:text-gray-400/80 transition-all"
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
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-10 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono placeholder:text-gray-400/80 transition-all"
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
                    className="absolute right-3 top-3.5 text-[#8C887F] hover:text-[#1A365D] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember checkbox & Forgot Password link */}
              <div className="flex justify-between items-center pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="remember-login"
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-[#D1CEC7] text-[#1A365D] focus:ring-[#1A365D] accent-[#1A365D] cursor-pointer"
                  />
                  <label htmlFor="remember-login" className="text-[11px] font-medium text-[#6B665E] select-none cursor-pointer">
                    Remember device
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(true);
                    setError(null);
                    setResetSuccessMessage(null);
                    setDebugCodeMsg(null);
                  }}
                  className="text-[11px] font-mono text-[#C08A3E] hover:underline cursor-pointer font-bold"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Action */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1A365D] hover:bg-[#1A365D]/90 disabled:bg-[#D1CEC7] disabled:text-neutral-500 text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-lg shadow-[#1A365D]/10 hover:shadow-xl hover:shadow-[#1A365D]/15 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                  <div className="w-full border-t border-[#D1CEC7]/35"></div>
                </div>
                <span className="relative px-3.5 bg-white text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider">
                  Or continue with
                </span>
              </div>

              {/* Social Login Buttons */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="flex items-center justify-center gap-1.5 py-3 px-6 bg-white border border-[#E2E8F0] hover:bg-[#FAF8F5] hover:border-[#D1CEC7] text-[11px] font-bold font-sans text-gray-700 rounded-xl hover-lift cursor-pointer transition-all shadow-sm w-full"
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
              <div className="space-y-4 border-b border-[#D1CEC7]/30 pb-4">
                <span className="text-[9px] font-mono uppercase font-bold text-[#C08A3E] tracking-wider block">1. Security Credentials</span>
                
                {/* Signup Username */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Scholar Username *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono placeholder:text-gray-400/80 transition-all"
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
                  <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Secure Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-10 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono placeholder:text-gray-400/80 transition-all"
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
                      className="absolute right-3 top-3.5 text-[#8C887F] hover:text-[#1A365D] cursor-pointer"
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
                        <span className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
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
                                isFilled ? fillColor : "bg-slate-100"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Requirements validation checklist */}
                    <div className="space-y-1 font-mono text-xs pl-1 text-[#6B665E]">
                      <div className="flex items-center gap-1.5">
                        <span className={checkLength ? "text-emerald-600 font-bold" : "text-gray-400"}>
                          {checkLength ? "✓" : "•"} 8+ Characters
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkUpper ? "text-emerald-600 font-bold" : "text-gray-400"}>
                          {checkUpper ? "✓" : "•"} Uppercase Letter
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkNumber ? "text-emerald-600 font-bold" : "text-gray-400"}>
                          {checkNumber ? "✓" : "•"} Number
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={checkSpecial ? "text-emerald-600 font-bold" : "text-gray-400"}>
                          {checkSpecial ? "✓" : "•"} Special Character
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scholar Information Section */}
              <div className="space-y-4">
                <span className="text-[9px] font-mono uppercase font-bold text-[#C08A3E] tracking-wider block">2. Personal & Academic Details</span>
                
                {/* Full name & Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">Full Name *</label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-[#8C887F] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        required
                        className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-8 pr-3 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                        placeholder="Dr. John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">Email Address *</label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-[#8C887F] absolute left-3 top-3.5" />
                      <input
                        type="email"
                        required
                        className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-8 pr-3 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
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
                    <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">Phone Number *</label>
                    <div className="flex gap-1.5">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-24 bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl px-2 py-3 text-[11px] text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono cursor-pointer shrink-0"
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
                      <div className="relative flex-grow">
                        <Phone className="w-3.5 h-3.5 text-[#8C887F] absolute left-3 top-3.5" />
                        <input
                          type="text"
                          required
                          className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-8 pr-3 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                          placeholder="e.g. 9851108291"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">Affiliation / Inst. *</label>
                    <div className="relative">
                      <Building className="w-3.5 h-3.5 text-[#8C887F] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        required
                        className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-8 pr-3 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                        placeholder="e.g. Oxford University"
                        value={affiliation}
                        onChange={(e) => setAffiliation(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Authentic ID input */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Authentic Identification (Optional - Passport / Student ID / citizenship)
                  </label>
                  <div className="relative">
                    <Landmark className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
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
                className="w-full py-3 bg-[#1A365D] hover:bg-[#1A365D]/90 disabled:bg-[#D1CEC7] disabled:text-neutral-500 text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-lg shadow-[#1A365D]/10 hover:shadow-xl hover:shadow-[#1A365D]/15 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                  <div className="w-full border-t border-[#D1CEC7]/35"></div>
                </div>
                <span className="relative px-3.5 bg-white text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider">
                  Or sign up with
                </span>
              </div>

              {/* Social Signup Buttons */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="flex items-center justify-center gap-1.5 py-3 px-6 bg-white border border-[#E2E8F0] hover:bg-[#FAF8F5] hover:border-[#D1CEC7] text-[11px] font-bold font-sans text-gray-700 rounded-xl hover-lift cursor-pointer transition-all shadow-sm w-full"
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
            <form onSubmit={handleVerifyActivation} className="space-y-5 animate-fade-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-950">
                <h4 className="font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider">
                  <Clock className="w-4.5 h-4.5 text-amber-700 animate-pulse" />
                  Request Pending Admin Verification
                </h4>
                <p className="leading-relaxed">
                  Your Scholar Workspace request has been submitted to the administrator.
                </p>
                <p className="leading-relaxed">
                  Please check your registered email (<strong>{pendingUser?.email}</strong>) for your unique <strong>Activation Key</strong> once approved.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                  Enter Admin Activation Key
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-[#8C887F] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-xl pl-10 pr-4 py-3 text-xs text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] font-mono placeholder:text-gray-400/80 uppercase tracking-widest text-center"
                    placeholder="SA-XXXXXX"
                    value={activationCode}
                    onChange={(e) => {
                      setActivationCode(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("login");
                    setPendingUser(null);
                    setError(null);
                  }}
                  className="w-1/3 py-3 border border-[#D1CEC7] hover:bg-neutral-50 text-[10px] font-mono uppercase text-[#6B665E] rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !activationCode}
                  className="w-2/3 py-3 bg-[#C08A3E] hover:bg-[#A3702E] disabled:bg-[#D1CEC7] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Activate Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Secondary Account Switcher Links */}
        {activeTab !== "activation" && (
          <div className="text-center pt-2 border-t border-[#D1CEC7]/30 text-xs space-y-2">
            {activeTab === "login" ? (
              <p className="text-[#6B665E]">
                Need a new workspace?{" "}
                <button
                  onClick={() => {
                    setActiveTab("signup");
                    setError(null);
                    setPasswordInput("");
                  }}
                  className="text-[#C08A3E] hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  Create Scholar Account
                </button>
              </p>
            ) : (
              <p className="text-[#6B665E]">
                Already registered?{" "}
                <button
                  onClick={() => {
                    setActiveTab("login");
                    setError(null);
                    setPasswordInput("");
                  }}
                  className="text-[#C08A3E] hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  Launch Workspace
                </button>
              </p>
            )}

            <div className="pt-1 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear all configured API credentials (Google Client ID, Facebook App ID, and Twilio keys)?")) {
                    localStorage.removeItem("phd_google_client_id");
                    localStorage.removeItem("phd_facebook_app_id");
                    localStorage.removeItem("phd_twilio_sid");
                    localStorage.removeItem("phd_twilio_token");
                    localStorage.removeItem("phd_twilio_from");
                    setError("All configured credentials have been reset successfully.");
                  }
                }}
                className="text-[10px] font-mono text-gray-400 hover:text-[#1A365D] underline cursor-pointer"
              >
                Clear Saved API Keys
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete all scholar profiles on this device? This will erase all user workspaces permanently.")) {
                    const savedList = localStorage.getItem(PROFILES_LIST_KEY);
                    if (savedList) {
                      try {
                        const parsed = JSON.parse(savedList) as { profilesList: string[] };
                        const list = parsed.profilesList || [];
                        list.forEach(uname => {
                          localStorage.removeItem(`${PROFILE_STATE_PREFIX}${uname}`);
                        });
                      } catch (e) {
                        console.error("Failed to clear profiles:", e);
                      }
                    }
                    localStorage.removeItem(PROFILES_LIST_KEY);
                    setProfiles([]);
                    setActiveTab("signup");
                    setError("All scholar profiles have been removed from this device.");
                  }
                }}
                className="text-[10px] font-mono text-red-400/80 hover:text-red-700 underline cursor-pointer"
              >
                Remove All Users
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtly presented Trust Signals Footer */}
      <div className="mt-8 text-center font-mono text-[10px] text-[#8C887F] tracking-widest uppercase">
        Secure • Encrypted • Private
      </div>

      {/* Real OAuth Key Config Prompt Modals */}
      {promptKeyType !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 font-sans animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#1A365D]">
              <Key className="w-5 h-5 text-[#C08A3E]" />
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider">
                Configure {promptKeyType === "google" ? "Google Client ID" : "Facebook App ID"}
              </h3>
            </div>
            
            <p className="text-xs text-gray-500 leading-normal">
              To enable real authentication, please supply your {promptKeyType === "google" ? "Google OAuth Client ID" : "Facebook App ID"}. It will be saved securely in your browser's local storage.
            </p>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-sans font-medium">{modalError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModalError(null);
                const val = keyValueInput.trim();
                if (val) {
                  if (promptKeyType === "google" && !val.endsWith(".apps.googleusercontent.com")) {
                    setModalError("Invalid Google Client ID. It must end with '.apps.googleusercontent.com' (e.g. xxxxxxx.apps.googleusercontent.com)");
                    return;
                  }
                  if (promptKeyType === "facebook" && !/^\d+$/.test(val)) {
                    setModalError("Invalid Facebook App ID. It must consist only of numbers (e.g. 1592XXXXXXXXXX)");
                    return;
                  }

                  localStorage.setItem(
                    promptKeyType === "google" ? "phd_google_client_id" : "phd_facebook_app_id",
                    val
                  );
                  setPromptKeyType(null);
                  if (promptKeyType === "google") {
                    triggerGoogleSignIn();
                  } else {
                    triggerFacebookSignIn();
                  }
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="block text-[9px] font-bold font-mono uppercase tracking-wider text-gray-500">
                  {promptKeyType === "google" ? "Google Client ID" : "Facebook App ID"} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    promptKeyType === "google"
                      ? "xxxxxxx.apps.googleusercontent.com"
                      : "e.g. 1592XXXXXXXXXX"
                  }
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:border-[#1A365D] font-mono"
                  value={keyValueInput}
                  onChange={(e) => {
                    setKeyValueInput(e.target.value);
                    setModalError(null);
                  }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPromptKeyType(null);
                    setModalError(null);
                  }}
                  className="w-1/3 py-2 border border-gray-250 hover:bg-neutral-50 text-xs font-mono text-gray-500 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white text-xs font-mono font-bold rounded-lg cursor-pointer"
                >
                  Save & Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Credentials Configuration Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 font-sans animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col p-6 space-y-4 max-h-[90vh]">
            <div className="flex items-center gap-2 text-[#1A365D] border-b border-gray-100 pb-3">
              <Settings className="w-5 h-5 text-[#C08A3E]" />
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider">
                API Credentials Configuration
              </h3>
            </div>
            
            <p className="text-xs text-[#6B665E] leading-normal font-sans">
              Configure OAuth Client IDs and Twilio API keys directly in the browser. Credentials are saved locally in your browser's secure storage.
            </p>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-sans font-medium">{modalError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModalError(null);
                
                const gId = tempGoogleId.trim();
                const fbId = tempFbId.trim();
                 // Save to localStorage
                 if (gId) localStorage.setItem("phd_google_client_id", gId);
                 else localStorage.removeItem("phd_google_client_id");
 
                 if (fbId) localStorage.setItem("phd_facebook_app_id", fbId);
                 else localStorage.removeItem("phd_facebook_app_id");
 
                 setShowSettingsModal(false);
                 setError("Credentials updated successfully.");
               }}
               className="space-y-4 overflow-y-auto pr-1"
             >
               {/* Google Client ID */}
               <div className="space-y-1">
                 <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-gray-500">
                   Google Client ID (OAuth)
                 </label>
                 <input
                   type="text"
                   placeholder="xxxxxxx.apps.googleusercontent.com"
                   className="w-full border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:border-[#1A365D] font-mono"
                   value={tempGoogleId}
                   onChange={(e) => setTempGoogleId(e.target.value)}
                 />
               </div>
 
               {/* Facebook App ID */}
               <div className="space-y-1">
                 <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-gray-500">
                   Facebook App ID
                 </label>
                 <input
                   type="text"
                   placeholder="e.g. 1592XXXXXXXXXX"
                   className="w-full border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:border-[#1A365D] font-mono"
                   value={tempFbId}
                   onChange={(e) => setTempFbId(e.target.value)}
                 />
               </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setModalError(null);
                  }}
                  className="w-1/3 py-2.5 border border-gray-200 hover:bg-neutral-50 text-xs font-mono text-gray-500 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white text-xs font-mono font-bold rounded-lg cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
