/**
 * Discipline register conventions — feeds Level 4 ("Register").
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §4 Level 4,
 * and docs/01-product/14-OUTPUT-TYPE-CATALOG.md OT-20 for the register
 * inversion case (policy briefs want directness, not academic hedging).
 */

import type { DisciplineRegister } from "./types";

const REGISTRIES: Record<string, DisciplineRegister> = {
  "natural-sciences": {
    discipline: "natural-sciences",
    preferPassiveVoice: true,
    allowFirstPerson: false,
    hedgingExpected: true,
  },
  "social-sciences": {
    discipline: "social-sciences",
    preferPassiveVoice: false,
    allowFirstPerson: true,
    hedgingExpected: true,
  },
  humanities: {
    discipline: "humanities",
    preferPassiveVoice: false,
    allowFirstPerson: true,
    hedgingExpected: false,
  },
  engineering: {
    discipline: "engineering",
    preferPassiveVoice: true,
    allowFirstPerson: false,
    hedgingExpected: false,
  },
  /** Policy briefs, white papers: hedging is a defect, not a convention (OT-20). */
  applied: {
    discipline: "applied",
    preferPassiveVoice: false,
    allowFirstPerson: true,
    hedgingExpected: false,
  },
};

export function registerFor(discipline: string): DisciplineRegister {
  return REGISTRIES[discipline] ?? REGISTRIES["social-sciences"];
}

export function describeRegisterForPrompt(register: DisciplineRegister): string {
  const parts: string[] = [];
  parts.push(register.preferPassiveVoice ? "prefer passive voice" : "prefer active voice");
  parts.push(register.allowFirstPerson ? "first person is acceptable" : "avoid first person");
  parts.push(
    register.hedgingExpected
      ? "appropriate hedging of claims is expected"
      : "state claims directly; do not hedge unnecessarily"
  );
  return parts.join("; ");
}
