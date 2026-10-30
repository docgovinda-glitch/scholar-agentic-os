#!/usr/bin/env node
/**
 * Stand-in AI service for E2E tests (CI only).
 *
 * Speaks the OpenAI-compatible chat API that local runners such as LM Studio
 * expose, on LM Studio's default address (http://localhost:1234/v1), so the
 * app's real server-side AI path runs end to end without a paid provider.
 * Answers are fixed and contain no sources, figures or findings.
 *
 *   node e2e/stub-ai/server.mjs            # listens on :1234
 *   GET  /v1/models                        # one model: e2e-stub
 *   POST /v1/chat/completions              # fixed answer (JSON when asked)
 *   GET  /__calls                          # how many completions were served
 */
import http from "node:http";

export const STUB_MARKER = "E2E-STUB-DRAFT";
const PORT = Number(process.env.STUB_AI_PORT || 1234);
const PROSE = `${STUB_MARKER} This paragraph was written by the test stand-in AI service. It contains no sources, figures or findings.`;

let calls = 0;

function answerFor(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n");
  // Manuscript drafting asks for {"data": [{ section, status, length, content }]}.
  if (/"data"\s*:\s*\[/.test(system) && /"section"/.test(system)) {
    return JSON.stringify({ data: [{ section: "Introduction", status: "Drafted", length: 20, content: PROSE }] });
  }
  if (body?.response_format?.type === "json_object") return JSON.stringify({ text: PROSE });
  return PROSE;
}

const server = http.createServer((req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  if (req.method === "GET" && req.url === "/v1/models") return send(200, { object: "list", data: [{ id: "e2e-stub", object: "model" }] });
  if (req.method === "GET" && req.url === "/__calls") return send(200, { calls });
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, { error: { message: "invalid JSON" } }); }
      if (body.stream) return send(400, { error: { message: "streaming is not supported by the stub" } });
      calls += 1;
      send(200, {
        id: `stub-${calls}`,
        object: "chat.completion",
        model: body.model || "e2e-stub",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: answerFor(body) } }],
      });
    });
    return;
  }
  send(404, { error: { message: "not found" } });
});

// No host: listen on both IPv4 and IPv6, since "localhost" may resolve to either.
server.listen(PORT, () => console.log(`stub AI listening on http://localhost:${PORT}/v1`));
