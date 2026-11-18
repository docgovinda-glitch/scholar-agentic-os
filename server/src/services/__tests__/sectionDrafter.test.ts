import { describe, it, expect, vi } from "vitest";
import type { Completer, CompletionCall } from "../../../../src/platform/completion";
import { draftSection, priorSectionsContext, researchContextFromAnswers, sectionMemory, type DraftSectionInput, runSectionDraft } from "../sectionDrafter";
import { BrowserAiRequiredError, UnusableAiResponseError } from "../../ai/aiRouteErrors";

/** A completer that answers each call with the next text, and records the calls. */
function scripted(...answers: Array<string | Error>): Completer & { calls: CompletionCall[] } {
  const calls: CompletionCall[] = [];
  const fn = vi.fn(async (call: CompletionCall) => {
    calls.push(call);
    const next = answers.shift() ?? "";
    if (next instanceof Error) throw next;
    return { text: next, provider: "openai", model: "test", inputTokensEstimate: 10, outputTokensEstimate: 20 };
  }) as unknown as Completer & { calls: CompletionCall[] };
  fn.calls = calls;
  return fn;
}

const words = (n: number) => Array.from({ length: n }, (_, i) => (i % 12 === 11 ? "end." : "word")).join(" ");

const INPUT: DraftSectionInput = {
  title: "Introduction",
  targetWords: 100,
  dialect: "en-GB",
  researchContext: "- Working title: Decoders",
  sectionBrief: "Establish the gap.",
  sources: [{ id: "ev-1", authors: ["Smith, J."], year: 2024, title: "A Prior Study", keyFindings: "X was observed in 40% of cases." }],
};

describe("draftSection: the one section drafter", () => {
  it("keeps verified citations as [CITE:id] tokens and lists them", async () => {
    const complete = scripted(`X has been studied [CITE:ev-1], yet a gap remains. ${words(100)}`);
    const r = await draftSection(complete, INPUT);
    expect(r.text).toContain("[CITE:ev-1]");
    expect(r.citedIds).toEqual(["ev-1"]);
    expect(r.usage.provider).toBe("openai");
    expect(r.memory.length).toBeGreaterThan(0);
    expect(r.memory).not.toContain("[CITE:");
  });

  it("removes a citation the model invented: never trusts the model's own list", async () => {
    const complete = scripted(`According to [CITE:ev-1] and [CITE:ev-999], X is true. ${words(100)}`);
    const r = await draftSection(complete, INPUT);
    expect(r.text).not.toContain("ev-999");
    expect(r.citedIds).toEqual(["ev-1"]);
    expect(r.strippedCitations).toContain("[CITE:ev-999]");
  });

  it("gives the model only the listed sources, the section's brief and the research context", async () => {
    const complete = scripted(words(100));
    await draftSection(complete, { ...INPUT, writtenSections: "[Methods]\nWe ran a trial." });
    const { systemPrompt, userPrompt } = complete.calls[0];
    expect(systemPrompt).toContain("ev-1");
    expect(userPrompt).toContain("Establish the gap.");
    expect(userPrompt).toContain("Decoders");
    expect(userPrompt).toContain("We ran a trial.");
  });

  it("asks once for an expansion when the draft is short, and keeps the shorter draft if that fails", async () => {
    const short = "A short draft.";
    const complete = scripted(short, new Error("provider down"));
    const r = await draftSection(complete, INPUT);
    expect(complete.calls).toHaveLength(2);
    expect(r.text).toBe(short);
  });

  it("keeps the first draft when the expansion would need the browser", async () => {
    const complete = scripted("A short draft.", new BrowserAiRequiredError({ challengeToken: "t", systemPrompt: "", userPrompt: "", taskType: "drafting" }));
    await expect(draftSection(complete, INPUT)).resolves.toMatchObject({ text: "A short draft." });
  });

  it("writes nothing when the model returns no text", async () => {
    await expect(draftSection(scripted("   "), INPUT)).rejects.toBeInstanceOf(UnusableAiResponseError);
  });

  it("follows the dialect without respelling a citation id", async () => {
    const ok = await draftSection(scripted(`We analyze the organization [CITE:organization_2020]. ${words(100)}`), {
      ...INPUT,
      sources: [{ ...INPUT.sources[0], id: "organization_2020" }],
    });
    expect(ok.text).toContain("analyse");
    expect(ok.text).toContain("[CITE:organization_2020]");
  });
});

describe("researchContextFromAnswers", () => {
  it("puts the known fields first and leaves out saved drafts, JSON and long values", () => {
    const ctx = researchContextFromAnswers({
      core_problem: "Decoding latency",
      working_title: "Fast Decoders",
      manuscript_markdown: "## Whole paper ...",
      word_budget_blueprint: '{"sections":[]}',
      field: "Quantum computing",
      notes: "x".repeat(400),
    });
    expect(ctx.split("\n")[0]).toBe("- Working title: Fast Decoders");
    expect(ctx).toContain("Research problem: Decoding latency");
    expect(ctx).toContain("Field: Quantum computing");
    expect(ctx).not.toMatch(/Whole paper|sections|xxxx/);
  });

  it("stays within its budget", () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, "value ".repeat(40)]));
    expect(researchContextFromAnswers(many, 1000).length).toBeLessThanOrEqual(1000);
  });
});

