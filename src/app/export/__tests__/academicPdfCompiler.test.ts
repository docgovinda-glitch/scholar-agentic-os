import { describe, it, expect } from "vitest";
import {
  escapeLatex,
  escapeTypst,
  generateBibtex,
  generateLatexSource,
  generateTypstSource,
  auditCameraReadyCompliance,
  compileAcademicPdf,
} from "../academicPdfCompiler";
import { exportDocument } from "../export";
import type { CanonicalDocument } from "../../../desk/types";

const sampleDoc: CanonicalDocument = {
  id: "doc-academic-1",
  title: "Quantum Computing & Neural Cryptography",
  blocks: [
    { id: "b0", kind: "paragraph", text: "Abstract: This paper presents an empirical analysis of post-quantum cryptographic lattices." },
    { id: "b1", kind: "heading1", text: "1. Introduction" },
    { id: "b2", kind: "paragraph", text: "Post-quantum security guarantees rely on high-dimensional mathematical hardness assumptions." },
    { id: "b3", kind: "heading2", text: "1.1 Theoretical Framework" },
    { id: "b4", kind: "quote", text: "Lattice-based cryptography provides worst-case to average-case hardness reductions." },
    { id: "b5", kind: "list-item", text: "Shortest Vector Problem (SVP)" },
    { id: "b6", kind: "list-item", text: "Learning With Errors (LWE)" },
  ],
};

const sampleMetadata = {
  title: "Quantum Computing & Neural Cryptography",
  author: "Dr. Elena Rostova",
  discipline: "Computer Science",
  created: new Date(),
  modified: new Date(),
};

const sampleReferences = [
  {
    id: "regev2009",
    title: "On lattices, learning with errors, random linear codes, and cryptography",
    authors: ["Oded Regev"],
    year: "2009",
    journal: "Journal of the ACM",
    doi: "10.1145/1568318.1568324",
  },
];

