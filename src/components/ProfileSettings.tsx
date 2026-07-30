import React, { useState, useEffect } from "react";
import { 
  User, 
  Mail, 
  Phone, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Building, 
  Clock, 
  Key, 
  ShieldAlert,
  UserCheck,
  FileText,
  Upload,
  X,
  Eye,
  FileDown
} from "lucide-react";
import { UserProfile } from "../types";
import { requestProfileUpdate } from "../services/supabaseAuthService";

const PROFILES_LIST_KEY = "phd_profiles_meta";
const PROFILE_STATE_PREFIX = "phd_profile_state_";

// Helper for client-side SHA-256 hashing
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface ProfileSettingsProps {
  currentUser: string;
  onProfileUpdated?: () => void;
}

export default function ProfileSettings({ currentUser, onProfileUpdated }: ProfileSettingsProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Input states for updates
  const [newEmail, setNewEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phoneNum, setPhoneNum] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newAffiliation, setNewAffiliation] = useState("");
  const [newAuthenticId, setNewAuthenticId] = useState("");
  const [newIdDocBase64, setNewIdDocBase64] = useState("");
  const [newIdDocName, setNewIdDocName] = useState("");
  
  // Verification states
  const [enteredKey, setEnteredKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bypassNotice, setBypassNotice] = useState<string | null>(null);

  // Admin view states
  const [pendingProfiles, setPendingProfiles] = useState<UserProfile[]>([]);
  const isAdmin = currentUser === "admin";

  // Load current user's profile and list of pending profiles for admin
  const loadProfileData = () => {
    setError(null);
    setSuccess(null);
    setBypassNotice(null);
    
    // Load current user
    const profileKey = `${PROFILE_STATE_PREFIX}${currentUser}`;
    const stored = localStorage.getItem(profileKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserProfile;
        setProfile(parsed);
        setNewEmail(parsed.email || "");
        setNewFullName(parsed.fullName || parsed.username || "");
        setNewAffiliation(parsed.affiliation || "");
        setNewAuthenticId(parsed.authenticId || "");
        setNewIdDocBase64("");
        setNewIdDocName("");
        
        // Parse country code and number
        const currentPhone = parsed.phone || "";
        const prefixes = ["+977", "+971", "+91", "+44", "+61", "+86", "+81", "+49", "+33", "+1"];
        let matchedPrefix = "+977";
        let rest = currentPhone;
        
        for (const pref of prefixes) {
          if (currentPhone.startsWith(pref)) {
            matchedPrefix = pref;
            rest = currentPhone.slice(pref.length);
            break;
          }
        }
        setCountryCode(matchedPrefix);
        setPhoneNum(rest);
      } catch (e) {
        console.error("Failed to parse user profile:", e);
        setError("Failed to load profile details.");
      }
    } else {
      setError("User profile not found.");
    }

    // Load admin lists if needed
    if (isAdmin) {
      const listStr = localStorage.getItem(PROFILES_LIST_KEY);
      if (listStr) {
        try {
          const parsedList = JSON.parse(listStr) as { profilesList: string[] };
          const list = parsedList.profilesList || [];
          const pendingList: UserProfile[] = [];
          
          list.forEach(username => {
            if (username === "admin") return;
            const userStr = localStorage.getItem(`${PROFILE_STATE_PREFIX}${username}`);
            if (userStr) {
              const uProfile = JSON.parse(userStr) as UserProfile;
              if (
                uProfile.pendingEmail || 
                uProfile.pendingPhone ||
                uProfile.pendingFullName ||
                uProfile.pendingAffiliation ||
                uProfile.pendingAuthenticId ||
                uProfile.pendingIdDocument
              ) {
                pendingList.push(uProfile);
              }
            }
          });
          setPendingProfiles(pendingList);
        } catch (e) {
          console.error("Failed to load pending updates list:", e);
        }
      }
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [currentUser]);

  // Handle file document upload conversions
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setError("Identification Proof document exceeds the maximum 4MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewIdDocBase64(reader.result as string);
      setNewIdDocName(file.name);
    };
    reader.onerror = () => {
      setError("Failed to process the uploaded file.");
    };
    reader.readAsDataURL(file);
  };

  // Handle request for profile update (submitting new inputs)
  const handleRequestUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBypassNotice(null);

    if (!profile) return;

    const emailVal = newEmail.trim();
    const fullNameVal = newFullName.trim();
    const affiliationVal = newAffiliation.trim();
    const authenticIdVal = newAuthenticId.trim();

    const cleanPhoneNum = phoneNum.trim().replace(/[+\s()-]/g, "");
    const countryCodeDigits = countryCode.replace(/[+\s()-]/g, "");
    const dedupedPhoneNum = countryCodeDigits && cleanPhoneNum.startsWith(countryCodeDigits)
      ? cleanPhoneNum.slice(countryCodeDigits.length)
      : cleanPhoneNum;
    const phoneVal = countryCode ? `${countryCode}${dedupedPhoneNum}` : dedupedPhoneNum;

    // Check if there are changes
    const emailChanged = emailVal !== profile.email;
    const phoneChanged = phoneVal !== profile.phone;
    const fullNameChanged = fullNameVal !== (profile.fullName || profile.username);
    const affiliationChanged = affiliationVal !== (profile.affiliation || "");
    const authenticIdChanged = authenticIdVal !== (profile.authenticId || "");
    const docChanged = !!newIdDocBase64;

    if (!emailChanged && !phoneChanged && !fullNameChanged && !affiliationChanged && !authenticIdChanged && !docChanged) {
      setError("No changes detected. Please update one or more profile fields before submitting.");
      return;
    }

    setLoading(true);

    try {
      const data = await requestProfileUpdate({
        username: currentUser,
        pendingEmail: emailChanged ? emailVal : undefined,
        pendingPhone: phoneChanged ? phoneVal : undefined,
        pendingFullName: fullNameChanged ? fullNameVal : undefined,
        pendingAffiliation: affiliationChanged ? affiliationVal : undefined,
        pendingAuthenticId: authenticIdChanged ? authenticIdVal : undefined,
        pendingIdDocumentName: docChanged ? newIdDocName : undefined
      });

      if (!data.success) {
        throw new Error(data.error || "Failed to submit request to server");
      }

      // Update local storage profile state
      const updatedProfile: UserProfile = {
        ...profile,
        pendingEmail: emailChanged ? emailVal : undefined,
        pendingPhone: phoneChanged ? phoneVal : undefined,
        pendingFullName: fullNameChanged ? fullNameVal : undefined,
        pendingAffiliation: affiliationChanged ? affiliationVal : undefined,
        pendingAuthenticId: authenticIdChanged ? authenticIdVal : undefined,
        pendingIdDocument: docChanged ? newIdDocBase64 : undefined,
        pendingIdDocumentName: docChanged ? newIdDocName : undefined,
        pendingUpdateKeyHash: data.keyHash
      };

      localStorage.setItem(`${PROFILE_STATE_PREFIX}${currentUser}`, JSON.stringify(updatedProfile));
      setProfile(updatedProfile);

      if (data.emailSent) {
        setSuccess("Profile change request submitted. Verification key sent to administrator.");
      } else {
        setSuccess("Profile change request submitted.");
        setBypassNotice(`sandbox bypass verification key: ${data.verificationKey}`);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to submit change request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Scholar verifies the update key provided by the admin
  const handleVerifyUpdateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!profile || !profile.pendingUpdateKeyHash) {
      setError("No pending profile changes found.");
      return;
    }

    if (!enteredKey.trim()) {
      setError("Please enter the verification key.");
      return;
    }

    setLoading(true);

    try {
      const enteredHash = await sha256(enteredKey.trim());
      if (enteredHash !== profile.pendingUpdateKeyHash) {
        setError("Invalid verification key. Double-check your spelling or verify with the admin.");
        setLoading(false);
        return;
      }

      // Success! Update active fields
      const approvedProfile: UserProfile = {
        ...profile,
        fullName: profile.pendingFullName || profile.fullName,
        email: profile.pendingEmail || profile.email,
        phone: profile.pendingPhone || profile.phone,
        affiliation: profile.pendingAffiliation || profile.affiliation,
        authenticId: profile.pendingAuthenticId || profile.authenticId,
        idDocument: profile.pendingIdDocument || profile.idDocument,
        idDocumentName: profile.pendingIdDocumentName || profile.idDocumentName,
        
        pendingFullName: undefined,
        pendingEmail: undefined,
        pendingPhone: undefined,
        pendingAffiliation: undefined,
        pendingAuthenticId: undefined,
        pendingIdDocument: undefined,
        pendingIdDocumentName: undefined,
        pendingUpdateKeyHash: undefined
      };

      localStorage.setItem(`${PROFILE_STATE_PREFIX}${currentUser}`, JSON.stringify(approvedProfile));
      loadProfileData();
      setEnteredKey("");
      setSuccess("Profile details updated successfully!");
      if (onProfileUpdated) onProfileUpdated();

    } catch (err) {
      console.error(err);
      setError("Error validating verification key.");
    } finally {
      setLoading(false);
    }
  };

  // Admin approves profile change directly
  const handleAdminApprove = (targetUser: string) => {
    setError(null);
    setSuccess(null);
    
    const key = `${PROFILE_STATE_PREFIX}${targetUser}`;
    const userStr = localStorage.getItem(key);
    if (!userStr) return;
    
    try {
      const uProfile = JSON.parse(userStr) as UserProfile;
      const approvedProfile: UserProfile = {
        ...uProfile,
        fullName: uProfile.pendingFullName || uProfile.fullName,
        email: uProfile.pendingEmail || uProfile.email,
        phone: uProfile.pendingPhone || uProfile.phone,
        affiliation: uProfile.pendingAffiliation || uProfile.affiliation,
        authenticId: uProfile.pendingAuthenticId || uProfile.authenticId,
        idDocument: uProfile.pendingIdDocument || uProfile.idDocument,
        idDocumentName: uProfile.pendingIdDocumentName || uProfile.idDocumentName,
        
        pendingFullName: undefined,
        pendingEmail: undefined,
        pendingPhone: undefined,
        pendingAffiliation: undefined,
        pendingAuthenticId: undefined,
        pendingIdDocument: undefined,
        pendingIdDocumentName: undefined,
        pendingUpdateKeyHash: undefined
      };
      
      localStorage.setItem(key, JSON.stringify(approvedProfile));
      loadProfileData(); // Reload admin grid
      setSuccess(`Successfully approved changes for scholar ${targetUser}.`);
    } catch (err) {
      console.error("Failed to approve update as admin:", err);
      setError("Approval operation failed.");
    }
  };

  // Admin rejects/cancels profile change request
  const handleAdminReject = (targetUser: string) => {
    setError(null);
    setSuccess(null);

    const key = `${PROFILE_STATE_PREFIX}${targetUser}`;
    const userStr = localStorage.getItem(key);
    if (!userStr) return;

    try {
      const uProfile = JSON.parse(userStr) as UserProfile;
      const rejectedProfile: UserProfile = {
        ...uProfile,
        pendingFullName: undefined,
        pendingEmail: undefined,
        pendingPhone: undefined,
        pendingAffiliation: undefined,
        pendingAuthenticId: undefined,
        pendingIdDocument: undefined,
        pendingIdDocumentName: undefined,
        pendingUpdateKeyHash: undefined
      };

      localStorage.setItem(key, JSON.stringify(rejectedProfile));
      loadProfileData();
      setSuccess(`Rejected update request for scholar ${targetUser}.`);
    } catch (err) {
      console.error("Failed to reject update as admin:", err);
      setError("Rejection operation failed.");
    }
  };

  // Scholar cancels their own pending update request
  const handleCancelOwnRequest = () => {
    if (!profile) return;
    setError(null);
    setSuccess(null);
    setBypassNotice(null);

    const cancelledProfile: UserProfile = {
      ...profile,
      pendingFullName: undefined,
      pendingEmail: undefined,
      pendingPhone: undefined,
      pendingAffiliation: undefined,
      pendingAuthenticId: undefined,
      pendingIdDocument: undefined,
      pendingIdDocumentName: undefined,
      pendingUpdateKeyHash: undefined
    };

    localStorage.setItem(`${PROFILE_STATE_PREFIX}${currentUser}`, JSON.stringify(cancelledProfile));
    loadProfileData();
    setSuccess("Pending update request cancelled.");
  };

  if (!profile) {
    if (error) {
      return (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl flex items-start gap-3 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 text-[color:var(--color-luminous-blue)] animate-spin" />
      </div>
    );
  }

  const hasPending = !!(
    profile.pendingEmail || 
    profile.pendingPhone ||
    profile.pendingFullName ||
    profile.pendingAffiliation ||
    profile.pendingAuthenticId ||
    profile.pendingIdDocument
  );

  return (
    <div className="space-y-6">
      
      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl flex items-start gap-3 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-start gap-3 text-xs font-mono">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <div>{success}</div>
        </div>
      )}

      {bypassNotice && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl flex flex-col gap-1.5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold uppercase tracking-wider text-[10px]">Testing Environment Notice</span>
          </div>
          <p className="text-[11px] leading-relaxed select-all bg-[color:var(--color-navy-1)] p-2.5 rounded border border-amber-500/30">{bypassNotice}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Profile Card View & Edit Form */}
        <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm flex flex-col space-y-6">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
            <User className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
            Scholar Identity Profile
          </h2>

          <div className="space-y-4">
            
            {/* Read-Only Identity Fields */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl">
                <span className="text-[#94A3B8] block text-[9px] uppercase">Scholar Username</span>
                <span className="font-bold text-[#E2E8F0] break-all">{profile.username}</span>
              </div>
              <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl">
                <span className="text-[#94A3B8] block text-[9px] uppercase">Affiliation / Inst.</span>
                <span className="font-bold text-[#E2E8F0] truncate block" title={profile.affiliation}>{profile.affiliation || "Not Set"}</span>
              </div>
              <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl col-span-2">
                <span className="text-[#94A3B8] block text-[9px] uppercase">Official Scholar Full Name</span>
                <span className="font-bold text-[#E2E8F0] block truncate">{profile.fullName || profile.username}</span>
              </div>
              <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl col-span-2">
                <span className="text-[#94A3B8] block text-[9px] uppercase">Authentic ID (Passport / Student ID Number)</span>
                <span className="font-bold text-[#E2E8F0] block truncate">{profile.authenticId || "Not Set"}</span>
              </div>
              {profile.idDocument && (
                <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl col-span-2 flex items-center justify-between">
                  <div>
                    <span className="text-[#94A3B8] block text-[9px] uppercase">Identity Verification Proof</span>
                    <span className="font-bold text-[#E2E8F0] flex items-center gap-1.5 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      {profile.idDocumentName || "identity_document.pdf"}
                    </span>
                  </div>
                  <a 
                    href={profile.idDocument} 
                    download={profile.idDocumentName || "identity_proof"}
                    className="p-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] rounded-lg text-[#E2E8F0] transition-colors cursor-pointer"
                    title="Download Uploaded Proof"
                  >
                    <FileDown className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            {/* Email & Whatsapp Forms */}
            <form onSubmit={handleRequestUpdate} className="space-y-4 pt-2">
              
              {/* Full Name input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  Official Full Name
                </label>
        <div className="w-full rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    disabled={hasPending || loading}
                    className="border-0 bg-transparent text-[#E2E8F0] w-full text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  Email Address
                </label>
        <div className="w-full rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={hasPending || loading}
                    className="border-0 bg-transparent text-[#E2E8F0] w-full text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              {/* Phone split inputs */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  Contact Phone Number
                </label>
                <div className="flex gap-2">
         <div className="w-24 rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      disabled={hasPending || loading}
                      className="border-0 bg-transparent text-[#E2E8F0] w-24 text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
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
         <div className="flex-grow rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                    <input
                      type="text"
                      value={phoneNum}
                      onChange={(e) => setPhoneNum(e.target.value)}
                      disabled={hasPending || loading}
                      placeholder="e.g. 9851102891"
                      className="border-0 bg-transparent text-[#E2E8F0] flex-grow text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Affiliation input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" />
                  Affiliation / University
                </label>
        <div className="w-full rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <input
                    type="text"
                    value={newAffiliation}
                    onChange={(e) => setNewAffiliation(e.target.value)}
                    disabled={hasPending || loading}
                    className="border-0 bg-transparent text-[#E2E8F0] w-full text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50"
                    placeholder="e.g. Tribhuvan University"
                    required
                  />
                </div>
              </div>

              {/* Authentic ID Number Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  Authentic Identification (Passport / Student ID / citizenship)
                </label>
        <div className="w-full rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                  <input
                    type="text"
                    value={newAuthenticId}
                    onChange={(e) => setNewAuthenticId(e.target.value)}
                    disabled={hasPending || loading}
                    className="border-0 bg-transparent text-[#E2E8F0] w-full text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50"
                    placeholder="e.g. Student ID: 22-IR-401 or Passport No: 2819-2018"
                    required
                  />
                </div>
              </div>

              {/* Document upload field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  Upload ID Proof Document (Passport / ID Scan, Max 4MB)
                </label>
                
                {newIdDocName ? (
                  <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-semibold truncate max-w-[80%]">
                      <FileText className="w-4 h-4 shrink-0" />
                      {newIdDocName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewIdDocBase64("");
                        setNewIdDocName("");
                      }}
                      className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                      title="Clear Document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative border-2 border-dashed border-[color:var(--color-navy-4)] rounded-xl p-6 flex flex-col items-center justify-center bg-[color:var(--color-navy-1)]/50 hover:bg-[color:var(--color-navy-1)] transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      disabled={hasPending || loading}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <Upload className="w-6 h-6 text-[#94A3B8] mb-1.5" />
                    <span className="text-[11px] font-mono text-[#94A3B8] font-semibold text-center">
                      Click to choose file or drag & drop here
                    </span>
                    <span className="text-[9px] text-[#94A3B8] text-center mt-0.5">
                      Accepted file formats: PDF, PNG, JPG, JPEG (Max 4MB)
                    </span>
                  </div>
                )}
              </div>

              {!hasPending && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white p-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Submit Update Request</span>
                  )}
                </button>
              )}
            </form>

          </div>
        </div>

        {/* Verification / Approval Box */}
        <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
              Update Verification
            </h2>

            {hasPending ? (
              <div className="space-y-5">
                
                {/* Alert Alert Banner */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl flex items-start gap-3">
                  <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-400 animate-pulse" />
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300 block">Approval Pending</span>
                    <p className="text-[11px] leading-relaxed">
                      Your requested profile changes have been registered and must be authorized by an administrator. Please retrieve the activation key from the workspace manager.
                    </p>
                  </div>
                </div>

                {/* Proposed Changes list */}
                <div className="p-4 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl space-y-3">
                  <span className="text-[9px] font-mono text-[#94A3B8] uppercase font-bold tracking-wider block border-b border-[color:var(--color-navy-4)] pb-1">Proposed Profile Updates</span>
                  <div className="space-y-2 text-xs font-mono leading-relaxed">
                    {profile.pendingFullName && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">New Full Name</span>
                        <span className="font-bold text-[#E2E8F0]">{profile.pendingFullName}</span>
                      </div>
                    )}
                    {profile.pendingEmail && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">New Email Address</span>
                        <span className="font-bold text-[#E2E8F0] break-all">{profile.pendingEmail}</span>
                      </div>
                    )}
                    {profile.pendingPhone && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">New Phone Number</span>
                        <span className="font-bold text-[#E2E8F0]">{profile.pendingPhone}</span>
                      </div>
                    )}
                    {profile.pendingAffiliation && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">New Affiliation</span>
                        <span className="font-bold text-[#E2E8F0]">{profile.pendingAffiliation}</span>
                      </div>
                    )}
                    {profile.pendingAuthenticId && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">New Authentic ID</span>
                        <span className="font-bold text-[#E2E8F0]">{profile.pendingAuthenticId}</span>
                      </div>
                    )}
                    {profile.pendingIdDocument && (
                      <div>
                        <span className="text-[#94A3B8] block text-[9px] uppercase">Uploaded ID Proof Doc</span>
                        <div className="flex items-center justify-between mt-1 p-2 bg-[color:var(--color-navy-2)] rounded border border-[color:var(--color-navy-4)]">
                          <span className="font-semibold text-emerald-400 truncate flex items-center gap-1 max-w-[70%]">
                            <FileText className="w-3.5 h-3.5" />
                            {profile.pendingIdDocumentName || "identity_document"}
                          </span>
                          <a 
                            href={profile.pendingIdDocument} 
                            download={profile.pendingIdDocumentName || "pending_proof"}
                            className="text-[10px] text-[color:var(--color-luminous-blue)] hover:underline font-bold uppercase"
                          >
                            Download
                          </a>
                        </div>
                        {profile.pendingIdDocument.startsWith("data:image/") && (
                          <div className="mt-2 text-center bg-[color:var(--color-navy-2)] p-2 rounded border border-[color:var(--color-navy-4)]">
                            <span className="text-[8px] text-[#94A3B8] uppercase tracking-wider block mb-1">Image Preview</span>
                            <img 
                              src={profile.pendingIdDocument} 
                              alt="ID Proof Preview" 
                              className="max-h-36 mx-auto object-contain rounded border border-[color:var(--color-navy-4)]/50"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Entry Form */}
                <form onSubmit={handleVerifyUpdateKey} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono font-bold uppercase text-[#94A3B8] tracking-widest block">
                      Admin Update Key
                    </label>
          <div className="w-full rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <input
                        type="text"
                        placeholder="e.g. UP-123456"
                        value={enteredKey}
                        onChange={(e) => setEnteredKey(e.target.value)}
                        disabled={loading}
                        className="border-0 bg-transparent text-[#E2E8F0] w-full text-xs font-mono p-3 focus:outline-none transition-all disabled:opacity-50 text-center uppercase tracking-widest"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleCancelOwnRequest}
                      disabled={loading}
                      className="grow-0 px-4 py-3 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] rounded-xl text-xs font-mono text-[#94A3B8] hover:text-red-400 transition-all font-bold uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="grow bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>Verify Key</span>
                      )}
                    </button>
                  </div>
                </form>

              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <ShieldCheck className="w-10 h-10 text-emerald-400/80" />
                <span className="font-mono text-xs font-bold text-[#E2E8F0]">Identity Verified</span>
                <p className="text-[11px] text-[#94A3B8] max-w-[240px] font-sans">
                  No pending profile changes. Your email, phone, and official identification records are fully approved and synchronized.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Admin Panel Panel View */}
      {isAdmin && (
        <div className="bg-[color:var(--color-navy-2)] border border-red-500/30 rounded-2xl p-6 shadow-sm space-y-6 relative overflow-hidden">
          {/* Subtle warning top line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-600"></div>

          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-red-400 pb-2 border-b border-[color:var(--color-navy-4)] flex items-center gap-2">
            <UserCheck className="w-4.5 h-4.5" />
            Administrator Approval Grid
          </h2>

          {pendingProfiles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono text-left border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-navy-4)] text-[#94A3B8]">
                    <th className="pb-3 pr-4 font-bold uppercase">Scholar</th>
                    <th className="pb-3 pr-4 font-bold uppercase">Current Details</th>
                    <th className="pb-3 pr-4 font-bold uppercase">Requested Updates</th>
                    <th className="pb-3 text-right font-bold uppercase">Authorizations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-navy-4)]/50">
                  {pendingProfiles.map(u => (
                    <tr key={u.username} className="hover:bg-[color:var(--color-navy-1)]/60 transition-colors">
                      <td className="py-4 pr-4 align-top font-bold text-[#E2E8F0]">
                        {u.username}
                        <span className="block font-normal text-[10px] text-[#94A3B8]">{u.fullName || "No Name"}</span>
                      </td>
                      <td className="py-4 pr-4 align-top text-[#94A3B8] space-y-1.5 max-w-[250px]">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Name</span>
                          <span className="font-semibold text-[#E2E8F0]">{u.fullName || u.username}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Email</span>
                          <span className="font-semibold text-[#E2E8F0] break-all">{u.email}</span>
                        </div>
                        <div>
                           <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Phone</span>
                           <span className="font-semibold text-[#E2E8F0]">{u.phone || "Not Set"}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Affiliation</span>
                          <span className="font-semibold text-[#E2E8F0] truncate block" title={u.affiliation}>{u.affiliation || "Not Set"}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Authentic ID</span>
                          <span className="font-semibold text-[#E2E8F0] block truncate" title={u.authenticId}>{u.authenticId || "Not Set"}</span>
                        </div>
                        {u.idDocument && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] block">Active Document</span>
                            <a href={u.idDocument} download={u.idDocumentName || "active_proof"} className="text-emerald-700 font-semibold flex items-center gap-1 text-[10px] hover:underline">
                              <FileText className="w-3 h-3" />
                              {u.idDocumentName || "download_document"}
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-4 align-top text-[#E2E8F0] space-y-2 max-w-[300px]">
                        {u.pendingFullName && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold block">New Full Name</span>
                            <span className="font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 inline-block">
                              {u.pendingFullName}
                            </span>
                          </div>
                        )}
                        {u.pendingEmail && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold block">New Email Address</span>
                            <span className="font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 inline-block break-all">
                              {u.pendingEmail}
                            </span>
                          </div>
                        )}
                        {u.pendingPhone && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold block">New Phone Number</span>
                            <span className="font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 inline-block">
                              {u.pendingPhone}
                            </span>
                          </div>
                        )}
                        {u.pendingAffiliation && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold block">New Affiliation</span>
                            <span className="font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 inline-block">
                              {u.pendingAffiliation}
                            </span>
                          </div>
                        )}
                        {u.pendingAuthenticId && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold block">New Authentic ID</span>
                            <span className="font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 inline-block">
                              {u.pendingAuthenticId}
                            </span>
                          </div>
                        )}
                        {u.pendingIdDocument && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold block">New ID Proof Document</span>
                            <div className="flex items-center gap-2 mt-1">
                              <a href={u.pendingIdDocument} download={u.pendingIdDocumentName || "pending_proof"} className="font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 flex items-center gap-1 text-[10px] hover:underline truncate max-w-[200px]">
                                <FileText className="w-3.5 h-3.5" />
                                {u.pendingIdDocumentName || "download_document"}
                              </a>
                            </div>
                            {u.pendingIdDocument.startsWith("data:image/") && (
                              <div className="mt-1.5 bg-[color:var(--color-navy-1)] p-1.5 rounded border border-[color:var(--color-navy-4)] inline-block">
                                <img src={u.pendingIdDocument} alt="Admin pending preview" className="max-h-24 object-contain rounded" />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 text-right align-top space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleAdminReject(u.username)}
                          className="px-3 py-1.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold uppercase cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleAdminApprove(u.username)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase cursor-pointer transition-colors shadow-sm"
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 border border-dashed border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-1)]/50">
              <ShieldCheck className="w-8 h-8 text-[#94A3B8]" />
              <span className="text-[11px] font-bold text-[#94A3B8]">No Pending Updates Found</span>
              <p className="text-[10px] text-[#94A3B8] max-w-xs font-sans">
                All scholar profiles across the workspace databases are synchronized and approved.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
