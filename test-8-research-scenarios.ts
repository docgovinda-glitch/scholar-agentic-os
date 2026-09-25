import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { registerAIRoutes } from "./server/routes/ai.ts";

async function run8ScenariosTest() {
  console.log("===================================================================");
  console.log("8-SCENARIO PERPLEXITY-LEVEL RESEARCH BENCHMARK VERIFICATION SUITE");
  console.log("===================================================================\n");

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  registerAIRoutes(app);

  const server = app.listen(3100);
  const baseUrl = "http://localhost:3100/api/ai";

  const testResults: Record<string, any> = {};

  try {
    // 1. A simple factual question
    console.log("\n▶ [Scenario 1/8] Simple Factual Question");
    const q1 = "What is the speed of light in a vacuum in meters per second?";
    const res1 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q1 }),
    });
    const data1 = await res1.json();
    console.log("Answer:", data1.text?.slice(0, 150));
    testResults["Scenario 1"] = {
      question: q1,
      ok: data1.ok,
      mode: data1.mode,
      hasSpeedOfLight: data1.text?.includes("299,792,458") || data1.text?.includes("299792458") || data1.text?.includes("3 × 10"),
    };

    // 2. A current-events question
    console.log("\n▶ [Scenario 2/8] Current-Events Question");
    const q2 = "What are the latest 2026 developments in generative AI agent architectures and frontier models?";
    const res2 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q2, mode: "search" }),
    });
    const data2 = await res2.json();
    console.log("Answer preview:", data2.text?.slice(0, 150));
    console.log("Citations count:", data2.citations?.length || 0);
    testResults["Scenario 2"] = {
      question: q2,
      ok: data2.ok,
      mode: data2.mode,
      citationsCount: data2.citations?.length || 0,
      hasCitations: (data2.citations?.length || 0) > 0,
    };

    // 3. A complex research question
    console.log("\n▶ [Scenario 3/8] Complex Research Question");
    const q3 = "Compare the biochemical mechanisms and off-target editing rates of CRISPR-Cas9 prime editing versus base editing.";
    const res3 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q3, mode: "deep-research" }),
    });
    const data3 = await res3.json();
    console.log("Plan steps:", data3.plan?.subQuestions?.length);
    console.log("Answer preview:", data3.text?.slice(0, 150));
    console.log("Citations count:", data3.citations?.length || 0);
    testResults["Scenario 3"] = {
      question: q3,
      ok: data3.ok,
      mode: data3.mode,
      subQuestions: data3.plan?.subQuestions?.length || 0,
      citationsCount: data3.citations?.length || 0,
      hasStructure: data3.text?.includes("Findings") || data3.text?.includes("Analysis") || data3.text?.includes("References"),
    };

    // 4. A question requiring multiple sources
    console.log("\n▶ [Scenario 4/8] Question Requiring Multiple Sources");
    const q4 = "What is the global consensus and varying projections on global quantum computing market size between 2025 and 2032?";
    const res4 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q4, mode: "search" }),
    });
    const data4 = await res4.json();
    console.log("Citations count:", data4.citations?.length || 0);
    testResults["Scenario 4"] = {
      question: q4,
      ok: data4.ok,
      citationsCount: data4.citations?.length || 0,
      multipleSources: (data4.citations?.length || 0) >= 2,
    };

    // 5. A question with conflicting sources
    console.log("\n▶ [Scenario 5/8] Question with Conflicting Sources");
    const q5 = "What are the conflicting scientific perspectives regarding whether room-temperature ambient-pressure superconductivity has been achieved, specifically analyzing LK-99 and subsequent replication attempts?";
    const res5 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q5, mode: "deep-research" }),
    });
    const data5 = await res5.json();
    console.log("Answer preview:", data5.text?.slice(0, 150));
    testResults["Scenario 5"] = {
      question: q5,
      ok: data5.ok,
      hasConflictSection: data5.text?.toLowerCase().includes("conflict") || data5.text?.toLowerCase().includes("discrepanc") || data5.text?.toLowerCase().includes("replication"),
      citationsCount: data5.citations?.length || 0,
    };

    // 6. A question requiring primary sources
    console.log("\n▶ [Scenario 6/8] Question Requiring Primary Sources");
    const q6 = "What is the official definition of health in the Preamble to the World Health Organization (WHO) Constitution?";
    const res6 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q6, mode: "search" }),
    });
    const data6 = await res6.json();
    console.log("Answer preview:", data6.text?.slice(0, 150));
    const tierATierB = data6.citations?.some((c: any) => c.tier === "A" || c.authorityBadge?.includes("Government") || c.authorityBadge?.includes("Academic") || c.domain?.includes("who.int") || c.domain?.includes("wikipedia.org"));
    testResults["Scenario 6"] = {
      question: q6,
      ok: data6.ok,
      hasPrimaryAuthority: tierATierB,
      citationsCount: data6.citations?.length || 0,
    };

    // 7. A user-uploaded document combined with web research
    console.log("\n▶ [Scenario 7/8] User-Uploaded Document Combined with Web Research");
    const docContent = `
Internal Research Memorandum:
Hypothesis: Room temperature quantum coherence has been achieved in diamond nitrogen-vacancy (NV) center defects.
Preliminary finding: Coherence time T2 exceeds 1 millisecond at 300 Kelvin using dynamical decoupling sequences.
Question for research team: Cross-reference this with recent peer-reviewed literature on NV diamond spin coherence.
    `;
    const q7 = "Review our internal research memo and cross-reference our 1ms room-temperature T2 coherence finding with peer-reviewed literature.";
    const res7 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: q7,
        files: [{ name: "internal_nv_memo.pdf", text: docContent, type: "application/pdf" }],
        mode: "search",
      }),
    });
    const data7 = await res7.json();
    console.log("Answer preview:", data7.text?.slice(0, 150));
    testResults["Scenario 7"] = {
      question: q7,
      ok: data7.ok,
      mentionsDocAndLiterature: data7.text?.toLowerCase().includes("coherence") && (data7.citations?.length || 0) > 0,
      citationsCount: data7.citations?.length || 0,
    };

    // 8. A question where reliable information cannot be found / uncertainty
    console.log("\n▶ [Scenario 8/8] Question Where Reliable Information Cannot Be Found / Uncertainty");
    const q8 = "What is the secret chemical formula and ingredient proportions of the classified military coating XZ-9994-Alpha patented in Atlantis in 2026?";
    const res8 = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q8, mode: "search" }),
    });
    const data8 = await res8.json();
    console.log("Answer preview:", data8.text?.slice(0, 150));
    testResults["Scenario 8"] = {
      question: q8,
      ok: data8.ok,
      expressesUncertainty: data8.text?.toLowerCase().includes("no reliable") || data8.text?.toLowerCase().includes("cannot be found") || data8.text?.toLowerCase().includes("unverifiable") || data8.text?.toLowerCase().includes("not exist") || data8.text?.toLowerCase().includes("fictitious") || data8.text?.toLowerCase().includes("no credible") || data8.text?.toLowerCase().includes("no verified") || data8.text?.toLowerCase().includes("not available"),
    };

    console.log("\n===================================================================");
    console.log("8-SCENARIO VERIFICATION RESULTS:");
    console.log(JSON.stringify(testResults, null, 2));
    console.log("===================================================================");
  } finally {
    server.close();
  }
}

run8ScenariosTest().catch((err) => {
  console.error("Error running 8 scenarios test:", err);
  process.exit(1);
});
