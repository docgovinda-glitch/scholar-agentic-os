/**
 * Onboarding progress indicator — Section 15 of the first-login journey:
 * Login -> AI Access -> Knowledge Vault (optional) -> Workshop.
 *
 * Purely orientational: "where am I in this three-step flow", nothing here
 * is interactive or skips ahead (skipping is each stage's own affordance, not
 * a click on this strip). Shown only on the onboarding path — AiAccessPage's
 * "onboarding" mode and VaultSetupScreen — never once onboarding is behind
 * the user, since there is no multi-stage flow left to be "in".
 *
 * The `id` "ai-setup" is kept as the internal identifier for the first stage
 * even though the page behind it is now AI Access (there used to be a
 * separate AiSetupScreen) — renaming the id would be a pointless diff through
 * every caller for something nothing outside this file reads.
 */

export type OnboardingStage = "ai-setup" | "knowledge" | "workshop";

const STEPS: { id: OnboardingStage; label: string; optional?: boolean }[] = [
  { id: "ai-setup", label: "AI Access" },
  { id: "knowledge", label: "Knowledge", optional: true },
  { id: "workshop", label: "Workshop" },
];

export default function OnboardingProgress({ current }: { current: OnboardingStage }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="mb-6 flex items-center gap-2 text-xs" aria-label="Onboarding progress">
      {STEPS.map((step, i) => {
        const isCurrent = step.id === current;
        const isDone = i < currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-[color:var(--text-muted)]" aria-hidden="true">→</span>}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={
                isCurrent
                  ? "font-medium text-[color:var(--accent)]"
                  : isDone
                    ? "text-[color:var(--text-secondary)]"
                    : "text-[color:var(--text-muted)]"
              }
            >
              {step.label}
              {step.optional && <span className="text-[color:var(--text-muted)]"> (Optional)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
