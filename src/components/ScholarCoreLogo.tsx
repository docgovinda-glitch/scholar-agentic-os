/**
 * SCHOLAR CORE logo component — reusable across all headers, navigation, and workspaces.
 *
 * Renders the animated "AI Breathing" Veena core logo:
 * - Image asset: cognitive_authority_veena_logo_v7b_colored_details.png
 * - Continuous 360-degree linear rotation (14s)
 * - Pulsing/Breathing scale container (1.0 -> 1.08, 3.5s)
 * - Dynamic warm orange (#FF7A00) & magenta (#E02875) ambient aura glow
 */

interface ScholarCoreLogoProps {
  /** Size variant: 'sm' (24px), 'md' (32px), 'lg' (48px), 'xl' (64px) */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to include the wordmark "SCHOLAR CORE" text */
  withText?: boolean;
  /** CSS class to apply to the container */
  className?: string;
  /** Alt text for the logo image. Defaults to empty string (decorative) to prevent redundant screen reader speech and label mismatches. */
  alt?: string;
}

export default function ScholarCoreLogo({
  size = 'md',
  withText = false,
  className = '',
  alt = '',
}: ScholarCoreLogoProps) {
  const sizes = {
    sm: { mark: 24, text: 12, gap: 8 },
    md: { mark: 32, text: 14, gap: 10 },
    lg: { mark: 48, text: 16, gap: 12 },
    xl: { mark: 64, text: 18, gap: 16 },
  };
  const { mark, text, gap } = sizes[size];

  // Animated AI Breathing & Rotating Veena Logo Mark
  const logoMark = (
    <div
      className="ai-logo-container relative flex items-center justify-center flex-shrink-0"
      style={{ width: `${mark}px`, height: `${mark}px` }}
      data-testid="scholar-core-animated-logo"
    >
      <img
        src="cognitive_authority_veena_logo_v7b_colored_details.png"
        alt={alt}
        aria-hidden={!alt ? true : undefined}
        width={mark}
        height={mark}
        className="ai-logo-spin object-contain select-none pointer-events-none rounded-full"
        style={{ width: `${mark}px`, height: `${mark}px` }}
        loading="eager"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.startsWith(window.location.origin + '/cognitive_authority_veena_logo_v7b_colored_details.png')) {
            target.src = '/cognitive_authority_veena_logo_v7b_colored_details.png';
          }
        }}
      />
    </div>
  );

  if (!withText) {
    return <div className={`inline-flex items-center justify-center ${className}`}>{logoMark}</div>;
  }

  return (
    <div className={`flex items-center gap-[${gap}px] ${className}`}>
      {logoMark}
      <div className="flex flex-col leading-tight select-none">
        <span
          className="font-bold tracking-tight text-[color:var(--text-primary)]"
          style={{ fontSize: `${text}px` }}
        >
          SCHOLAR
        </span>
        <span
          className="font-semibold text-[color:var(--text-secondary)] opacity-70"
          style={{ fontSize: `${text * 0.75}px` }}
        >
          CORE
        </span>
      </div>
    </div>
  );
}
