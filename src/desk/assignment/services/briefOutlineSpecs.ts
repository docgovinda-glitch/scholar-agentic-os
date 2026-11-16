import { isTutorialOrShortQABrief } from "../../../utils/briefExtractor";
import { isNonQuestionBriefLine, parseBriefQuestions, groupBriefQuestions } from "../../../utils/briefQuestions";
import { extractBriefInquiriesAndConcepts, deconstructQuestionSemantics, clipWords, shortHeading, formatAcademicTopicTitle } from "./briefSemantics";

export interface HeadingSpec {
  title: string;
  notes?: string;
  subheadings: {
    title: string;
    ratio: number;
    guidance: string;
    keyPoints: string[];
  }[];
}
/** Max top-level sections an outline may be expanded to (human-scale outlines). */
export const MAX_OUTLINE_SECTIONS = 8;
/**
 * Construct truly brief-specific, non-generic heading specifications directly mirroring
 * extracted inquiries, explicit brief sub-tasks, questions, and domain concepts.
 */

export function buildBriefSpecificSpecs(
  question: string,
  briefText: string | undefined,
  assignmentType: string,
  targetFrameworks: string[],
  targetWordCount?: number
): HeadingSpec[] {
  const inquiries = extractBriefInquiriesAndConcepts(question, briefText);
  const directTasks = [...inquiries.extractedTasks, ...inquiries.subQuestions]
    .filter((t) => !isNonQuestionBriefLine(t))
    .slice(0, MAX_OUTLINE_SECTIONS);
  const semantics = deconstructQuestionSemantics(question);
  const primaryTopic = semantics.topicA || inquiries.coreThemes[0] || "Primary Analytical Focus";
  const secondaryTopic = semantics.topicB || inquiries.coreThemes[1] || "";
  const concepts = inquiries.keyConcepts;
  const isCoursework = assignmentType === "coursework" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    assignmentType === "case_study";

  const primaryFramework = targetFrameworks[0] || (isCoursework ? "Applied Analytical Model" : "Theoretical Explanatory Framework");

  // The brief states its own questions and marks: one section per main question,
  // budgets proportional to the marks, Focus lines quoting the brief itself.
  const markedRows = parseBriefQuestions(briefText || question || "");
  if (markedRows.length >= 2 && markedRows.some((r) => r.marks)) {
    // One section per main question: the stem and its sub-parts stay together and
    // no question is ever dropped, however many there are.
    const groups = groupBriefQuestions(markedRows);
    const known = groups.filter((g) => g.marks);
    const avgMarks = known.reduce((t, g) => t + (g.marks ?? 0), 0) / Math.max(1, known.length);
    const weights = groups.map((g) => g.marks ?? avgMarks);
    const totalWeight = weights.reduce((t, w) => t + w, 0) || 1;
    return groups.map((g, i) => {
      const n = i + 1;
      const heading = g.stem ? clipWords(g.stem.text, 12) : shortHeading(g.title, 10);
      const focus = [g.stem?.text, ...g.parts.map((p) => `(${p.label.slice(-1)}) ${p.text}`)].filter(Boolean).join(" ");
      const partWeights = g.parts.map((p) => p.marks ?? 1);
      const partTotal = partWeights.reduce((t, w) => t + w, 0) || 1;
      return {
        title: `${n}.0 ${heading}`,
        // The full question stem stays with its section (shown as a quiet subtitle, never in the heading).
        notes: g.stem?.text ?? `Answers ${g.key} from the brief.`,
        // Sub-parts get their own short titles; a single prompt gets one neutral
        // sub-section, never a copy of the parent title.
        subheadings: g.parts.length > 0
          ? g.parts.map((p, k) => ({
            title: `${n}.${k + 1} ${shortHeading(p.text)}`,
            ratio: (weights[i] / totalWeight) * (partWeights[k] / partTotal),
            guidance: `Focus: (${p.label.slice(-1)}) ${p.text}`,
            keyPoints: [] as string[],
          }))
          : [
            {
              title: `${n}.1 Key points and evidence`,
              ratio: weights[i] / totalWeight,
              guidance: `Focus: ${focus}`,
              keyPoints: [] as string[],
            },
          ],
      };
    });
  }

  const isTutorialOrShort = (targetWordCount !== undefined && targetWordCount <= 600) ||
    isTutorialOrShortQABrief(briefText || question, targetWordCount);

  // If the brief provided 2 or more explicit tasks or questions, mirror them directly!
  if (directTasks.length >= 2) {
    if (isTutorialOrShort) {
      const perTaskRatio = Number((1 / Math.max(1, directTasks.length)).toFixed(4));
      return directTasks.map((task, tIdx) => {
        const cleanTaskTitle = formatAcademicTopicTitle(
          task
            .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|investigate|discuss|explore|propose|detail)\s+/i, "")
            .replace(/[?:.]+$/, "")
            .trim()
        );
        return {
          title: `${tIdx + 1}.0 ${cleanTaskTitle}`,
          notes: `Directly address: "${task}".`,
          subheadings: [
            {
              title: `${tIdx + 1}.1 Key points and evidence`,
              ratio: perTaskRatio,
              guidance: `Focus: Provide a direct, evidence-based, conversational answer addressing: "${task}".`,
              keyPoints: [
                `Direct response to directive: ${task.slice(0, 80)}`,
                `Grounding in core concepts (${primaryFramework})`,
                `Concrete operational or practical evaluation`,
              ],
            },
          ],
        };
      });
    }

    const taskSpecs: HeadingSpec[] = directTasks.map((task, tIdx) => {
      const cleanTaskTitle = formatAcademicTopicTitle(
        task
          .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|investigate|discuss|explore|propose|detail)\s+/i, "")
          .replace(/[?:.]+$/, "")
          .trim()
      );

      const taskConcept = concepts[tIdx] || primaryTopic;
      const relatedConcept = concepts[(tIdx + 1) % (concepts.length || 1)] || secondaryTopic || "Operational Dynamics";

      return {
        title: `${tIdx + 1}.0 ${cleanTaskTitle}`,
        notes: `Directly address and substantiate: "${task}".`,
        subheadings: [
          {
            title: `${tIdx + 1}.1 Key points and evidence`,
            ratio: 1 / directTasks.length,
            guidance: `Focus: Analyze the conceptual mechanisms, theoretical grounding (${primaryFramework}) and empirical evidence needed to answer: "${task}".`,
            keyPoints: [
              `Direct answer to directive: ${task.slice(0, 80)}`,
              `Analytical parameters and theoretical grounding (${primaryFramework})`,
              `Empirical evidence addressing ${relatedConcept} and core mechanisms concerning ${taskConcept}`,
            ],
          },
        ],
      };
    });

    if (taskSpecs.length === 2) {
      taskSpecs.push({
        title: isCoursework
          ? `3.0 Strategic Interventions, Implementation Roadmap & Governance Framework`
          : `3.0 Analytical Synthesis, Critical Evaluation & Scholarly Horizons`,
        notes: `Synthesize findings across preceding tasks into actionable recommendations and critical reflection.`,
        subheadings: [
          {
            title: isCoursework
              ? `Prioritized Evidence-Based Recommendations for ${primaryTopic}`
              : `Critical Evaluation and Evidentiary Rebuttal: ${primaryTopic}`,
            ratio: 0.16,
            guidance: `Synthesize insights into prioritized interventions or evidence-based rebuttal.`,
            keyPoints: [
              `Actionable interventions substantiated by preceding analysis`,
              `Mitigation of structural and operational risks`,
              `Measurable indicators and governance criteria`,
            ],
          },
          {
            title: isCoursework
              ? `Implementation Roadmap, Risk Mitigation & Academic Reflection`
              : `Scholarly Synthesis, Policy Implications & Future Research Horizons`,
            ratio: 0.16,
            guidance: `Detail rollout timeline, stakeholder engagement, and critical reflection.`,
            keyPoints: [
              `Phased implementation timeline and contingency buffers`,
              `Stakeholder implications and strategic trade-offs`,
              `Future outlook and prospective developments`,
            ],
          },
        ],
      });
    }

    const totalRatio = taskSpecs.flatMap((h) => h.subheadings).reduce((s, sub) => s + sub.ratio, 0);
    taskSpecs.forEach((h) => {
      h.subheadings.forEach((sub) => {
        sub.ratio = sub.ratio / totalRatio;
      });
    });

    return taskSpecs;
  }

  // Universal concept-driven deconstruction (non-generic, brief-specific)
  const c1 = concepts[0] || primaryTopic;
  const c2 = concepts[1] || secondaryTopic || (primaryTopic !== concepts[0] ? primaryTopic : "Empirical Dynamics");
  const c3 = concepts[2] || "Comparative Realities";
  const c4 = concepts[3] || "Strategic Horizons";

  if (isCoursework) {
    return [
      {
        title: `Problem Formulation, Operational Scope & Baseline: ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Deconstruct the assignment problem statement against module benchmarks and ${primaryFramework} criteria.`,
        subheadings: [
          {
            title: `Diagnostic Problem Decomposition and Scope Boundaries: ${c1}`,
            ratio: 0.15,
            guidance: `Deconstruct core assignment brief directives for ${c1}, establish operational baseline, and define diagnostic compliance parameters.`,
            keyPoints: [
              `Deconstruction of core brief criteria for ${c1}`,
              `Contextual baseline and diagnostic problem parameters`,
              `Compliance benchmarks and performance indicators`,
            ],
          },
          {
            title: `Applied Analytical Framework & Methodological Protocol: ${primaryFramework}`,
            ratio: 0.17,
            guidance: `Detail and justify analytical models (${targetFrameworks.slice(0, 2).join(", ") || primaryFramework}), secondary data sources, and investigative procedures.`,
            keyPoints: [
              `Methodological justification for ${primaryFramework}`,
              `Empirical data gathering and evidence protocol`,
              `Analytical validity, reliability, and scope constraints`,
            ],
          },
        ],
      },
      {
        title: `Applied Empirical Investigation, Diagnostic Evaluation & Comparative Dynamics: ${c2}`,
        notes: `Execute rigorous applied evaluation using ${primaryFramework} against real-world evidence or organizational scenarios.`,
        subheadings: [
          {
            title: `In-Depth Diagnostic Model Application to Empirical Evidence: ${c2}`,
            ratio: 0.22,
            guidance: `Apply diagnostic models directly to primary evidence in ${c2} to evaluate systemic performance and operational friction.`,
            keyPoints: [
              `Diagnostic application of ${primaryFramework} to evidence in ${c2}`,
              `Identification of systemic friction and performance deficits`,
              `Comparative benchmarking against industry and scholarly standards`,
            ],
          },
          {
            title: `Critical Evaluation of Institutional Constraints & Risk Factors: ${c3}`,
            ratio: 0.18,
            guidance: `Scrutinize operational vulnerabilities, institutional resistance, compliance risks, and feasibility barriers addressing ${c3}.`,
            keyPoints: [
              `Institutional bottlenecks and operational constraints in ${c3}`,
              `Resource deficits and structural feasibility barriers`,
              `Multi-variable risk assessment and trade-offs`,
            ],
          },
        ],
      },
      {
        title: `Strategic Interventions, Implementation Roadmap & Critical Reflection: ${c4}`,
        notes: `Synthesize diagnostic findings into actionable SMART interventions, risk mitigation, and module self-evaluation.`,
        subheadings: [
          {
            title: `Prioritized Evidence-Based Recommendations & Strategic Interventions for ${c1}`,
            ratio: 0.16,
            guidance: `Formulate concrete, prioritized SMART recommendations for ${c1} justified by diagnostic evidence and ${primaryFramework}.`,
            keyPoints: [
              `Actionable SMART intervention measures for ${c1}`,
              `Resource allocation, budget priorities, and phased timeline`,
              `Measurable KPIs and governance monitoring mechanisms`,
            ],
          },
          {
            title: `Implementation Roadmap, Risk Mitigation Matrix & Critical Academic Reflection`,
            ratio: 0.12,
            guidance: `Construct a phased rollout plan with contingency buffers, stakeholder management protocols, and critical evaluation of module learnings.`,
            keyPoints: [
              `Contingency planning for operational and strategic risks in ${c2}`,
              `Stakeholder engagement and change management protocols`,
              `Critical self-reflection on analytical limits and learning outcomes`,
            ],
          },
        ],
      },
    ];
  }

  // Detect intellectual inquiry architecture dynamically from prompt semantics
  const qLower = (question || "").toLowerCase();
  const isComparative = qLower.includes("compare") ||
    qLower.includes("contrast") ||
    qLower.includes("versus") ||
    qLower.includes(" vs ") ||
    qLower.includes("similarities and differences") ||
    qLower.includes("comparative");

  const isCausal = qLower.includes("why did") ||
    qLower.includes("why do") ||
    qLower.includes("causes of") ||
    qLower.includes("factors that led") ||
    qLower.includes("explain why") ||
    qLower.includes("reasons for") ||
    qLower.includes("causal mechanism") ||
    qLower.includes("reduce") ||
    qLower.includes("impact of");

  if (isComparative) {
    return [
      {
        title: `Theoretical Foundations & Comparative Parameters: ${primaryTopic}${secondaryTopic ? ` and ${secondaryTopic}` : ""}`,
        notes: `Establish foundational definitions, comparative benchmarks, and theoretical models (${primaryFramework}) governing ${primaryTopic}.`,
        subheadings: [
          {
            title: `Theoretical Foundations of ${c1}`,
            ratio: 0.15,
            guidance: `Define primary concepts, analytical frameworks, and scope conditions governing ${c1}.`,
            keyPoints: [
              `Foundational taxonomy and conceptual framing of ${c1}`,
              `Core theoretical assumptions of ${primaryFramework}`,
              `Analytical criteria and comparative evaluation metrics`,
            ],
          },
          {
            title: secondaryTopic
              ? `Comparative Analytical Dimensions: Divergence and Commonalities in ${secondaryTopic}`
              : `Comparative Analytical Dimensions: Divergence and Commonalities in ${c2}`,
            ratio: 0.18,
            guidance: `Analyze key structural and institutional dimensions that differentiate ${c1} and ${secondaryTopic || c2}.`,
            keyPoints: [
              `Direct comparative metrics and institutional mechanisms`,
              `Structural similarities, distinctions, and divergence`,
              `Scope conditions and contextual mediating factors`,
            ],
          },
        ],
      },
      {
        title: `Comparative Empirical Investigation & Case Scrutiny: ${c2}`,
        notes: `Evaluate empirical case studies, observational datasets, and comparative evidence.`,
        subheadings: [
          {
            title: `Empirical Evidence and Observational Findings in ${c1}`,
            ratio: 0.20,
            guidance: `Scrutinize primary empirical findings and real-world case observations examining ${c1}.`,
            keyPoints: [
              `Empirical case observations and field evidence`,
              `Comparative institutional performance and variations`,
              `Methodological reliability and data consistency`,
            ],
          },
          {
            title: `Critical Evaluation of Explanatory Power and Anomalies: ${c3}`,
            ratio: 0.18,
            guidance: `Critique competing explanations, empirical anomalies, and boundary conditions in ${c3}.`,
            keyPoints: [
              `Assessment of competing theoretical models`,
              `Empirical anomalies and explanatory limitations in ${c3}`,
              `Contextual heterogeneity and comparative trade-offs`,
            ],
          },
        ],
      },
      {
        title: `Comparative Synthesis, Implications & Scholarly Horizons: ${c4}`,
        notes: `Synthesize comparative insights into a rigorous conclusion with theoretical and policy implications.`,
        subheadings: [
          {
            title: `Synthesis of Comparative Evidence and Critical Evaluation: ${c1}`,
            ratio: 0.15,
            guidance: `Synthesize findings across comparative dimensions to resolve core analytical tensions.`,
            keyPoints: [
              `Synthesis of comparative evidence and thesis defense for ${primaryTopic}`,
              `Reconciliation of empirical disparities and scope conditions`,
              `Overarching explanatory verdict on ${c1}`,
            ],
          },
          {
            title: `Theoretical Implications, Policy Realities, and Future Research Agenda`,
            ratio: 0.14,
            guidance: `Detail wider implications for scholarship, institutional practice, and future inquiry.`,
            keyPoints: [
              `Contributions to scholarly literature and theoretical models`,
              `Substantive policy or practice implications in ${c3}`,
              `Emerging analytical horizons and future research priorities`,
            ],
          },
        ],
      },
    ];
  }

  if (isCausal) {
    return [
      {
        title: `Theoretical Framing and Causal Architecture of ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Establish foundational concepts, causal hypotheses, and explanatory models (${primaryFramework}) governing ${primaryTopic}.`,
        subheadings: [
          {
            title: `Causal Foundations of ${c1}`,
            ratio: 0.15,
            guidance: `Define core concepts, transmission channels, and theoretical propositions governing ${c1}.`,
            keyPoints: [
              `Foundational concepts and causal hypotheses regarding ${c1}`,
              `Theoretical mechanisms posited by ${primaryFramework}`,
              `Scope conditions and analytical boundaries`,
            ],
          },
          {
            title: secondaryTopic
              ? `Structural Drivers and Transmission Mechanisms in ${secondaryTopic}`
              : `Structural Drivers and Transmission Mechanisms in ${c2}`,
            ratio: 0.18,
            guidance: `Analyze dominant transmission mechanisms and structural factors driving ${c1}.`,
            keyPoints: [
              `Primary causal mechanisms and operational pathways`,
              `Intermediary variables and structural dynamics in ${c2}`,
              `Institutional and environmental mediating influences`,
            ],
          },
        ],
      },
      {
        title: `Substantive Evidence and Competing Explanations: ${c1}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Investigate observational data, case evidence, and rival explanations.`,
        subheadings: [
          {
            title: secondaryTopic
              ? `Critical Evaluation of Competing Explanations in ${secondaryTopic}`
              : `Critical Evaluation of Competing Explanations and Evidence on ${c1}`,
            ratio: 0.20,
            guidance: `Critically unpack rival explanations, empirical counter-evidence, and dissenting schools of thought on ${c1}.`,
            keyPoints: [
              `Rival explanations and dissenting interpretations of ${c1}`,
              `Empirical counter-evidence and anomalies in ${c2}`,
              `Contextual divergence and comparative evidence`,
            ],
          },
          {
            title: `Methodological Scrutiny, Endogeneity, and Boundary Conditions: ${c3}`,
            ratio: 0.17,
            guidance: `Scrutinize causal inference challenges, potential confounding factors, and empirical boundary conditions in ${c3}.`,
            keyPoints: [
              `Causal identification challenges and confounding variables in ${c3}`,
              `Measurement limitations and methodological constraints`,
              `Structural scope limits and contextual caveats`,
            ],
          },
        ],
      },
      {
        title: `Analytical Synthesis, Evidentiary Resolution & Future Horizons: ${c4}`,
        notes: `Reconcile evidence, defend the central thesis, and articulate wider scholarly implications.`,
        subheadings: [
          {
            title: `Evidentiary Synthesis and Resolution of Competing Claims: ${c1}`,
            ratio: 0.16,
            guidance: `Weigh evidence across rival explanations to substantiate an authoritative, nuanced conclusion on ${c1}.`,
            keyPoints: [
              `Evidence-based resolution of competing explanations on ${c1}`,
              `Vindication of the primary causal argument in ${c2}`,
              `Nuanced reconciliation of empirical trade-offs`,
            ],
          },
          {
            title: `Scholarly Contributions, Policy Implications, and Emerging Horizons`,
            ratio: 0.14,
            guidance: `Synthesize overarching conclusions into actionable policy insights and forward-looking research horizons.`,
            keyPoints: [
              `Overarching contribution to academic debate on ${primaryTopic}`,
              `Policy and governance implications in ${c3}`,
              `Prospective research questions and methodological frontiers`,
            ],
          },
        ],
      },
    ];
  }

  // General Analytical Inquiry: Question-Grounded Academic Architecture
  return [
    {
      title: `Theoretical Foundations and Analytical Framing of ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
      notes: `Establish foundational definitions, theoretical models (${primaryFramework}), and analytical scope governing ${primaryTopic}.`,
      subheadings: [
        {
          title: `Theoretical Foundations of ${c1}`,
          ratio: 0.15,
          guidance: `Define primary concepts, taxonomical frameworks, and analytical boundaries addressing ${c1}.`,
          keyPoints: [
            `Foundational taxonomy and theoretical stakes of ${c1}`,
            `Epistemological definitions and scope boundaries`,
            `Primary causal mechanisms and analytical criteria`,
          ],
        },
        {
          title: secondaryTopic
            ? `Analytical Frameworks: ${primaryFramework} Governing ${secondaryTopic}`
            : `Analytical Frameworks: ${primaryFramework} and Explanatory Mechanisms`,
          ratio: 0.18,
          guidance: secondaryTopic
            ? `Synthesize primary theoretical mechanisms linking ${c1} directly to ${secondaryTopic} using ${primaryFramework}.`
            : `Analyze dominant theoretical perspectives explaining causal and functional dynamics of ${c1}.`,
          keyPoints: [
            `Core theoretical assumptions of ${primaryFramework}`,
            `Explanatory causal claims and transmission channels in ${c2}`,
            `Scope conditions, structural assumptions, and mediating variables`,
          ],
        },
      ],
    },
    {
      title: `Substantive Evidence and Comparative Evaluation: ${c1}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
      notes: `Investigate primary empirical findings, real-world case evidence, and operational dynamics.`,
      subheadings: [
        {
          title: secondaryTopic
            ? `Critical Evaluation and Competing Perspectives in ${secondaryTopic}`
            : `Critical Evaluation and Competing Perspectives on ${c1}`,
          ratio: 0.20,
          guidance: `Critically unpack rival perspectives, empirical anomalies, and counter-arguments challenging prevailing assumptions regarding ${c1}.`,
          keyPoints: [
            `Primary counter-arguments and dissenting schools of thought on ${c1}`,
            `Empirical counter-evidence and systemic anomalies in ${c2}`,
            `Contextual heterogeneity and comparative divergence`,
          ],
        },
        {
          title: `Critical Evaluation, Contextual Factors, and Analytical Limits: ${c3}`,
          ratio: 0.17,
          guidance: `Focus: Scrutinize systemic friction points, boundary conditions, and analytical limits in the scholarship surrounding ${c3}.`,
          keyPoints: [
            `Measurement limitations and methodological vulnerabilities in ${c3}`,
            `Confounding variables and endogeneity concerns`,
            `Structural boundary conditions and contextual disparities`,
          ],
        },
      ],
    },
    {
      title: `Analytical Synthesis, Critical Evaluation & Future Horizons: ${c4}`,
      notes: `Rigorously weigh counterarguments, address methodological limitations, and reach an evidence-based resolution.`,
      subheadings: [
        {
          title: `Synthesis and Resolution of Core Arguments: ${c1}`,
          ratio: 0.16,
          guidance: `Focus: Weigh conflicting perspectives, evaluate evidentiary robustness, and synthesize a nuanced resolution of ${c1}.`,
          keyPoints: [
            `Evidence-based evaluation of competing perspectives on ${c1}`,
            `Reconciliation of empirical and theoretical tensions in ${c2}`,
            `Refined explanatory framework and analytical resolution`,
          ],
        },
        {
          title: `Strategic Policy Implications and Future Research Horizons`,
          ratio: 0.14,
          guidance: `Focus: Synthesize analytical conclusions into coherent academic arguments and forward-looking strategic recommendations.`,
          keyPoints: [
            `Overarching scholarly contribution and thesis vindication for ${primaryTopic}`,
            `Evidence-based policy, practice, or theoretical implications in ${c3}`,
            `Prospective research agenda and emerging analytical horizons`,
          ],
        },
      ],
    },
  ];
}
