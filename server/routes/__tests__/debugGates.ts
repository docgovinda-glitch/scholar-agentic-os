import { GATE_ENTRY_REQUIRES } from "../../../src/domain/project/gates.ts";
import { getGateState, isGateSignedOff, entryPrerequisitesMet } from "../../../src/domain/project/gates.ts";

const projectGates = {
  "gates": {
    "G0": {
      "gate": "G0",
      "status": "signed_off",
      "exitCriteria": [],
      "invalidatedBy": [],
      "entrySatisfied": true
    },
    "G1": {
      "gate": "G1",
      "status": "signed_off",
      "exitCriteria": [],
      "invalidatedBy": [],
      "entrySatisfied": true
    },
    "G2": {
      "gate": "G2",
      "status": "signed_off",
      "exitCriteria": [],
      "invalidatedBy": [],
      "entrySatisfied": true
    }
  },
  "chapterGates": {
    "introduction": {}
  }
};

const okG0 = isGateSignedOff(projectGates as any, "G0", "introduction");
const okG2 = isGateSignedOff(projectGates as any, "G2", "introduction");
const prerequisites = entryPrerequisitesMet(projectGates as any, "G3", "introduction");

console.log("is G0 signed off?", okG0);
console.log("is G2 signed off?", okG2);
console.log("prerequisites for G3?", prerequisites);
