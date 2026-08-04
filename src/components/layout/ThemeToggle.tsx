import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "../../hooks/useTheme";

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Three-way theme control.
 *
 * A segmented control rather than a single toggle button, because the three
 * states are not orderable — cycling light → dark → system through one button
 * gives no indication of what the next press does, and hides "system"
 * entirely behind two presses.
 *
 * Rendered as a radiogroup: each option is a real radio, so a screen reader
 * announces the set, the current selection, and the count, and arrow keys move
 * between options natively. A row of three buttons would announce as three
 * unrelated controls with no indication of which is active.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-0.5 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            // The icon alone is not a label. Without this the control
            // announces as "button" three times over.
            aria-label={label}
            title={`${label} theme`}
            onClick={() => setPreference(value)}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-md",
              "transition-colors duration-[var(--motion-fast)]",
              "cursor-pointer",
              selected
                ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-[var(--shadow-sm)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]",
            ].join(" ")}
          >
            {/* The button carries the accessible name; the icon is decorative
                and would otherwise be announced twice. */}
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
