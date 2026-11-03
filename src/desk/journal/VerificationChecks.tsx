import { useMemo } from "react";
import { checkStatistics, formatP } from "../../domain/journal/statcheck";
import { numberFigures, type ManuscriptFigure } from "../../domain/journal/figures";
import { abstractNumbersMissingFromBody, abstractOf, checkNumbering, checkSpelling, flaggedPhrases, numberLabel } from "../../domain/journal/manuscriptChecks";

const TONE = {
  ok: "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]",
  warn: "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]",
  bad: "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]",
  muted: "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]",
};

/** Runs every check; pure apart from memoisation, so the caller can gate on it. */
export function useVerification(markdown: string, figures: ManuscriptFigure[] = []) {
  return useMemo(() => {
    const stats = checkStatistics(markdown);
    const spelling = checkSpelling(markdown);
    const abstractMissing = abstractNumbersMissingFromBody(markdown);
    const numbering = checkNumbering(markdown);
    const phrases = flaggedPhrases(markdown);
    const badStats = stats.filter((s) => !s.consistent && !s.oneTailedFits).length;
    const numberingProblems = numbering.filter((n) => n.missing.length || n.outOfOrder.length).length;
    // Figure and table objects: each must be referred to, and each reference must have an object.
    const objects = numberFigures(markdown, figures);
    const objectProblems = objects.unmentioned.length + objects.missing.length;
    const problems = badStats + spelling.mixedWords.length + abstractMissing.length + numberingProblems + objectProblems;
    return { stats, spelling, hasAbstract: abstractOf(markdown).length > 0, abstractMissing, numbering, phrases, problems, badStats, objects, hasObjects: figures.length > 0 || objects.missing.length > 0 };
  }, [markdown, figures]);
}

