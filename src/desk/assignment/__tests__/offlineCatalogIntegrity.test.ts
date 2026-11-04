import { describe, it, expect } from "vitest";
import {
  CORE_SCHOLARLY_CATALOG,
  EXPANSION_IR_POOL,
  EXPANSION_SCHOLARLY_POOL,
  IR_CHINA_GEOPOLITICS_CATALOG,
  ORGANIZATIONAL_CULTURE_CATALOG,
} from "../services/scholarlyDiscoveryService";
import { QUANTUM_COMPUTING_CATALOG } from "../services/catalogs/quantumComputingCatalog";
import { UN_PEACE_SECURITY_CATALOG } from "../services/catalogs/unPeaceSecurityCatalog";

// Offline results come only from these catalogs, so every entry must be a
// published work. Each was matched to a Crossref, DataCite or OpenLibrary
// record (November 2026); entries with no record were removed.
const ALL = [
  ...CORE_SCHOLARLY_CATALOG,
  ...EXPANSION_SCHOLARLY_POOL,
  ...IR_CHINA_GEOPOLITICS_CATALOG,
  ...EXPANSION_IR_POOL,
  ...ORGANIZATIONAL_CULTURE_CATALOG,
  ...QUANTUM_COMPUTING_CATALOG,
  ...UN_PEACE_SECURITY_CATALOG,
];

// Titles removed because no registered record exists for them (often a real
// researcher's name on an invented title). They must not come back.
const REMOVED_UNREGISTERED_TITLES = [
  "Algorithmic Governance and the Politics of Predictive Accountability",
  "Critical Synthesis of Empirical Evidence in Socio-Technical Decision Making",
  "Regulatory Friction and Institutional Sovereignty: A Comparative Analysis",
  "Epistemic Injustice and Disproportionate Impact in Automated Public Systems",
  "Procedural Due Process in Administrative Decision Automation",
  "Ethical Deliberation under Competing Stakeholder Objectives: A Framework",
  "Transparency Fallacies: Why Explainability Does Not Equal Accountability",
  "Institutional Isomorphism in Algorithmic Public Administration",
  "Governing Automated Systems: A Comparative Report on National Regulatory Strategies",
  "Auditing Public Algorithms: Methodological Standards and Verification Gaps",
  "The Human Element: Socratic Oversight in Machine-Mediated Education",
  "Algorithmic Impact Assessments: A Practical Framework for Public Agency Accountability",
  "Who Controls the Data? Sovereign Data Trusts and Democratic Collective Bargaining",
  "Empirical Assessment of Public Algorithmic Registers across European Municipalities",
  "Sovereign AI and the Geopolitics of Frontier Computing Compute Infrastructure",
  "Systematic Review of Medical Algorithmic Bias in Diagnostic Imaging",
  "The Epistemology of Deep Learning: Interpretability, Robustness, and Generalization",
  "Meta-Analysis of Quantitative Fairness Metrics: Incompatibility and Practical Trade-offs",
  "Public Sector Automation and Democratic Legitimacy: A Mixed-Methods Study",
  "Accountability by Design in Autonomous Cyber-Physical Infrastructures",
  "International Human Rights Law as an Assessment Matrix for Automated Risk Scoring",
  "Frontier Foundations: Safety Audits, Watermarking, and Generative Provenance Standards",
  "Constitutional Dimensions of Algorithmic Power: Private Platforms as Quasi-Public Actors",
  "The Structural Foundations of Global AI Governance: Treaty Architectures and Verification",
  "Automated Administrative Adjudication: Empirical Evidence from the Social Security Administration",
  "Algorithmic Accountability in Criminal Justice: Recidivism Prediction and Due Process",
  "Environmental Costs of Frontier Computing: Water, Energy, and Mineral Supply Chains",
  "Democratic Deliberation over High-Stakes Public Sector Algorithms: Citizen Assembly Trials",
  "Certifying High-Stakes Deep Learning: Formal Verification Methods and Safety Guarantees",
  "The Tragedy of US-China Relations: Geopolitical Rivalry in the Western Pacific",
  "China's Maritime Power and the Law of the Sea: Navigating the South China Sea",
  "Hedging in the Shadow of Giants: Southeast Asia's Strategic Autonomy",
  "The Institutional Architecture of the Asian Infrastructure Investment Bank",
  "China's Digital Silk Road and Global Technology Standards",
  "Weaponized Interdependence and China's Rare Earth Supply Chains",
  "The Global South and the Realignment of International Order",
  "Great Power Deterrence in the Taiwan Strait: Ambiguity, Credibility, and Risk",
  "China's Energy Security and Eurasian Pipelines: The Geopolitics of Petro-Yuan",
  "Strategic Culture and Crisis Stability in Sino-American Nuclear Dynamics",
  "The Inevitable Rivalry: America, China, and the Tragedy of Great-Power Politics",
  "The Rise of China and the Future of the West: Can the Liberal System Survive?",
  "A World Safe for Autocracy? China's Rise and the Future of Global Politics",
  "Power Transition Theory and Strategic Hedging in East Asia",
  "Quantitative Modeling of Maritime Grey-Zone Coercion in the South China Sea",
  "Debunking the Myth of 'Debt-Trap Diplomacy': How Recipient Countries Shape China's Belt and Road Initiative",
  "China's Eurasian Century? Political and Strategic Implications of the Belt and Road Initiative",
  "Partner to Competitor: Economic Statecraft and the Shift in US-China Relations",
  "The Making of China's Foreign Policy: From Deng Xiaoping to Xi Jinping",
  "Sovereignty with Chinese Characteristics: The Context of Chinese Engagement in Global Governance",
  "China's Coming Upheaval: Competition, the Pandemic, and the Weakness of Xi Jinping",
  "The Security Council in an Age of Great Power Competition",
  "Peacebuilding and Local Ownership: Post-Conflict Consensus or Paternalism?",
  "The United Nations and the Rule of Law in International Security",
  "The United Nations and the Rule of Law in an Age of Hegemonic Ambiguity",
  "Post-quantum cryptography: dealing with packet fragmentation and latency in TLS 1.3",
  "Culture as Social Control: Corporations, Cults, and Commitment",
];

describe("offline literature catalogs", () => {
  it("has unique ids and unique, well-formed DOIs", () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    const dois = ALL.map((e) => e.doi).filter((d): d is string => Boolean(d));
    expect(new Set(dois.map((d) => d.toLowerCase())).size).toBe(dois.length);
    dois.forEach((d) => expect(d).toMatch(/^10\.\d{4,9}\/\S+$/));
  });

  it("gives every entry a venue or publisher, authors and a four-digit year", () => {
    ALL.forEach((e) => {
      expect(e.journal || e.publisher, e.id).toBeTruthy();
      expect(e.authors.length, e.id).toBeGreaterThan(0);
      expect(e.year, e.id).toMatch(/^\d{4}$/);
    });
  });

  it("does not offer any of the unregistered works removed in the audit", () => {
    const titles = new Set(ALL.map((e) => e.title.toLowerCase()));
    REMOVED_UNREGISTERED_TITLES.forEach((t) => expect(titles.has(t.toLowerCase()), t).toBe(false));
  });
});