describe("priorSectionsContext and sectionMemory", () => {
  it("gives excerpts of written sections within a budget", () => {
    const ctx = priorSectionsContext([{ title: "Intro", text: "a ".repeat(5000) }, { title: "Methods", text: "We ran a trial." }], 1000);
    expect(ctx.length).toBeLessThanOrEqual(1200);
    expect(ctx).toContain("[Intro]");
  });

  it("keeps a section's opening sentences as its memory", () => {
    expect(sectionMemory("One. Two [CITE:a]. Three.", 12)).toBe("One. Two.");
  });
});

describe("runSectionDraft: the shared drafting loop", () => {
  type Call = Parameters<Completer>[0];
  const outcome = (text: string) => ({ text, provider: "p", model: "m", inputTokensEstimate: 1, outputTokensEstimate: 1 });
  /** A completer that streams each answer token by token. */
  const streaming = (answers: string[]) => {
    const calls: Call[] = [];
    const complete: Completer = async (call) => {
      calls.push(call);
      const text = answers.shift() ?? "";
      for (const t of text.split(/(\s+)/).filter(Boolean)) call.onToken?.(t);
      return outcome(text);
    };
    return { complete, calls };
  };
  const words = (n: number, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ") + ".";

  it("continues a short draft visibly and keeps the continuation", async () => {
    const { complete, calls } = streaming([words(20, "a"), words(30, "b")]);
    const seen: string[] = [];
    const out = await runSectionDraft(complete, {
      systemPrompt: "s",
      userPrompt: "u",
      minWords: 45,
      lengthen: { mode: "continue", prompt: (d) => `continue: ${d.length}` },
      stream: { onToken: (t) => seen.push(`t:${t.trim()}`), onReplace: (t) => seen.push(`r:${t.slice(0, 2)}`) },
    });
    expect(out.text).toMatch(/^a0[\s\S]*\n\nb0/);
    expect(calls[1].userPrompt).toMatch(/^continue:/);
    // The continuation starts from the draft shown as it is, then streams on.
    expect(seen.filter((x) => x.startsWith("r:"))).toEqual(["r:a0"]);
    expect(out.calls).toHaveLength(2);
  });

  it("drops a continuation that is not accepted and shows the draft as kept", async () => {
    const { complete } = streaming([words(10), words(10)]);
    const replaced: string[] = [];
    const out = await runSectionDraft(complete, {
      systemPrompt: "s",
      userPrompt: "u",
      minWords: 50,
      lengthen: { mode: "continue", prompt: () => "c", accept: () => false },
      stream: { onToken: () => {}, onReplace: (t) => replaced.push(t) },
    });
    expect(out.text).toBe(words(10));
    expect(replaced.at(-1)).toBe(words(10));
  });

  it("expand mode keeps a rewrite only when it is longer", async () => {
    const shorter = await runSectionDraft(streaming([words(20), words(10)]).complete, { systemPrompt: "s", userPrompt: "u", minWords: 40, lengthen: { mode: "expand", prompt: () => "e" } });
    expect(shorter.text).toBe(words(20));
    const longer = await runSectionDraft(streaming([words(20), words(40)]).complete, { systemPrompt: "s", userPrompt: "u", minWords: 40, lengthen: { mode: "expand", prompt: () => "e" } });
    expect(longer.text).toBe(words(40));
  });

  it("resumes from the text a stopped draft reached", async () => {
    const { complete, calls } = streaming(["More text."]);
    const out = await runSectionDraft(complete, { systemPrompt: "s", userPrompt: "u", minWords: 10, startFrom: "Earlier text.", lengthen: { mode: "continue", prompt: (d) => `after ${d}` } });
    expect(calls).toHaveLength(1);
    expect(calls[0].userPrompt).toBe("after Earlier text.");
    expect(out.text).toBe("Earlier text.\n\nMore text.");
  });

  it("keeps the draft when lengthening fails, but stops when the call was cancelled", async () => {
    let n = 0;
    const failing: Completer = async () => {
      if (n++ === 0) return outcome(words(5));
      throw new Error("provider down");
    };
    const kept = await runSectionDraft(failing, { systemPrompt: "s", userPrompt: "u", minWords: 50, lengthen: { mode: "continue", prompt: () => "c" } });
    expect(kept.text).toBe(words(5));

    const ctl = new AbortController();
    let m = 0;
    const cancelled: Completer = async () => {
      if (m++ === 0) return outcome(words(5));
      ctl.abort();
      throw new Error("aborted");
    };
    await expect(runSectionDraft(cancelled, { systemPrompt: "s", userPrompt: "u", minWords: 50, lengthen: { mode: "continue", prompt: () => "c" }, signal: ctl.signal })).rejects.toThrow("aborted");
  });

  it("an empty first answer is an error, never invented text", async () => {
    await expect(runSectionDraft(streaming([""]).complete, { systemPrompt: "s", userPrompt: "u", minWords: 10 })).rejects.toThrow();
  });
});