function Check({ title, tone, status, children }: { title: string; tone: keyof typeof TONE; status: string; children?: React.ReactNode }) {
  return (
    <li className="py-2.5 border-b border-[color:var(--border-subtle)] last:border-0 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[color:var(--text-primary)]">{title}</span>
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${TONE[tone]}`}>{status}</span>
      </div>
      {children && <div className="text-[11px] text-[color:var(--text-secondary)] space-y-1">{children}</div>}
    </li>
  );
}

/**
 * Checks that read the text the way an editor would. Each finding names the
 * words or numbers it is about; none is a score.
 */
export default function VerificationChecks({ markdown, figures = [], title = "3. Verification" }: { markdown: string; figures?: ManuscriptFigure[]; title?: string }) {
  const v = useVerification(markdown, figures);
  const hasText = markdown.trim().length > 0;
  const pill = !hasText
    ? { tone: TONE.muted, text: "Nothing to check yet" }
    : v.problems === 0
    ? { tone: TONE.ok, text: "No problems found" }
    : { tone: TONE.bad, text: `${v.problems} to fix` };

  const statIssues = v.stats.filter((s) => !s.consistent);
  const mixedVariety = v.spelling.usWords.length > 0 && v.spelling.ukWords.length > 0;

  return (
    <section aria-label="Verification" className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-bold text-sm text-[color:var(--text-primary)]">{title}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${pill.tone}`}>{pill.text}</span>
      </div>
      {hasText && (
        <ul aria-label="Checks">
          <Check
            title="Statistics recomputed"
            tone={v.stats.length === 0 ? "muted" : v.badStats ? "bad" : statIssues.length ? "warn" : "ok"}
            status={v.stats.length === 0 ? "None found" : v.badStats ? `${v.badStats} don't add up` : statIssues.length ? "Check one-tailed" : `${v.stats.length} consistent`}
          >
            {v.stats.length === 0 ? (
              <p>No results written as t(df) = …, F(df1, df2) = …, r(df) = …, χ2(df) = … or z = … with a p-value were found.</p>
            ) : (
              <>
                <p>Each p-value is recomputed from the reported statistic and degrees of freedom, allowing for rounding.</p>
                {statIssues.map((s) => (
                  <p key={s.index}>
                    <code className="text-[11px]">{s.text}</code>: recomputed p {formatP(s.computedP)}
                    {s.oneTailedFits ? " two-tailed; consistent if the test was one-tailed (say so in the text)." : s.decisionError ? ". This changes the conclusion at .05." : "."}
                  </p>
                ))}
              </>
            )}
          </Check>
          <Check
            title="Spelling consistency"
            tone={v.spelling.mixedWords.length ? "bad" : mixedVariety ? "warn" : "ok"}
            status={v.spelling.mixedWords.length ? `${v.spelling.mixedWords.length} spelt two ways` : mixedVariety ? "US and UK mixed" : "Consistent"}
          >
            {v.spelling.mixedWords.map((w) => (
              <p key={w.us}>
                “{w.us}” ({w.usCount}) and “{w.uk}” ({w.ukCount})
              </p>
            ))}
            {mixedVariety && v.spelling.mixedWords.length === 0 && (
              <p>
                US forms ({v.spelling.usWords.slice(0, 4).join(", ")}) and UK forms ({v.spelling.ukWords.slice(0, 4).join(", ")}). Use one throughout: the variety your journal or university asks for.
              </p>
            )}
          </Check>
          <Check
            title="Abstract numbers in the body"
            tone={!v.hasAbstract ? "muted" : v.abstractMissing.length ? "bad" : "ok"}
            status={!v.hasAbstract ? "No abstract" : v.abstractMissing.length ? `${v.abstractMissing.length} only in abstract` : "All reported"}
          >
            {v.abstractMissing.length > 0 && <p>The abstract states {v.abstractMissing.join(", ")}, but the rest of the manuscript doesn't. Report {v.abstractMissing.length === 1 ? "it" : "them"} in Results, or correct the abstract.</p>}
          </Check>
          {v.hasObjects && (
            <Check
              title="Figures and tables referred to"
              tone={v.objects.unmentioned.length || v.objects.missing.length ? "bad" : "ok"}
              status={v.objects.unmentioned.length || v.objects.missing.length ? "Fix references" : `${v.objects.figures.length + v.objects.tables.length} numbered`}
            >
              {v.objects.unmentioned.length > 0 && (
                <p>
                  Never referred to in the text: {v.objects.unmentioned.map((f) => `${f.kind === "table" ? "table" : "figure"} “${f.caption || f.id}”`).join(", ")}. Journals expect every one to be cited; refer to it from the Studio or remove it.
                </p>
              )}
              {v.objects.missing.length > 0 && <p>References to nothing: {v.objects.missing.join(", ")}. The figure or table was removed or never added.</p>}
            </Check>
          )}
          {v.numbering.map((n) => (
            <Check
              key={`${n.kind}-${n.chapter ?? ""}`}
              title={n.chapter !== undefined ? `${n.kind} numbering, chapter ${n.chapter}` : `${n.kind} numbering`}
              tone={n.missing.length || n.outOfOrder.length ? "bad" : "ok"}
              status={n.missing.length || n.outOfOrder.length ? "Out of sequence" : `${n.order.length} in order`}
            >
              {n.missing.length > 0 && <p>Never mentioned: {n.missing.map((x) => numberLabel(n, x)).join(", ")}.</p>}
              {n.outOfOrder.length > 0 && <p>First mentioned before a lower number: {n.outOfOrder.map((x) => numberLabel(n, x)).join(", ")}. Number them in order of first mention.</p>}
            </Check>
          ))}
          <Check title="Phrases reviewers flag as AI-sounding" tone={v.phrases.length ? "warn" : "ok"} status={v.phrases.length ? `${v.phrases.length} found` : "None"}>
            {v.phrases.length > 0 && <p>{v.phrases.map((p) => `“${p.phrase}” (${p.count})`).join(", ")}. Not an error; worth rewording.</p>}
          </Check>
        </ul>
      )}
    </section>
  );
}
