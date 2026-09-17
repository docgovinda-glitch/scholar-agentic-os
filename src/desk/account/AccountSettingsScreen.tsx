import { useEffect, useState } from "react";
import { getProfile, saveProfileFields, updatePassword, type ProfileFields } from "../../services/supabaseAuthService";
import { getAiAccessStatus } from "../aiAccess/aiAccessApi";
import { EDUCATION_LEVELS, USER_TYPES } from "../../config/accountSchema";
import { Field, PhoneField, SelectField } from "../auth/AuthLayout";
import { e164Problem, DEFAULT_COUNTRY_ISO2, findCountry } from "../../config/countries";

export type SettingsTab = "personal" | "security" | "subscription";

/**
 * Strips a duplicated dial code from a phone string if already present,
 * preventing E.164 double-prefixing (e.g. +977 +9779821849301).
 */
export function stripDialCode(dialCode: string, rawPhone: string): string {
  if (!rawPhone) return "";
  let clean = rawPhone.trim();
  if (dialCode && clean.startsWith(dialCode)) {
    clean = clean.slice(dialCode.length).trim();
  } else {
    const digitsOnly = dialCode.replace(/\D/g, "");
    if (digitsOnly && clean.startsWith(digitsOnly) && clean.length > digitsOnly.length + 5) {
      clean = clean.slice(digitsOnly.length).trim();
    }
  }
  return clean;
}

/**
 * Account Settings — Clean, scannable tabbed settings modal inspired by Airbnb & ChatGPT.
 *
 * Tab 1: Personal Info (Account Identity, Full Name, Phone, and Academic Profile).
 * Tab 2: Security (Password management and authentication controls).
 * Tab 3: Subscription (Plan status, conversion & purchasing details).
 */
