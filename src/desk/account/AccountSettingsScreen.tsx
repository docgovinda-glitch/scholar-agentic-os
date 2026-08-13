import { useEffect, useState } from "react";
import { getProfile, saveProfileFields, updatePassword, type ProfileFields } from "../../services/supabaseAuthService";
import { getAiAccessStatus } from "../aiAccess/aiAccessApi";
import { EDUCATION_LEVELS, USER_TYPES } from "../../config/accountSchema";
import { Field, PhoneField, SelectField } from "../auth/AuthLayout";
import { e164Problem } from "../../config/countries";

/**
 * Account Settings — profile and account-level details only.
 *
 * The counterpart to AI Access after the standalone AI Settings page was
 * retired: AI Access is now the single place AI provider/model configuration
 * lives, and this is the single place account-level configuration lives.
 * Nothing here reads or writes user_ai_connections, user_ai_settings, or any
 * provider key — that separation is the entire point of splitting the two.
 *
 * Single Source of Truth with Create Account (AuthFlow.tsx's SignUpScreen):
 * both screens render the SAME fields, from the SAME shared components
 * (Field/SelectField/PhoneField in ./auth/AuthLayout) and the SAME
 * validators/options (config/accountSchema.ts, config/countries.ts) — see
 * accountSchema.ts's header comment for why that file exists. The only
 * intentional difference is password: Create Account requires one up front,
 * this screen never displays or pre-populates the existing password, only
 * an optional New Password / Confirm New Password pair.
 *
 * `username` is shown but not editable (see saveProfileFields's doc comment
 * — it doubles as the login identifier, so changing it is a real feature
 * with uniqueness/re-login implications, not a field on this form). Email
 * and subscription plan are shown but are system-controlled — see their own
 * read-only sections below — never ordinary editable text inputs, per the
 * user-controlled vs system-controlled split this screen and Create Account
 * both respect.
 *
 * 2026-08-14: Institutional ID and its document/verification workflow were
 * removed completely (accountSchema.ts's header comment explains why), and
 * Institution is optional here exactly as it is at registration.
 */
export default function AccountSettingsScreen({
  onClose,
  onManagePremium,
}: {
  onClose: () => void;
  /** Optional: wired by DeskApp to open AI Access on its Premium section. Omitted in tests that don't exercise it. */
  onManagePremium?: () => void;
}) {
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
          setPhoneCountryCode(result.profile.phoneCountryCode);
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

  const phoneProblem = e164Problem(phoneCountryCode, phone);

  async function handleSaveProfile() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      if (phoneProblem) {
        setSaveError(phoneProblem);
        return;
      }
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
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">Account Settings</h1>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
          >
            Close
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        {loadError && (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
            {loadError}
          </p>
        )}

        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Profile</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">Personal and account information — not related to AI configuration.</p>

          {profile && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="account-username">
                  Username
                </label>
                <input
                  id="account-username"
                  value={profile.username}
                  disabled
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-muted)]"
                />
                <p className="text-xs text-[color:var(--text-muted)]">Your username signs you in and can't be changed here.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  value={profile.email}
                  disabled
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-muted)]"
                />
              </div>

              <Field id="account-full-name" label="Full name" value={fullName} onChange={setFullName} />

              <PhoneField
                idPrefix="account-phone"
                countryCode={phoneCountryCode}
                onCountryCodeChange={setPhoneCountryCode}
                number={phone}
                onNumberChange={setPhone}
              />

              <Field id="account-affiliation" label="Institution" value={affiliation} onChange={setAffiliation} required={false} />

              <SelectField id="account-userType" label="User Type" value={userType} onChange={setUserType} options={USER_TYPES} />

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
                disabled={saving}
                className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
          {!profile && !loadError && <p className="mt-3 text-sm text-[color:var(--text-muted)]">Loading…</p>}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Subscription</h2>
          <p className="mt-2 text-sm text-[color:var(--text-primary)]">
            Current Plan: <span className="font-medium">{isPremium ? "Premium" : "Free"}</span>
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">Managed centrally — not editable from this form.</p>
          <button
            type="button"
            onClick={onManagePremium}
            disabled={!onManagePremium}
            className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
          >
            {isPremium ? "Manage Premium Plan" : "Upgrade to Premium"}
          </button>
        </section>

        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Password</h2>
          <div className="mt-4 space-y-4">
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
              className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
            >
              {passwordBusy ? "Changing…" : "Change password"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
