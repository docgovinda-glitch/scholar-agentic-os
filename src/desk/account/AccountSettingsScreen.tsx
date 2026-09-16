import { useEffect, useState } from "react";
import { getProfile, saveProfileFields, updatePassword, type ProfileFields } from "../../services/supabaseAuthService";
import { getAiAccessStatus } from "../aiAccess/aiAccessApi";
import { EDUCATION_LEVELS, USER_TYPES } from "../../config/accountSchema";
import { Field, PhoneField, SelectField } from "../auth/AuthLayout";
import { e164Problem, DEFAULT_COUNTRY_ISO2, findCountry } from "../../config/countries";

/**
 * Account Settings — ChatGPT-inspired tabbed settings modal.
 *
 * Tab 1: Personal Info (Full Name, Email, read-only Username, and academic profile).
 * Tab 2: Security (Password management and authentication controls).
 *
 * Single Source of Truth with Create Account:
 * fields reuse the canonical validators/options from config/accountSchema.ts and config/countries.ts.
 * Username is strictly read-only / disabled once created.
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
  initialTab?: "personal" | "security";
}) {
  const [activeTab, setActiveTab] = useState<"personal" | "security">(initialTab);

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
          setPhoneCountryCode(result.profile.phoneCountryCode || findCountry(DEFAULT_COUNTRY_ISO2)?.dialCode || "+977");
          setPhone(result.profile.phone);
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
          <h1 id="settings-dialog-title" className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">
            Account Settings
          </h1>
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
          {/* Side Navigation Tabs (ChatGPT-Style) */}
          <nav
            role="tablist"
            aria-label="Settings categories"
            className="w-full md:w-56 border-b md:border-b-0 md:border-r border-[color:var(--border-subtle)] p-2 md:p-3 flex md:flex-col gap-1 flex-shrink-0 bg-[color:var(--surface-raised)]/30 overflow-x-auto"
          >
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
          </nav>

          {/* Tab Content Panel */}
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
              className={activeTab === "personal" ? "space-y-6 animate-in fade-in duration-150" : "hidden"}
            >
              <div>
                <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Personal Info</h2>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                  Personal and account information — not related to AI configuration.
                </p>
              </div>

              {profile && (
                <div className="space-y-4">
                  {/* Username - Strictly Read-only / Disabled */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="account-username">
                        Username
                      </label>
                      <span className="text-[10px] font-medium text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] px-2 py-0.5 rounded">
                        Read-only
                      </span>
                    </div>
                    <input
                      id="account-username"
                      value={profile.username}
                      disabled
                      readOnly
                      aria-readonly="true"
                      className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-muted)] cursor-not-allowed opacity-80"
                    />
                    <p className="text-xs text-[color:var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      <span>Username cannot be changed.</span>
                    </p>
                  </div>

                  {/* Email - System Controlled */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="account-email">
                      Email
                    </label>
                    <input
                      id="account-email"
                      value={profile.email}
                      disabled
                      readOnly
                      aria-readonly="true"
                      className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-muted)] cursor-not-allowed opacity-80"
                    />
                  </div>

                  {/* Full Name - User Editable */}
                  <Field id="account-full-name" label="Full name" value={fullName} onChange={setFullName} />

                  {/* Phone */}
                  <PhoneField
                    idPrefix="account-phone"
                    countryCode={phoneCountryCode}
                    onCountryCodeChange={setPhoneCountryCode}
                    number={phone}
                    onNumberChange={setPhone}
                    error={phoneProblem}
                  />

                  {/* Institution */}
                  <Field id="account-affiliation" label="Institution" value={affiliation} onChange={setAffiliation} required={false} />

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

                  {saveError && (
                    <p role="alert" className="text-sm text-[color:var(--state-danger)]">
                      {saveError}
                    </p>
                  )}
                  {saved && (
                    <p role="status" className="text-sm text-[color:var(--state-success)]">
                      Saved.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={saving || phoneProblem !== null}
                    aria-busy={saving}
                    className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2"
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

                  {/* Subscription section */}
                  <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 mt-6">
                    <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Subscription</h3>
                    <p className="mt-2 text-sm text-[color:var(--text-primary)]">
                      Current Plan: <span className="font-medium">{isPremium ? "Premium" : "Free"}</span>
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">Managed centrally — not editable from this form.</p>
                    <button
                      type="button"
                      onClick={onManagePremium}
                      disabled={!onManagePremium}
                      className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer"
                    >
                      {isPremium ? "Manage Premium Plan" : "Upgrade to Premium"}
                    </button>
                  </div>
                </div>
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
                  Manage your password, authentication, and security credentials.
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
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2"
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
                  Your Scholar session uses encrypted tokens. Multi-account linking allows switching authenticated profiles seamlessly.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
