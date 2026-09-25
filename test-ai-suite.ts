import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { registerAIRoutes } from "./server/routes/ai.ts";
import { getCandidates, executeMultimodalAgentic } from "./server/utils/llm.ts";

async function runAudit() {
  console.log("=================================================");
  console.log("SCHOLAR CORE AI SUITE END-TO-END VERIFICATION");
  console.log("=================================================\n");

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  registerAIRoutes(app);

  const server = app.listen(3099);
  const baseUrl = "http://localhost:3099/api/ai";

  const results: Record<string, any> = {};

  try {
    // 0. Status Verification
    console.log("--- 0. AI Operational Status Check ---");
    const statusRes = await fetch(`${baseUrl}/status`);
    const statusData = await statusRes.json();
    console.log("Status response:", JSON.stringify(statusData, null, 2));
    results["status"] = statusData;

    // Test A: Text Prompt
    console.log("\n--- Test A: Text Prompt ---");
    const testARes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "What is the capital of Nepal? Answer in one concise sentence.",
      }),
    });
    const testAData = await testARes.json();
    console.log("Test A Output:", testAData.text);
    console.log("Test A Provider/Model:", testAData.provider, testAData.model);
    results["Test A"] = {
      ok: testAData.ok,
      text: testAData.text,
      provider: testAData.provider,
      model: testAData.model,
      passed: typeof testAData.text === "string" && testAData.text.includes("Kathmandu"),
    };

    // Test B: Document / File Upload
    console.log("\n--- Test B: Document File Processing ---");
    const sampleDocText = `
Title: Constitutional Framework of Nepal 2082
Chapter 1: Sovereign Powers
Article 1: The sovereign powers of Nepal are inherent in the Nepali people and exercised in accordance with constitutional provisions.
Article 2: Fundamental objectives include ensuring proportional representation, inclusive governance, and academic research autonomy.
Chapter 2: Academic & Scientific Research Mandates
Article 15: All research institutions shall maintain verifiable, peer-reviewed provenance and cryptographic data ledgers.
`;
    const testBRes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Summarize this document and list Article 15 requirements.",
        files: [
          {
            name: "NC_bidhan_2082.pdf",
            text: sampleDocText,
            type: "application/pdf",
          },
        ],
      }),
    });
    const testBData = await testBRes.json();
    console.log("Test B Output:", testBData.text);
    results["Test B"] = {
      ok: testBData.ok,
      text: testBData.text,
      passed: typeof testBData.text === "string" && testBData.text.toLowerCase().includes("article 15"),
    };

    // Test C: Image / Vision Analysis
    console.log("\n--- Test C: Image / Vision Capability ---");
    // Minimal 1x1 transparent PNG or base64 red square
    const redSquarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const testCRes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Describe and analyze this image. What visual elements or color does it contain?",
        images: [
          {
            name: "test_image.png",
            data: redSquarePngBase64,
            mimeType: "image/png",
          },
        ],
      }),
    });
    const testCData = await testCRes.json();
    console.log("Test C Output:", testCData.text);
    results["Test C"] = {
      ok: testCData.ok,
      text: testCData.text,
      provider: testCData.provider,
      model: testCData.model,
      passed: testCData.ok && typeof testCData.text === "string" && testCData.text.length > 10,
    };

    // Test D: Web Search
    console.log("\n--- Test D: Live Web Search ---");
    const testDRes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "What are the latest developments in quantum computing and superconducting qubits?",
        mode: "search",
      }),
    });
    const testDData = await testDRes.json();
    console.log("Test D Mode:", testDData.mode);
    console.log("Test D Output preview:", testDData.text?.slice(0, 300));
    console.log("Test D Citations Count:", testDData.citations?.length);
    results["Test D"] = {
      ok: testDData.ok,
      mode: testDData.mode,
      citationsCount: testDData.citations?.length || 0,
      citations: testDData.citations?.slice(0, 3),
      passed: testDData.ok && (testDData.citations?.length || 0) > 0,
    };

    // Test E: Deep Research
    console.log("\n--- Test E: Deep Research Pipeline ---");
    const testERes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Conduct detailed research on topological quantum memory and surface codes, citing multiple scholarly sources.",
        mode: "deep-research",
      }),
    });
    const testEData = await testERes.json();
    console.log("Test E Plan:", testEData.plan);
    console.log("Test E Output preview:", testEData.text?.slice(0, 300));
    console.log("Test E Citations Count:", testEData.citations?.length);
    results["Test E"] = {
      ok: testEData.ok,
      mode: testEData.mode,
      planSteps: testEData.plan?.subQuestions?.length || (Array.isArray(testEData.plan) ? testEData.plan.length : 0),
      citationsCount: testEData.citations?.length || 0,
      passed:
        testEData.ok &&
        (testEData.plan?.subQuestions?.length || (Array.isArray(testEData.plan) ? testEData.plan.length : 0)) > 0 &&
        (testEData.citations?.length || 0) > 0,
    };

    // Test F: Multimodal Research (File + Web Search)
    console.log("\n--- Test F: Multimodal Research (File + Web Search) ---");
    const testFRes = await fetch(`${baseUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Analyze this document and verify its major claims using current web sources.",
        files: [
          {
            name: "quantum_claims.txt",
            text: "Claim: IBM Quantum Eagle and Condor processors have demonstrated quantum utility in complex spin dynamics.",
            type: "text/plain",
          },
        ],
        mode: "search",
      }),
    });
    const testFData = await testFRes.json();
    console.log("Test F Output preview:", testFData.text?.slice(0, 300));
    console.log("Test F Citations Count:", testFData.citations?.length);
    results["Test F"] = {
      ok: testFData.ok,
      mode: testFData.mode,
      citationsCount: testFData.citations?.length || 0,
      passed: testFData.ok && typeof testFData.text === "string" && testFData.text.length > 50,
    };

    // Test G: Failure / Fallback Routing
    console.log("\n--- Test G: Provider Fallback Routing ---");
    const candidatesWithFailingPrimary = [
      {
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        apiKey: "sk-invalid-non-working-key-for-test",
      },
      ...getCandidates().filter((c) => c.provider === "gemini"),
    ];
    console.log("Executing with candidate 1 (failing OpenRouter) -> candidate 2 (Gemini)...");
    const testGOutput = await executeMultimodalAgentic({
      systemPrompt: "You are a test assistant.",
      userPrompt: "Respond with the word 'FALLBACK_SUCCESS' if you receive this.",
      candidates: candidatesWithFailingPrimary,
    });
    console.log("Test G Result:", testGOutput.text);
    console.log("Test G Resolved Provider:", testGOutput.provider, testGOutput.model);
    results["Test G"] = {
      resolvedProvider: testGOutput.provider,
      resolvedModel: testGOutput.model,
      text: testGOutput.text,
      passed: testGOutput.provider === "gemini" && testGOutput.text.includes("FALLBACK_SUCCESS"),
    };

    console.log("\n=================================================");
    console.log("SUMMARY OF TESTS A THROUGH G:");
    console.log(JSON.stringify(results, null, 2));
    console.log("=================================================");
  } finally {
    server.close();
  }
}

runAudit().catch((err) => {
  console.error("FATAL ERROR IN SUITE:", err);
  process.exit(1);
});
