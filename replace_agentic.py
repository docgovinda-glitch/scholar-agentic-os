import re

with open("server/routes/project/agentic.ts", "r") as f:
    content = f.read()

# Make literature dynamic and increase count
new_literature = """  const workingTitle = project.answers["working_title"] || "Untitled Research";
  const researchArea = project.answers["research_area"] || "the field";
  
  // MOCKED SEMANTIC DISCOVERY LOGIC:
  const semanticVariants = [
    `"${workingTitle}" OR related core concepts`,
    `Methodological approaches similar to "${workingTitle}"`,
    `Empirical studies addressing "${workingTitle}"`
  ];

  const discoveredLiterature = [
    {
      id: "lit-001",
      title: `Contextualizing ${workingTitle}: A review of ${researchArea}`,
      authors: ["Smith, J.", "Doe, A."],
      year: 2025,
      journal: "Journal of Advanced Research",
      source: "vault",
      relevanceScore: 95,
      themes: ["core concepts", "semantic match"],
      abstract: `This paper explores the exact semantic core of the working title "${workingTitle}", finding a 40% correlation in past literature.`,
    },
    {
      id: "lit-002",
      title: `Methodologies for ${workingTitle.split(" ")[0] || "Research"} in ${researchArea}`,
      authors: ["Chen, M."],
      year: 2026,
      journal: "Methodology Review",
      source: "external",
      relevanceScore: 88,
      themes: ["methodology", "empirical"],
      abstract: `Analyzes the methodological bounds of the topics surrounding "${workingTitle}". Concludes that objective semantic frameworks are best.`,
    },
    {
      id: "lit-003",
      title: `Foundational Theories of ${workingTitle}`,
      authors: ["Gonzalez, R.", "Kim, T."],
      year: 2024,
      journal: "Information Systems Research",
      source: "vault",
      relevanceScore: 82,
      themes: ["theoretical framework", "background"],
      abstract: `A comprehensive review of the background concepts that often inform studies similar to "${workingTitle}".`,
    },
    {
      id: "lit-004",
      title: `Empirical Evidence for ${workingTitle}: A Meta-Analysis`,
      authors: ["Lee, S.", "Patel, N."],
      year: 2023,
      journal: `International Journal of ${researchArea || "Research"}`,
      source: "external",
      relevanceScore: 91,
      themes: ["empirical", "meta-analysis"],
      abstract: `This meta-analysis aggregates data from 45 studies related to "${workingTitle}", highlighting key trends and future directions.`,
    },
    {
      id: "lit-005",
      title: `The Future of ${workingTitle} and Its Impact`,
      authors: ["Garcia, L.", "Nguyen, H."],
      year: 2026,
      journal: "Future Tech & Society",
      source: "vault",
      relevanceScore: 85,
      themes: ["future impact", "societal implications"],
      abstract: `Discusses the potential long-term implications of advancements in "${workingTitle}" on the broader society and industry.`,
    },
    {
      id: "lit-006",
      title: `Challenges in Implementing ${workingTitle} Solutions`,
      authors: ["Wright, E.", "Adams, P."],
      year: 2025,
      journal: "Journal of Applied Innovation",
      source: "external",
      relevanceScore: 79,
      themes: ["challenges", "implementation"],
      abstract: `Identifies the core challenges and barriers when applying "${workingTitle}" methodologies in practical real-world scenarios.`,
    }
  ];"""

content = re.sub(r'  const workingTitle = project.answers\["working_title"\].*?];\n', new_literature + '\n', content, flags=re.DOTALL)


# Make gaps dynamic
new_gaps = """  const workingTitle = project.answers["working_title"] || "Untitled Research";
  const researchArea = project.answers["research_area"] || "the field";

  const identifiedGaps = [
    {
      id: "gap-001",
      gap_type: "empirical",
      description: `Lack of longitudinal studies assessing the long-term impact of ${workingTitle} within the context of ${researchArea}.`,
      importance_score: 92,
      status: "identified"
    },
    {
      id: "gap-002",
      gap_type: "theoretical",
      description: `Absence of a unified epistemological framework defining the boundary between established ${researchArea} theories and ${workingTitle}.`,
      importance_score: 85,
      status: "identified"
    },
    {
      id: "gap-003",
      gap_type: "methodological",
      description: `Current methods in ${researchArea} rely heavily on self-reported metrics rather than standardized benchmarking for ${workingTitle}.`,
      importance_score: 78,
      status: "identified"
    }
  ];"""

content = re.sub(r'  const identifiedGaps = \[.*?\];', new_gaps, content, flags=re.DOTALL)


# Make vault sources dynamic and increase count
new_vault = """  const workingTitle = project.answers["working_title"] || "Untitled Research";
  const researchArea = project.answers["research_area"] || "the field";

  const discoveredSources = [
    {
      id: "source-001",
      title: `Impact of ${workingTitle} on ${researchArea} Well-being`,
      author: "Chen et al.",
      year: 2024,
      relevance_score: 95,
      type: "PDF Document"
    },
    {
      id: "source-002",
      title: `The Epistemological Boundary of ${workingTitle}`,
      author: "Smith & Zhao",
      year: 2025,
      relevance_score: 89,
      type: "Journal Article"
    },
    {
      id: "source-003",
      title: `Measuring Semantic Drift in ${workingTitle}`,
      author: "O'Connor",
      year: 2023,
      relevance_score: 82,
      type: "Conference Proceeding"
    },
    {
      id: "source-004",
      title: `A Review of ${workingTitle} and Its Applications in ${researchArea}`,
      author: "Kim & Park",
      year: 2026,
      relevance_score: 91,
      type: "Journal Article"
    },
    {
      id: "source-005",
      title: `Understanding ${researchArea} through the lens of ${workingTitle}`,
      author: "Davis et al.",
      year: 2024,
      relevance_score: 87,
      type: "PDF Document"
    }
  ];"""
content = re.sub(r'  const discoveredSources = \[.*?\];', new_vault, content, flags=re.DOTALL)

with open("server/routes/project/agentic.ts", "w") as f:
    f.write(content)

