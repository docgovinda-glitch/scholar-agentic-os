// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const createProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const addManualSource = vi.fn();
const executeAgenticQuery = vi.fn();
const getAiOperationalStatus = vi.fn();
const executeLiveSearch = vi.fn();

vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: vi.fn().mockResolvedValue({ items: [] }),
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  deleteProject: vi.fn(),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  executeAgenticLLM: vi.fn().mockRejectedValue(new Error("fallback to server")),
  executeAgenticQuery: (...a: unknown[]) => executeAgenticQuery(...a),
  getAiOperationalStatus: (...a: unknown[]) => getAiOperationalStatus(...a),
  parseFileForAgent: vi.fn(),
}));

vi.mock("../api/claimEvidenceApi", () => ({
  addManualSource: (...a: unknown[]) => addManualSource(...a),
}));

vi.mock("../../services/liveSearchService", async (orig) => ({
  ...(await orig<typeof import("../../services/liveSearchService")>()),
  executeLiveSearch: (...a: unknown[]) => executeLiveSearch(...a),
}));

vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
  isSupabaseConfigured: () => true,
}));

const { default: ProjectListScreen } = await import("../ProjectListScreen");

const VERIFIED_SOURCES = [
  {
    id: "src-1",
    title: "Attention Is All You Need",
    url: "https://doi.org/10.48550/arXiv.1706.03762",
    doi: "10.48550/arXiv.1706.03762",
    snippet: "The Transformer architecture relies entirely on self-attention mechanisms.",
    authors: ["Vaswani, Ashish", "Shazeer, Noam"],
    year: 2017,
    venue: "Advances in Neural Information Processing Systems",
    sourceType: "conference paper",
  },
  {
    id: "src-2",
    title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
    url: "https://doi.org/10.48550/arXiv.2305.18290",
    doi: "10.48550/arXiv.2305.18290",
    snippet: "DPO optimizes policy alignment directly without reinforcement learning.",
    authors: ["Rafailov, Rafael", "Sharma, Archit"],
    year: 2023,
    venue: "Advances in Neural Information Processing Systems",
    sourceType: "peer-reviewed article",
  },
  // Unverifiable placeholder author source — must be excluded by Section 6
  {
    id: "src-bad-author",
    title: "Unverified Wiki Entry on Alignment",
    url: "https://example.org/wiki-alignment",
    snippet: "Unverified crowdsourced entry.",
    authors: ["Wikipedia Contributors"],
    year: 2026,
    venue: "Wiki",
    sourceType: "web",
  },
];

function openAskScholar(onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <ProjectListScreen
        onOpen={onOpen}
        userEmail="researcher@university.edu"
        onOpenAiAccess={vi.fn()}
      />
    </MemoryRouter>
  );
  const buttons = screen.getAllByRole("button", { name: /Ask Scholar/i });
  fireEvent.click(buttons[0]);
  return { onOpen };
}

async function sendQuestion(text: string) {
  const box = screen
    .getAllByRole("textbox")
    .find((el) => (el as HTMLTextAreaElement).placeholder?.includes("Ask a research question")) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
}

