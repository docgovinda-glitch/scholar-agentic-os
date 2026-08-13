/**
 * SCHOLAR CORE logo component — reusable across all surfaces.
 *
 * Renders as SVG so it scales cleanly at all sizes and can be
 * incorporated into headers, navigation, favicons, and marketing.
 *
 * Logo design principle: represents knowledge/research/connection/intelligence
 * without generic AI imagery. Uses a stylized "network node" concept with
 * a knowledge-book element.
 */

interface ScholarCoreLogoProps {
  /** Size variant: 'sm' (24px), 'md' (32px), 'lg' (48px), 'xl' (64px) */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to include the wordmark "SCHOLAR CORE" text */
  withText?: boolean;
  /** CSS class to apply to the container */
  className?: string;
}

export default function ScholarCoreLogo({
  size = 'md',
  withText = false,
  className = '',
}: ScholarCoreLogoProps) {
  const sizes = {
    sm: { mark: 24, text: 12, gap: 8 },
    md: { mark: 32, text: 14, gap: 10 },
    lg: { mark: 48, text: 16, gap: 12 },
    xl: { mark: 64, text: 18, gap: 16 },
  };
  const { mark, text, gap } = sizes[size];

  // SVG mark: stylized "knowledge network" — three connected nodes forming
  // a book/page shape, representing research connections and intelligence.
  const markSvg = (
    <svg
      width={mark}
      height={mark}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      {/* Background circle — subtle frame */}
      <circle cx="24" cy="24" r="23" fill="currentColor" opacity="0.05" />

      {/* Left node — represents knowledge/sources */}
      <circle cx="16" cy="24" r="4" fill="currentColor" />

      {/* Center node — represents research/synthesis */}
      <circle cx="24" cy="16" r="4" fill="currentColor" />

      {/* Right node — represents creation/output */}
      <circle cx="32" cy="24" r="4" fill="currentColor" />

      {/* Connection lines — represents workflow connection */}
      <line x1="19" y1="21" x2="22" y2="18" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <line x1="27" y1="18" x2="30" y2="21" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <line x1="30" y1="27" x2="27" y2="30" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <line x1="22" y1="30" x2="19" y2="27" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />

      {/* Center accent — page/book element */}
      <rect x="21" y="32" width="6" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  );

  if (!withText) {
    return <div className={className}>{markSvg}</div>;
  }

  return (
    <div className={`flex items-center gap-[${gap}px] ${className}`}>
      {markSvg}
      <div className="flex flex-col leading-tight">
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