export default function AccountSettingsScreen({
  onClose,
  onManagePremium,
  initialTab = "personal",
}: {
  onClose: () => void;
  /** Optional: wired by DeskApp to open AI Access on its Premium section. Omitted in tests that don't exercise it. */
  onManagePremium?: () => void;
  /** Initial active tab. Defaults to 'personal'. */
  initialTab?: SettingsTab;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const [profile, setProfile] = useState<ProfileFields | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [userType, setUserType] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    getProfile()
      .then((result) => {
        if (result.success) {
          setProfile(result.profile);
          setFullName(result.profile.fullName);
          const dialCode = result.profile.phoneCountryCode || findCountry(DEFAULT_COUNTRY_ISO2)?.dialCode || "+977";
          setPhoneCountryCode(dialCode);
          // Strip duplicate dial code from stored phone
          setPhone(stripDialCode(dialCode, result.profile.phone || ""));
          setAffiliation(result.profile.affiliation);
          setUserType(result.profile.userType);
          setEducationLevel(result.profile.educationLevel);
        } else {
          setLoadError(result.error);
        }
      })
      .catch((e) => setLoadError((e as Error).message));

    getAiAccessStatus()
      .then((status) => setIsPremium(Boolean(status.entitlement?.active)))
      .catch(() => setIsPremium(false));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const phoneProblem = e164Problem(phoneCountryCode, phone);

  const handlePhoneChange = (val: string) => {
    setPhone(stripDialCode(phoneCountryCode, val));
  };

  async function handleSaveProfile() {
    if (phoneProblem) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await saveProfileFields({
        fullName: fullName.trim(),
        phone: phone.trim(),
        phoneCountryCode,
        affiliation: affiliation.trim(),
        userType,
        educationLevel,
      });
      if (!result.success) {
        setSaveError(result.error ?? "Could not save your changes.");
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.success) {
        setPasswordError(result.error ?? "Could not change your password.");
        return;
      }
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="relative w-full max-w-3xl md:h-[640px] max-h-[90vh] rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] shadow-2xl flex flex-col overflow-hidden text-[color:var(--text-primary)] animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-subtle)] flex-shrink-0 bg-[color:var(--surface-canvas)]">
          <div className="flex items-center gap-2">
            <h1 id="settings-dialog-title" className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">
              Account Settings
            </h1>
            <span className="text-[10px] font-medium text-[color:var(--text-muted)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] px-2 py-0.5 rounded-full">
              {isPremium ? "Premium Plan" : "Free Plan"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Modal Body: Side Navigation + Content Panel */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Side Navigation Tabs (Airbnb & ChatGPT Style) */}
          <nav
            role="tablist"
            aria-label="Settings categories"
            className="w-full md:w-56 border-b md:border-b-0 md:border-r border-[color:var(--border-subtle)] p-2 md:p-3 flex md:flex-col gap-1 flex-shrink-0 bg-[color:var(--surface-raised)]/30 overflow-x-auto"
          >
            {/* Tab 1: Personal Info */}
            <button
              type="button"
              role="tab"
              id="tab-personal"
              aria-selected={activeTab === "personal"}
              aria-controls="tabpanel-personal"
              onClick={() => setActiveTab("personal")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-left w-full whitespace-nowrap ${
                activeTab === "personal"
                  ? "bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-semibold shadow-2xs"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]/60"
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span>Personal Info</span>
            </button>

            {/* Tab 2: Security */}
            <button
              type="button"
              role="tab"
              id="tab-security"
              aria-selected={activeTab === "security"}
              aria-controls="tabpanel-security"
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-left w-full whitespace-nowrap ${
                activeTab === "security"
                  ? "bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-semibold shadow-2xs"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]/60"
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>Security</span>
            </button>

            {/* Tab 3: Subscription & Plans */}
            <button
              type="button"
              role="tab"
              id="tab-subscription"
              aria-selected={activeTab === "subscription"}
              aria-controls="tabpanel-subscription"
              onClick={() => setActiveTab("subscription")}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-left w-full whitespace-nowrap ${
                activeTab === "subscription"
                  ? "bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-semibold shadow-2xs"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]/60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <span>Subscription</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isPremium ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-[color:var(--surface-raised)] text-[color:var(--text-muted)]"}`}>
                {isPremium ? "PRO" : "FREE"}
              </span>
            </button>
          </nav>

          {/* Tab Content & Action Wrapper */}
          <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--surface-canvas)]">
            <div className="flex-1 p-5 md:p-6 overflow-y-auto scholar-scrollbar">
              {loadError && (
                <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
                  {loadError}
                </p>
              )}

              {/* Tab 1: Personal Info */}
              <div
                role="tabpanel"
                id="tabpanel-personal"
                aria-labelledby="tab-personal"
                className={activeTab === "personal" ? "space-y-5 animate-in fade-in duration-150" : "hidden"}
              >
                <div>
                  <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Personal Info</h2>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    Manage your academic identity, institution, and contact details.
                  </p>
                </div>

                {profile && (
                  <form
                    id="account-profile-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSaveProfile();
                    }}
                    className="space-y-4"
                  >
                    {/* Account Identity Card (Username & Email - declared once in a clean unified card) */}
                    <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/50 p-3.5">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
                            Account Identity
                          </span>
                          <span className="text-[10px] font-medium text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] px-2 py-0.5 rounded">
                            Read-only
                          </span>
                        </div>
                        <span className="text-[11px] text-[color:var(--text-muted)] hidden sm:inline">Credentials cannot be edited</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Username - Strictly Read-only / Disabled */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-[color:var(--text-secondary)]" htmlFor="account-username">
                              Username
                            </label>
                            <span className="text-[10px] font-medium text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] px-1.5 py-0.2 rounded">
                              Read-only
                            </span>
                          </div>
                          <input
                            id="account-username"
                            value={profile.username}
                            disabled
                            readOnly
                            aria-readonly="true"
                            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs font-mono text-[color:var(--text-muted)] cursor-not-allowed opacity-80"
                          />
                          <p className="text-[11px] text-[color:var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            <span>Username cannot be changed.</span>
                          </p>
                        </div>

                        {/* Email - System Controlled */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-[color:var(--text-secondary)]" htmlFor="account-email">
                            Email
                          </label>
                          <input
                            id="account-email"
                            value={profile.email}
                            disabled
                            readOnly
                            aria-readonly="true"
                            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs font-mono text-[color:var(--text-muted)] cursor-not-allowed opacity-80"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Profile Fields Section */}
                    <div className="space-y-3.5">
                      {/* Full Name - User Editable */}
                      <Field id="account-full-name" label="Full name" value={fullName} onChange={setFullName} />

                      {/* Phone - Dial Code Deduplication prevents invalid error */}
                      <PhoneField
                        idPrefix="account-phone"
                        countryCode={phoneCountryCode}
                        onCountryCodeChange={(code) => {
                          setPhoneCountryCode(code);
                          setPhone(stripDialCode(code, phone));
                        }}
                        number={phone}
                        onNumberChange={handlePhoneChange}
                        error={phoneProblem}
                      />

                      {/* Institution */}
                      <Field id="account-affiliation" label="Institution" value={affiliation} onChange={setAffiliation} required={false} />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* User Type */}
                        <SelectField id="account-userType" label="User Type" value={userType} onChange={setUserType} options={USER_TYPES} />

                        {/* Level of Education */}
                        <SelectField
                          id="account-educationLevel"
                          label="Level of Education"
                          value={educationLevel}
                          onChange={setEducationLevel}
                          options={EDUCATION_LEVELS}
                        />
                      </div>
                    </div>

                    {/* Strategic Repetition of Subscription & Purchasing Info */}
                    <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3.5 mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-semibold text-[color:var(--text-primary)]">Subscription</h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPremium ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"}`}>
                            Current Plan: <span className="font-medium">{isPremium ? "Premium" : "Free"}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                          {isPremium ? "Full access to multi-agent editorial intelligence." : "Upgrade for unlimited AI routing and deep research tools."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onManagePremium}
                        disabled={!onManagePremium}
                        className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        {isPremium ? "Manage Premium Plan" : "Upgrade to Premium"}
                      </button>
                    </div>
                  </form>
                )}

                {!profile && !loadError && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                    <span className="w-3.5 h-3.5 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span>Loading profile…</span>
                  </div>
                )}
              </div>

            {/* Tab 2: Security */}
            <div
              role="tabpanel"
              id="tabpanel-security"
              aria-labelledby="tab-security"
              className={activeTab === "security" ? "space-y-6 animate-in fade-in duration-150" : "hidden"}
            >
              <div>
                <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Security</h2>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                  Manage your password, authentication, and session credentials.
                </p>
              </div>

              <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 space-y-4">
                <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Change Password</h3>
                <div className="space-y-4">
                  <Field
                    id="account-new-password"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                    required={false}
                    showPasswordToggle
                  />
                  <Field
                    id="account-confirm-password"
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required={false}
                    showPasswordToggle
                  />
                  {passwordError && (
                    <p role="alert" className="text-sm text-[color:var(--state-danger)]">
                      {passwordError}
                    </p>
                  )}
                  {passwordSaved && (
                    <p role="status" className="text-sm text-[color:var(--state-success)]">
                      Password changed.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleChangePassword()}
                    disabled={passwordBusy || !newPassword || !confirmPassword}
                    aria-busy={passwordBusy}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    {passwordBusy ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span>Changing…</span>
                      </>
                    ) : (
                      "Change password"
                    )}
                  </button>
                </div>
              </section>

              <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
                <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Authentication & Sessions</h3>
                <p className="mt-1 text-xs text-[color:var(--text-muted)] leading-relaxed">
                  Your Scholar session uses encrypted JWT tokens stored locally in your browser. Linking multiple accounts enables instantaneous role and organization switching.
                </p>
              </section>
            </div>

            {/* Tab 3: Subscription & Plans (Strategically Highlighted for Visibility & Conversion) */}
            <div
              role="tabpanel"
              id="tabpanel-subscription"
              aria-labelledby="tab-subscription"
              className={activeTab === "subscription" ? "space-y-6 animate-in fade-in duration-150" : "hidden"}
            >
              <div>
                <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Subscription & Plan</h2>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                  Manage your academic plan, AI compute allowance, and editorial access.
                </p>
              </div>

              {/* Active Plan Card */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
                      Current Tier
                    </span>
                    <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                      {isPremium ? "Scholar Premium" : "Scholar Free"}
                    </h3>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${isPremium ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20" : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"}`}>
                    {isPremium ? "★ Active" : "Basic"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
                  <div className="flex items-start gap-2.5 text-xs text-[color:var(--text-secondary)]">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Multi-model academic intelligence (Claude 3.7, GPT-4o, Gemini 2.5)</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-[color:var(--text-secondary)]">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Knowledge Vault with encrypted cloud drive citation sync</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-[color:var(--text-secondary)]">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Editorial compliance checking and journal style formatting</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-[color:var(--text-secondary)]">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Priority background agent compute and task execution</span>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {isPremium ? "Billed annually or centrally managed" : "Upgrade anytime to unlock full capacity"}
                  </span>
                  <button
                    type="button"
                    onClick={onManagePremium}
                    disabled={!onManagePremium}
                    className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-xs font-semibold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-60 cursor-pointer shadow-xs transition-colors"
                  >
                    {isPremium ? "Manage Subscription Tier" : "Upgrade Plan"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pinned Sticky Modal Footer for Personal Info */}
          {activeTab === "personal" && profile && (
              <footer className="flex items-center justify-between px-6 py-3.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex-shrink-0">
                <div className="flex items-center gap-2 min-h-[22px]">
                  {saveError && (
                    <p role="alert" className="text-xs text-[color:var(--state-danger)] flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{saveError}</span>
                    </p>
                  )}
                  {saved && (
                    <p role="status" className="text-xs text-[color:var(--state-success)] font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Saved.</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="account-profile-form"
                    onClick={() => void handleSaveProfile()}
                    disabled={saving || phoneProblem !== null}
                    aria-busy={saving}
                    className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    {saving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </button>
                </div>
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

