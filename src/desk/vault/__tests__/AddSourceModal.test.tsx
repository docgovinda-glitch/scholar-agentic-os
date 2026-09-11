// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mocks
const mockAddVaultItem = vi.fn();
vi.mock("../../../services/vaultContents", () => ({
  addVaultItem: (...args: unknown[]) => mockAddVaultItem(...args),
}));

const mockResolveDoiMetadata = vi.fn();
const mockResolveUrlMetadata = vi.fn();
vi.mock("../../../services/vault/metadataService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/vault/metadataService")>();
  return {
    ...actual,
    resolveDoiMetadata: (...args: unknown[]) => mockResolveDoiMetadata(...args),
    resolveUrlMetadata: (...args: unknown[]) => mockResolveUrlMetadata(...args),
    generateAPA7Citation: vi.fn(
      () => "Acharya, Amitav (2024). Towards a Global International Relations?. E-International Relations."
    ),
  };
});

const mockFetchDriveFiles = vi.fn();
const mockInitiateGoogleDriveAuth = vi.fn();
const mockInitiateOneDriveAuth = vi.fn();

vi.mock("../../../services/vault/cloudDriveService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/vault/cloudDriveService")>();
  return {
    ...actual,
    fetchDriveFiles: (...args: unknown[]) => mockFetchDriveFiles(...args),
    initiateGoogleDriveAuth: (...args: unknown[]) => mockInitiateGoogleDriveAuth(...args),
    initiateOneDriveAuth: (...args: unknown[]) => mockInitiateOneDriveAuth(...args),
  };
});

const mockListProjects = vi.fn().mockResolvedValue({
  projects: [
    { title: "Master's Thesis in AI" },
    { title: "Global Security Capstone" },
  ],
});
vi.mock("../../api", () => ({
  listProjects: () => mockListProjects(),
}));

const { default: AddSourceModal } = await import("../AddSourceModal");