describe("Camera-Ready Academic Compiler", () => {
  it("escapes LaTeX and Typst special characters correctly", () => {
    const raw = "50% of algorithms & models with cost < $100 #hashtag _var_ {nested}";
    const latexEscaped = escapeLatex(raw);
    expect(latexEscaped).toContain("\\%");
    expect(latexEscaped).toContain("\\&");
    expect(latexEscaped).toContain("\\$");
    expect(latexEscaped).toContain("\\#");
    expect(latexEscaped).toContain("\\_");

    const typstEscaped = escapeTypst("Equation $x = y$ with #hash and @mention");
    expect(typstEscaped).toContain("\\$");
    expect(typstEscaped).toContain("\\#");
    expect(typstEscaped).toContain("\\@");
  });

  it("generates BibTeX references correctly", () => {
    const bib = generateBibtex(sampleReferences);
    expect(bib).toContain("@article{regev2009");
    expect(bib).toContain("author = {Oded Regev}");
    expect(bib).toContain("doi = {10.1145/1568318.1568324}");
  });

  it("generates compilable LaTeX source for IEEE, ACM, and Nature templates", () => {
    // IEEE
    const ieeeLatex = generateLatexSource(sampleDoc, sampleMetadata, {
      template: "ieee",
      authorAffiliation: "MIT CSAIL",
      authorEmail: "elena@csail.mit.edu",
      keywords: ["Lattices", "Post-Quantum", "Cryptography"],
      references: sampleReferences,
    });
    expect(ieeeLatex).toContain("\\documentclass[conference]{IEEEtran}");
    expect(ieeeLatex).toContain("\\section{1. Introduction}");
    expect(ieeeLatex).toContain("\\subsection{1.1 Theoretical Framework}");
    expect(ieeeLatex).toContain("\\begin{IEEEkeywords}");
    expect(ieeeLatex).toContain("\\bibliography{references}");

    // ACM
    const acmLatex = generateLatexSource(sampleDoc, sampleMetadata, {
      template: "acm",
      keywords: ["Quantum", "Security"],
    });
    expect(acmLatex).toContain("\\documentclass[sigconf]{acmart}");

    // Nature
    const natureLatex = generateLatexSource(sampleDoc, sampleMetadata, {
      template: "nature",
    });
    expect(natureLatex).toContain("\\documentclass[sn-mathphys,Numbered]{sn-jnl}");
  });

  it("generates valid Typst source markup", () => {
    const typstCode = generateTypstSource(sampleDoc, sampleMetadata, {
      template: "typst_modern",
      columns: 2,
      keywords: ["Lattices", "Security"],
    });
    expect(typstCode).toContain("#set page(");
    expect(typstCode).toContain("columns: 2");
    expect(typstCode).toContain("= 1. Introduction");
    expect(typstCode).toContain("== 1.1 Theoretical Framework");
    expect(typstCode).toContain('#bibliography("references.bib", style: "ieee")');
  });

  it("audits camera-ready academic compliance", () => {
    const audit = auditCameraReadyCompliance(sampleDoc, {
      template: "ieee",
      references: sampleReferences,
      abstractText: "This paper presents an empirical analysis of post-quantum cryptographic lattices.",
    });

    expect(audit.checks.length).toBeGreaterThanOrEqual(4);
    expect(audit.score).toBeGreaterThanOrEqual(80);
    expect(audit.isCompliant).toBe(true);
  });

  it("compiles Camera-Ready PDF Buffer", async () => {
    const pdfBuf = await compileAcademicPdf(sampleDoc, sampleMetadata, {
      template: "ieee",
      authorAffiliation: "Stanford AI Lab",
      abstractText: "This paper analyzes post-quantum cryptographic structures.",
      keywords: ["Cryptography", "Neural Networks"],
      references: sampleReferences,
    });

    expect(pdfBuf).toBeInstanceOf(Buffer);
    expect(pdfBuf.length).toBeGreaterThan(0);
    // PDF Magic bytes %PDF
    expect(pdfBuf[0]).toBe(0x25);
    expect(pdfBuf[1]).toBe(0x50);
    expect(pdfBuf[2]).toBe(0x44);
    expect(pdfBuf[3]).toBe(0x46);
  });

  it("exports latex, typst, and camera_ready_pdf via the 5-stage export pipeline", async () => {
    const docWithContent: CanonicalDocument = {
      id: "doc-full",
      title: "Neural Architectures for Scientific Discovery",
      blocks: [
        { id: "b1", kind: "heading1", text: "Introduction" },
        { id: "b2", kind: "paragraph", text: "Modern deep learning models accelerate computational discoveries across disciplines. ".repeat(8) },
      ],
    };

    // Export LaTeX
    const latexRes = await exportDocument({
      document: docWithContent,
      format: "latex",
      title: docWithContent.title,
      author: "Researcher One",
      academicOptions: { template: "ieee", references: sampleReferences },
    });
    expect(latexRes.filename).toBe("Neural_Architectures_for_Scientific_Discovery.tex");
    expect(latexRes.data.toString("utf-8")).toContain("\\documentclass");

    // Export Typst
    const typstRes = await exportDocument({
      document: docWithContent,
      format: "typst",
      title: docWithContent.title,
      author: "Researcher One",
      academicOptions: { template: "typst_modern" },
    });
    expect(typstRes.filename).toBe("Neural_Architectures_for_Scientific_Discovery.typ");
    expect(typstRes.data.toString("utf-8")).toContain("#set page");

    // Export Camera-Ready PDF
    const crPdfRes = await exportDocument({
      document: docWithContent,
      format: "camera_ready_pdf",
      title: docWithContent.title,
      author: "Researcher One",
      academicOptions: { template: "ieee", references: sampleReferences },
    });
    expect(crPdfRes.filename).toBe("Neural_Architectures_for_Scientific_Discovery.pdf");
    expect(crPdfRes.byteSize).toBeGreaterThan(0);
  });
});