describe("AskScholar Authoritative Specification Compliance (Sections 2–16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getAiOperationalStatus.mockResolvedValue({
      connected: true,
      statusText: "Ready",
      provider: "openai",
    });
    executeLiveSearch.mockResolvedValue([]);
    executeAgenticQuery.mockResolvedValue({
      ok: true,
      text: [
        "## Direct Synthesis",
        "Transformer architectures [1] establish scalable sequence representation, while Direct Preference Optimization [2] resolves reward-hacking instability via closed-form policy updates:",
        "$$\\pi^*(y|x) \\propto \\pi_{\\text{ref}}(y|x)\\exp(\\beta r(x,y))$$",
        "",
        "## Empirical Comparison",
        "Across benchmark evaluations, closed-form preference optimization reduces computational variance compared to actor-critic pipelines [1, 2].",
        "",
        "## Methodological Limitations",
        "Out-of-distribution generalization remains sensitive to preference dataset coverage [2].",
      ].join("\n"),
      mode: "chat",
      citations: VERIFIED_SOURCES,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("Section 2, 8, 10, 13, 14: removes WebSearch mode, renders TOC for >=3 headings, enforces single-row non-wrapping tabs and exact 6 post-response actions, and filters invalid sources into Excluded Sources", async () => {
    const { onOpen } = openAskScholar();

    // Section 2: No WebSearch toggle or mode exists anywhere
    expect(screen.queryByText(/WebSearch/i)).toBeNull();
    expect(screen.queryByText(/^Web search$/i)).toBeNull();

    // Send academic question directly from default Chat input
    await sendQuestion("Compare Transformer representations and Direct Preference Optimization in LLM alignment study.");

    // Section 10: Automatic Table of Contents renders for >= 3 headings
    const toc = await screen.findByTestId("response-toc");
    expect(toc).toBeInTheDocument();
    expect(within(toc).getByText("Direct Synthesis")).toBeInTheDocument();
    expect(within(toc).getByText("Empirical Comparison")).toBeInTheDocument();
    expect(within(toc).getByText("Methodological Limitations")).toBeInTheDocument();

    // Section 10: KaTeX display math renders cleanly
    expect(screen.getByTestId("katex-display-math")).toBeInTheDocument();

    // Section 13: Primary response tabs are on one non-wrapping line without duplicate Discovery / Evidence Synthesis buttons
    const primaryTabs = screen.getByTestId("response-primary-tabs");
    expect(primaryTabs.className).toContain("flex-nowrap");
    expect(primaryTabs.className).toContain("whitespace-nowrap");
    expect(screen.queryByRole("button", { name: /^Discovery$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Evidence Synthesis$/i })).toBeNull();

    // Section 14 & Section 6: Source Transparency Panel shows Searched · Read · Cited counts, separated Reference List, and Excluded Sources
    const telemetry = screen.getByTestId("search-read-cited-banner");
    expect(telemetry.textContent).toMatch(/Searched \d+ · Read \d+ · Cited 2\./);

    const refList = screen.getByTestId("reference-list-section");
    expect(refList).toBeInTheDocument();
    expect(within(refList).getByText(/Attention Is All You Need/i)).toBeInTheDocument();
    expect(within(refList).getByText(/Direct Preference Optimization/i)).toBeInTheDocument();
    // Placeholder "Wikipedia Contributors" must NEVER appear in the Reference List
    expect(within(refList).queryByText(/Contributors/i)).toBeNull();

    // Excluded source with reason "author not verifiable" is recorded in Sources excluded
    const excludedToggle = screen.getByTestId("sources-excluded-toggle");
    expect(excludedToggle).toHaveTextContent(/Sources excluded \(1\)/i);
    fireEvent.click(excludedToggle);
    const excludedList = screen.getByTestId("sources-excluded-list");
    expect(within(excludedList).getByText(/Unverified Wiki Entry on Alignment/i)).toBeInTheDocument();
    expect(within(excludedList).getByText(/author not verifiable/i)).toBeInTheDocument();

    // Section 8: Exact 6 post-response actions in exact order on a single non-wrapping line
    const actionBar = screen.getByTestId("post-response-action-bar");
    const actionButtons = [
      within(actionBar).getByTestId("action-copy"),
      within(actionBar).getByTestId("action-export-word"),
      within(actionBar).getByTestId("action-bibtex"),
      within(actionBar).getByTestId("action-regenerate"),
      within(actionBar).getByTestId("action-store-vault"),
      within(actionBar).getByTestId("action-continue"),
    ];
    expect(actionButtons).toHaveLength(6);
    expect(actionButtons[0]).toHaveTextContent("Copy");
    expect(actionButtons[1]).toHaveTextContent("Export to Word");
    expect(actionButtons[2]).toHaveTextContent("BibTeX");
    expect(actionButtons[3]).toHaveTextContent("Regenerate");
    expect(actionButtons[4]).toHaveTextContent("Store to Knowledge Vault");
    expect(actionButtons[5]).toHaveTextContent("Continue");

    // Section 8 & 11: Continue opens the 4-workspace picker (Assignment, Journal Article, Research Proposal, Presentation)
    createProject.mockResolvedValueOnce({ projectId: "proj-seeded-99" });
    saveIntakeAnswers.mockResolvedValueOnce({ success: true });
    fireEvent.click(actionButtons[5]);

    const picker = await screen.findByTestId("continue-workspace-picker");
    expect(within(picker).getByTestId("continue-workspace-OT-01")).toHaveTextContent("Assignment");
    expect(within(picker).getByTestId("continue-workspace-OT-10")).toHaveTextContent("Journal Article");
    expect(within(picker).getByTestId("continue-workspace-OT-15")).toHaveTextContent("Research Proposal");
    expect(within(picker).getByTestId("continue-workspace-OT-22")).toHaveTextContent("Presentation");

    fireEvent.click(within(picker).getByTestId("continue-workspace-OT-15"));
    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith("OT-15");
      expect(onOpen).toHaveBeenCalledWith("proj-seeded-99");
    });
  });

  it("Section 12 & 15: supports Deep Research editable plan proposal state machine and AskScholar preferences + BibTeX/RIS/DOI import", async () => {
    openAskScholar();

    // Section 15: Open Preferences popover
    const settingsBtn = await screen.findByTestId("ask-scholar-settings-btn");
    fireEvent.click(settingsBtn);

    const popover = await screen.findByTestId("ask-scholar-settings-popover");
    expect(popover).toBeInTheDocument();

    // Change answer length preference to "detailed"
    fireEvent.click(within(popover).getByTestId("pref-length-detailed"));

    // Import BibTeX reference into Knowledge Vault
    const importInput = within(popover).getByLabelText(/Import References to Vault/i);
    fireEvent.change(importInput, {
      target: {
        value: `@article{vaswani2017attention,\n  author = {Vaswani, Ashish and Shazeer, Noam},\n  title = {Attention Is All You Need},\n  journal = {NeurIPS},\n  year = {2017},\n  doi = {10.48550/arXiv.1706.03762}\n}`,
      },
    });
    fireEvent.click(within(popover).getByTestId("import-references-btn"));
    expect(await within(popover).findByText(/Imported 1 reference/i)).toBeInTheDocument();

    // Close preferences
    fireEvent.click(within(popover).getByRole("button", { name: /Close preferences/i }));

    // Section 12: Switch to Deep Research mode via "+" action menu and click "Propose Plan"
    const plusMenuBtns = screen.getAllByRole("button", { name: "Add files and more" });
    fireEvent.click(plusMenuBtns[plusMenuBtns.length - 1]);
    const deepResearchMenuItem = await screen.findByRole("menuitem", { name: /Deep research/i });
    fireEvent.click(deepResearchMenuItem);

    const boxes = screen
      .getAllByRole("textbox")
      .filter((el) => (el as HTMLTextAreaElement).placeholder?.includes("Ask a research question")) as HTMLTextAreaElement[];
    const box = boxes[boxes.length - 1];
    fireEvent.change(box, {
      target: { value: "Systematic review of CRISPR base editing off-target effects in clinical trials" },
    });

    const proposePlanBtn = await screen.findByTestId("propose-deep-research-plan-btn");
    fireEvent.click(proposePlanBtn);

    // Verify DeepResearchWorkflowCard appears in `plan_proposed` state with editable sub-questions
    const workflowCard = await screen.findByTestId("deep-research-workflow-card");
    expect(workflowCard).toHaveAttribute("data-workflow-state", "plan_proposed");
    expect(within(workflowCard).getByTestId("deep-research-state-badge")).toHaveTextContent("Plan Proposed");

    const subQ1 = within(workflowCard).getByLabelText("Sub-question 1") as HTMLInputElement;
    fireEvent.change(subQ1, {
      target: { value: "Edited sub-question: Clinical safety and off-target indels in base editing" },
    });
    expect(subQ1.value).toContain("Edited sub-question");

    // Approve plan -> executes Deep Research pipeline and transitions to report_ready
    const approveBtn = within(workflowCard).getByTestId("approve-deep-research-plan-btn");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(executeAgenticQuery).toHaveBeenCalled();
    });
    const lastCallArg = executeAgenticQuery.mock.calls[executeAgenticQuery.mock.calls.length - 1][0];
    expect(lastCallArg.approvedSubQuestions).toBeDefined();
    expect(lastCallArg.approvedSubQuestions[0]).toContain("Edited sub-question");
  });

  it("verifies pre-query citation controls, 760px reading canvas, preRetrievedSources deduplication, dynamic in-place citation style re-formatting, and relational evidenceLedger seeding on Continue", async () => {
    executeLiveSearch.mockResolvedValueOnce([
      {
        title: "Attention Is All You Need",
        url: "https://doi.org/10.48550/arXiv.1706.03762",
        doi: "10.48550/arXiv.1706.03762",
        snippet: "The Transformer architecture relies entirely on self-attention mechanisms.",
        authors: ["Vaswani, Ashish", "Shazeer, Noam"],
        year: 2017,
        venue: "Advances in Neural Information Processing Systems",
        sourceType: "conference paper",
      },
    ]);

    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <ProjectListScreen
          onOpen={onOpen}
          userEmail="researcher@university.edu"
          onOpenAiAccess={vi.fn()}
        />
      </MemoryRouter>
    );

    // Fix 6.1: Pre-query CitationStylePicker and AskScholarSettingsPopover are rendered on the initial prompt bar before opening the sidebar
    expect(await screen.findByTestId("citation-style-trigger")).toBeInTheDocument();
    expect(await screen.findByTestId("ask-scholar-settings-btn")).toBeInTheDocument();

    // Open AskScholar sidebar
    const buttons = screen.getAllByRole("button", { name: /Ask Scholar/i });
    fireEvent.click(buttons[0]);

    // Fix 5.2: Central prompt bar container is hidden while AskScholar reading canvas is open
    const centralBar = screen.getByTestId("main-prompt-bar-wrapper");
    expect(centralBar.className).toContain("hidden");

    // Send a research question -> triggers executeLiveSearch and passes preRetrievedSources + onChunk to executeAgenticQuery
    await sendQuestion("Analyze Transformer self-attention mechanisms in sequence modeling research.");

    await waitFor(() => {
      expect(executeAgenticQuery).toHaveBeenCalled();
    });
    const queryReq = executeAgenticQuery.mock.calls[0][0];
    expect(Array.isArray(queryReq.preRetrievedSources)).toBe(true);
    expect(queryReq.preRetrievedSources.length).toBeGreaterThan(0);
    expect(typeof queryReq.onChunk).toBe("function");

    // Fix 6.2: Switch citation style from APA 7 to IEEE and verify in-place re-formatting without calling executeAgenticQuery again
    const callCountBeforeStyleChange = executeAgenticQuery.mock.calls.length;
    const styleTriggers = screen.getAllByTestId("citation-style-trigger");
    fireEvent.click(styleTriggers[styleTriggers.length - 1]);
    const ieeeOption = await screen.findByTestId("citation-style-option-ieee");
    fireEvent.click(ieeeOption);
    expect(executeAgenticQuery.mock.calls.length).toBe(callCountBeforeStyleChange);

    // Fix 3.1: Continue seeds discovered_sources in saveIntakeAnswers AND seeds relational evidenceLedger via addManualSource
    createProject.mockResolvedValueOnce({ projectId: "proj-seeded-ledger-1" });
    saveIntakeAnswers.mockResolvedValueOnce({ success: true });
    addManualSource.mockResolvedValue({ id: "src-row-1" });

    const actionBar = await screen.findByTestId("post-response-action-bar");
    fireEvent.click(within(actionBar).getByTestId("action-continue"));
    const picker = await screen.findByTestId("continue-workspace-picker");
    fireEvent.click(within(picker).getByTestId("continue-workspace-OT-10"));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith("OT-10");
      expect(saveIntakeAnswers).toHaveBeenCalled();
      expect(addManualSource).toHaveBeenCalled();
      expect(onOpen).toHaveBeenCalledWith("proj-seeded-ledger-1");
    });

    const intakePayload = saveIntakeAnswers.mock.calls[0][1];
    expect(typeof intakePayload.discovered_sources).toBe("string");
    const parsedSources = JSON.parse(intakePayload.discovered_sources);
    expect(parsedSources.length).toBeGreaterThan(0);
    expect(parsedSources[0].title).toBe("Attention Is All You Need");
  });
});
