import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Journal studio autosaves the manuscript while the AI routes run. A route
 * that saves the whole project it loaded at the start would overwrite that
 * text with a stale copy, so the /agentic routes write only the answer keys
 * they change (`patchProjectAnswers`).
 */
describe("/agentic routes never save the whole project", () => {
  const dir = join(__dirname, "..", "project", "agentic");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it.each(files)("%s writes answers with patchProjectAnswers / patchAnswers", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    expect(src).not.toMatch(/getProjectStore\(\)\s*\.save\(/);
  });
});