describe("AddSourceModal — Streamlined 1-Step Intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a single-step dialog with smart input and core fields", () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Add Source" })).toBeInTheDocument();
    expect(screen.getByLabelText(/URL, DOI, or Reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Authors/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Publication Year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Journal \/ Publisher/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Source" })).toBeInTheDocument();
  });

  it("fetches and populates URL metadata seamlessly", async () => {
    mockResolveUrlMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Towards a Global International Relations?",
        authors: ["Amitav Acharya"],
        year: "2024",
        publisher: "E-International Relations",
        journal: "",
        doi: "",
        url: "https://www.e-ir.org/p/towards-a-global-international-relations",
        type: "website",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: { value: "https://www.e-ir.org/p/towards-a-global-international-relations" },
    });

    const fetchBtn = screen.getByRole("button", { name: "Fetch" });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(mockResolveUrlMetadata).toHaveBeenCalledWith(
        "https://www.e-ir.org/p/towards-a-global-international-relations"
      );
    });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Towards a Global International Relations?");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("Amitav Acharya");
      const yearInput = screen.getByLabelText(/Publication Year/i) as HTMLInputElement;
      expect(yearInput.value).toBe("2024");
      const journalInput = screen.getByLabelText(/Journal \/ Publisher/i) as HTMLInputElement;
      expect(journalInput.value).toBe("E-International Relations");
    });
  });

  it("fetches and populates DOI metadata directly", async () => {
    mockResolveDoiMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Attention Is All You Need",
        authors: ["Vaswani, Ashish", "Shazeer, Noam"],
        year: "2017",
        journal: "NeurIPS",
        doi: "10.48550/arXiv.1706.03762",
        url: "https://doi.org/10.48550/arXiv.1706.03762",
        type: "paper",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, { target: { value: "10.48550/arXiv.1706.03762" } });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      expect(mockResolveDoiMetadata).toHaveBeenCalledWith("10.48550/arxiv.1706.03762");
    });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Attention Is All You Need");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("Vaswani, Ashish, Shazeer, Noam");
    });
  });

  it("parses pasted BibTeX snippet automatically", async () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: {
        value: `@article{test2024, title={Deep Learning Survey}, author={LeCun, Yann}, year={2024}, journal={AI Review}}`,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Deep Learning Survey");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("LeCun, Yann");
      const yearInput = screen.getByLabelText(/Publication Year/i) as HTMLInputElement;
      expect(yearInput.value).toBe("2024");
    });
  });

  it("saves source directly and calls onSourceSaved + onClose", async () => {
    const fakeSavedItem = {
      id: "vault-item-123",
      title: "Clean Energy Transitions",
      authors: ["IEA"],
      year: "2023",
      content: "",
      createdAt: "2026-01-01",
    };
    mockAddVaultItem.mockResolvedValueOnce(fakeSavedItem);

    const onClose = vi.fn();
    const onSourceSaved = vi.fn();

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={onClose}
        onSourceSaved={onSourceSaved}
      />
    );

    // Enter title directly
    const titleInput = screen.getByLabelText(/^Title/i);
    fireEvent.change(titleInput, { target: { value: "Clean Energy Transitions" } });

    const saveBtn = screen.getByRole("button", { name: "Save Source" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAddVaultItem).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Clean Energy Transitions",
        })
      );
      expect(onSourceSaved).toHaveBeenCalledWith(fakeSavedItem);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows duplicate warning if source already exists in library", async () => {
    const existing = [
      {
        id: "existing-1",
        title: "Towards a Global International Relations?",
        content: "",
        createdAt: "2026-01-01",
      },
    ] as any;

    mockResolveUrlMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Towards a Global International Relations?",
        authors: ["Amitav Acharya"],
        year: "2024",
        url: "https://www.e-ir.org/p/towards-a-global-international-relations",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={existing}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: { value: "https://www.e-ir.org/p/towards-a-global-international-relations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      expect(screen.getByText(/Already in Vault/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save Anyway" })).toBeInTheDocument();
    });
  });

  it("renders Google Drive and OneDrive intake tabs and quick-action buttons", () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Tab buttons & quick action buttons
    expect(screen.getAllByRole("button", { name: /Google Drive/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /OneDrive/i })).toHaveLength(2);

    // Quick fetch buttons under smart input
    expect(screen.getByText(/Or fetch from:/i)).toBeInTheDocument();
  });

  it("shows setup card and 1-click connect when Google Drive is not connected", async () => {
    mockInitiateGoogleDriveAuth.mockResolvedValueOnce(undefined);

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        connectedDrives={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to Google Drive tab
    const gDriveTab = screen.getAllByRole("button", { name: /Google Drive/i })[0];
    fireEvent.click(gDriveTab);

    expect(screen.getByRole("heading", { name: /Connect Google Drive/i })).toBeInTheDocument();
    expect(screen.getAllByText(/zero document storage/i).length).toBeGreaterThanOrEqual(1);

    const connectBtn = screen.getByRole("button", { name: /Connect Google Drive/i });
    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(mockInitiateGoogleDriveAuth).toHaveBeenCalledWith("user-1");
    });
  });

  it("lists Google Drive files and populates title and cloud reference on selection", async () => {
    mockFetchDriveFiles.mockResolvedValueOnce([
      {
        id: "gdrive-doc-1",
        name: "Autonomous_Agentic_Workflows_2025.pdf",
        mimeType: "application/pdf",
        webViewLink: "https://drive.google.com/file/d/gdrive-doc-1/view",
        size: 2048576,
      },
    ]);

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        connectedDrives={[
          {
            id: "conn-1",
            provider: "google_drive",
            accountEmail: "researcher@gmail.com",
            connectedAt: "2026-01-01",
          },
        ]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to Google Drive tab
    const gDriveTab = screen.getAllByRole("button", { name: /Google Drive/i })[0];
    fireEvent.click(gDriveTab);

    // Wait for files to load
    await waitFor(() => {
      expect(mockFetchDriveFiles).toHaveBeenCalledWith("google_drive", "user-1");
      expect(screen.getByText("Autonomous_Agentic_Workflows_2025.pdf")).toBeInTheDocument();
    });

    // Click file to select it
    fireEvent.click(screen.getByText("Autonomous_Agentic_Workflows_2025.pdf"));

    // Title and web url should be populated
    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Autonomous Agentic Workflows 2025");
      const urlInput = screen.getByLabelText(/Link \/ Web URL/i) as HTMLInputElement;
      expect(urlInput.value).toBe("https://drive.google.com/file/d/gdrive-doc-1/view");
      expect(screen.getByText(/✓ Selected from Google Drive/i)).toBeInTheDocument();
    });
  });

  it("lists OneDrive files and populates title and cloud reference on selection", async () => {
    mockFetchDriveFiles.mockResolvedValueOnce([
      {
        id: "onedrive-doc-1",
        name: "Quantum_Algorithms_Review.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        webViewLink: "https://onedrive.live.com/view.aspx?id=onedrive-doc-1",
        size: 1048576,
      },
    ]);

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        connectedDrives={[
          {
            id: "conn-2",
            provider: "onedrive",
            accountEmail: "scholar@outlook.com",
            connectedAt: "2026-01-01",
          },
        ]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to OneDrive tab
    const oneDriveTab = screen.getAllByRole("button", { name: /OneDrive/i })[0];
    fireEvent.click(oneDriveTab);

    // Wait for files to load
    await waitFor(() => {
      expect(mockFetchDriveFiles).toHaveBeenCalledWith("onedrive", "user-1");
      expect(screen.getByText("Quantum_Algorithms_Review.docx")).toBeInTheDocument();
    });

    // Click file to select it
    fireEvent.click(screen.getByText("Quantum_Algorithms_Review.docx"));

    // Title and web url should be populated
    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Quantum Algorithms Review");
      const urlInput = screen.getByLabelText(/Link \/ Web URL/i) as HTMLInputElement;
      expect(urlInput.value).toBe("https://onedrive.live.com/view.aspx?id=onedrive-doc-1");
      expect(screen.getByText(/✓ Selected from OneDrive/i)).toBeInTheDocument();
    });
  });

  it("automatically infers full metadata (Authors, Year, Publisher, Drive URL) and provides Drive links upon selecting document like Govinda_Shah_CV.docx", async () => {
    mockFetchDriveFiles.mockResolvedValueOnce([
      {
        id: "cv-file-123",
        name: "Govinda_Shah_CV.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        lastModified: "2026-03-01T10:00:00.000Z",
      },
    ]);

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        connectedDrives={[
          {
            id: "conn-google-1",
            provider: "google_drive",
            accountEmail: "doc.govinda@gmail.com",
            accountName: "Govinda Shah",
            connectedAt: "2026-01-01",
          },
        ]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to Google Drive tab
    const gDriveTab = screen.getAllByRole("button", { name: /Google Drive/i })[0];
    fireEvent.click(gDriveTab);

    // Wait for Google Drive workspace header link and files to render
    await waitFor(() => {
      expect(screen.getByText(/↗ Open Google Drive/i)).toBeInTheDocument();
      expect(screen.getByText("Govinda_Shah_CV.docx")).toBeInTheDocument();
    });

    // Check Open in Drive link exists on the file row
    const openInDriveLink = screen.getByTitle("Open directly in Google Drive") as HTMLAnchorElement;
    expect(openInDriveLink).toBeInTheDocument();
    expect(openInDriveLink.href).toContain("drive.google.com");

    // Click "Select Source →" button
    const selectBtn = screen.getByRole("button", { name: /Select Source →/i });
    fireEvent.click(selectBtn);

    // Verify all metadata fields are automatically inferred and populated
    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Govinda Shah CV");

      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("Govinda Shah");

      const yearInput = screen.getByLabelText(/Publication Year/i) as HTMLInputElement;
      expect(yearInput.value).toBe("2026");

      const journalInput = screen.getByLabelText(/Journal \/ Publisher/i) as HTMLInputElement;
      expect(journalInput.value).toBe("Curriculum Vitae / Academic Profile");

      const urlInput = screen.getByLabelText(/Link \/ Web URL/i) as HTMLInputElement;
      expect(urlInput.value).toContain("drive.google.com/file/d/cv-file-123/view");

      // Verify attached chip has active "↗ Open in Google Drive" link
      expect(screen.getByTitle("Open in Google Drive")).toBeInTheDocument();
    });
  });

  it("fetches source via direct Google Drive share link", async () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to Google Drive tab
    const gDriveTab = screen.getAllByRole("button", { name: /Google Drive/i })[0];
    fireEvent.click(gDriveTab);

    // Enter direct link
    const directLinkInput = screen.getByPlaceholderText(/paste Google Drive share link directly/i);
    fireEvent.change(directLinkInput, {
      target: { value: "https://drive.google.com/file/d/1B2C3D4E5F6G7H8I9J/view?usp=sharing" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Link" }));

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Google Drive Document");
      const urlInput = screen.getByLabelText(/Link \/ Web URL/i) as HTMLInputElement;
      expect(urlInput.value).toBe("https://drive.google.com/file/d/1B2C3D4E5F6G7H8I9J/view?usp=sharing");
    });
  });

  it("auto-populates key points and writing notes when resolving DOI metadata", async () => {
    mockResolveDoiMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Large Language Models in Academic Research",
        authors: ["Brown, Tom"],
        year: "2025",
        journal: "Nature AI",
        doi: "10.1038/s41586-025-001",
        url: "https://doi.org/10.1038/s41586-025-001",
        type: "paper",
      },
      keyPoints: [
        "LLMs accelerate systematic literature review workflows significantly.",
        "Demonstrates 40% reduction in source synthesis time.",
      ],
      suggestedTags: ["llm", "synthesis", "review"],
      whySaved: "Core foundation for theoretical section.",
      keyQuote: "Autonomous workflows provide rigorous evidence extraction.",
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        existingProjects={["Thesis", "LitReview"]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, { target: { value: "10.1038/s41586-025-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      expect(screen.getByText(/✓ DOI verified & key points auto-extracted/i)).toBeInTheDocument();
      expect(screen.getByText(/✨ 2 Key Points/i)).toBeInTheDocument();
    });

    // Expand writing notes accordion
    const accordionBtn = screen.getByRole("button", { name: /\+ Add tags or notes/i });
    fireEvent.click(accordionBtn);

    // Verify key points and notes are rendered
    expect(
      screen.getByText("LLMs accelerate systematic literature review workflows significantly.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Demonstrates 40% reduction in source synthesis time.")
    ).toBeInTheDocument();

    const whySavedInput = screen.getByLabelText(/Why are you saving this source\?/i) as HTMLInputElement;
    expect(whySavedInput.value).toBe("Core foundation for theoretical section.");

    const keyQuoteInput = screen.getByLabelText(/Key Quote/i) as HTMLTextAreaElement;
    expect(keyQuoteInput.value).toBe("Autonomous workflows provide rigorous evidence extraction.");
  });

  it("allows adding and removing key points, and selecting projects before saving", async () => {
    mockAddVaultItem.mockResolvedValueOnce({
      id: "vault-item-999",
      title: "Agentic Systems Review",
      createdAt: "2026-01-01",
    });

    const onClose = vi.fn();
    const onSourceSaved = vi.fn();

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        existingProjects={["Master Thesis", "AI Safety"]}
        onClose={onClose}
        onSourceSaved={onSourceSaved}
      />
    );

    // Fill title
    fireEvent.change(screen.getByLabelText(/^Title/i), {
      target: { value: "Agentic Systems Review" },
    });

    // Open notes accordion
    fireEvent.click(screen.getByRole("button", { name: /\+ Add tags or notes/i }));

    // Click Auto-extract button
    const autoExtractBtn = screen.getByRole("button", { name: /Auto-extract/i });
    fireEvent.click(autoExtractBtn);

    // Add a custom key point
    const keyPointInput = screen.getByPlaceholderText(/Add key takeaway or argument and press enter/i);
    fireEvent.change(keyPointInput, { target: { value: "Autonomous multi-agent orchestration pattern" } });
    fireEvent.click(screen.getByRole("button", { name: "Add key point" }));

    expect(screen.getByText("Autonomous multi-agent orchestration pattern")).toBeInTheDocument();

    // Select existing project "Master Thesis"
    fireEvent.click(screen.getByRole("button", { name: /Assign to Master Thesis/i }));

    // Assign a new custom project
    const projectInput = screen.getByPlaceholderText(/Assign project/i);
    fireEvent.change(projectInput, { target: { value: "Chapter 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(screen.getByText("📁 Chapter 3")).toBeInTheDocument();

    // Save Source
    fireEvent.click(screen.getByRole("button", { name: "Save Source" }));

    await waitFor(() => {
      expect(mockAddVaultItem).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Agentic Systems Review",
          collection: "Master Thesis",
          metadata: expect.objectContaining({
            projects: expect.arrayContaining(["Master Thesis", "Chapter 3"]),
            keyPoints: expect.arrayContaining(["Autonomous multi-agent orchestration pattern"]),
          }),
        })
      );
      expect(onSourceSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("loads user ongoing projects into dropdown selector and assigns to project for in-text citation and references", async () => {
    mockListProjects.mockResolvedValueOnce({
      items: [
        { projectId: "p1", answers: { working_title: "Master's Thesis in AI" } },
        { projectId: "p2", answers: { working_title: "Global Security Capstone" } },
      ],
    });
    mockAddVaultItem.mockResolvedValueOnce({
      id: "vault-item-assigned-1",
      title: "Self-Reflective LLMs",
      createdAt: "2026-01-01",
    });

    const onClose = vi.fn();
    const onSourceSaved = vi.fn();

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={onClose}
        onSourceSaved={onSourceSaved}
      />
    );

    // Expand writing notes and project assignments accordion
    const toggleBtn = screen.getByRole("button", { name: /Add tags or notes/i });
    fireEvent.click(toggleBtn);

    // Check what is rendered
    expect(screen.getByText(/Thematic Tags/i)).toBeInTheDocument();

    await waitFor(() => {
      const select = screen.getByRole("combobox", { name: /Select an ongoing project/i }) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Master's Thesis in AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Global Security Capstone/i })).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox", { name: /Select an ongoing project/i });

    // Select "Master's Thesis in AI" from dropdown
    fireEvent.change(select, { target: { value: "Master's Thesis in AI" } });

    // Verify assigned summary box shows active citation and references readiness
    expect(screen.getByText(/✓ Integrated for citations & references/i)).toBeInTheDocument();
    expect(screen.getByText(/📁 Master's Thesis in AI/i)).toBeInTheDocument();

    // Fill title and save
    fireEvent.change(screen.getByLabelText(/^Title/i), {
      target: { value: "Self-Reflective LLMs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Source" }));

    await waitFor(() => {
      expect(mockAddVaultItem).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Self-Reflective LLMs",
          collection: "Master's Thesis in AI",
          metadata: expect.objectContaining({
            projects: ["Master's Thesis in AI"],
          }),
        })
      );
      expect(onSourceSaved).toHaveBeenCalled();
    });
  });

  it("handles Microsoft OneDrive provider unconfigured error gracefully with clear alternative options", async () => {
    mockInitiateOneDriveAuth.mockResolvedValueOnce({
      success: false,
      error:
        "Microsoft / Azure OneDrive provider is not enabled in Supabase Authentication. You can connect directly by pasting your OneDrive share link or connecting your Microsoft email above without setting up Azure OAuth.",
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Switch to OneDrive tab
    const oneDriveTab = screen.getAllByRole("button", { name: /OneDrive/i })[0];
    fireEvent.click(oneDriveTab);

    // Click Connect Microsoft OneDrive (Option 3)
    const connectOAuthBtn = screen.getByRole("button", { name: /Sign In with Microsoft OAuth/i });
    fireEvent.click(connectOAuthBtn);

    // Verify friendly error without crashing
    await waitFor(() => {
      expect(
        screen.getByText(/Microsoft Azure OAuth is not enabled in your authentication settings/i)
      ).toBeInTheDocument();
      // Verify Option 1 (Paste OneDrive link) is available as zero-setup alternative
      expect(screen.getByPlaceholderText(/Paste OneDrive or SharePoint link/i)).toBeInTheDocument();
    });
  });

  it("renders clear explanatory guidance for Thematic Tags vs Projects", async () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    // Open notes accordion
    const toggleBtn = screen.getByRole("button", { name: /Add tags or notes/i });
    fireEvent.click(toggleBtn);

    // Verify Thematic Tags explanation is visible and distinct from Projects
    expect(screen.getByText(/Thematic Tags/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Cross-project keywords, methodologies, or research paradigms/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tags help you categorize and retrieve sources across all research projects/i)
    ).toBeInTheDocument();

    // Verify Assign to Project(s) section is distinct
    expect(screen.getByText(/Assign to Ongoing Project\(s\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Select from your active research projects or assignments/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sources assigned to a project become directly available in that workspace/i)
    ).toBeInTheDocument();
  });
});


