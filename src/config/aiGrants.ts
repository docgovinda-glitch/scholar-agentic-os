/**
 * Free-tier recipes and legitimate grant programs shown in AI Access.
 *
 * Pure data, shared by the browser and tests. Amounts and eligibility change often: every entry says "up to" or
 * "about" where it can, and the screen tells people to confirm on the official page. Nothing here is an account
 * or an application; Scholar never signs anyone up.
 *
 * The line this list draws (and `server/src/aiEngine/opportunityAgent.ts` enforces when it files findings):
 * student, researcher and personal free-tier credits belong to one person and are used only with that person's own
 * key (BYOK). Only startup and cloud-partner programs are the kind of grant a shared platform pool may use.
 */

export type GrantAudience = "student" | "researcher" | "startup";

export interface GrantProgram {
  id: string;
  name: string;
  audience: GrantAudience;
  /** What it is worth, hedged ("up to", "about"). */
  value: string;
  summary: string;
  /** The program's own page. */
  url: string;
  /** A trap to know about before relying on it. */
  warning?: string;
}

export const GRANT_AUDIENCE_LABEL: Record<GrantAudience, string> = {
  student: "Students",
  researcher: "Researchers",
  startup: "Startups (can back a shared team pool)",
};

export const GRANT_PROGRAMS: readonly GrantProgram[] = [
  { id: "azure-students", name: "Azure for Students", audience: "student", value: "About $100 per year", summary: "Credit for verified students, no card needed. Use it for Azure OpenAI with your own key.", url: "https://azure.microsoft.com/free/students/" },
  { id: "gcp-trial", name: "Google Cloud free trial", audience: "student", value: "About $300 for new accounts", summary: "Trial credit that can pay for Gemini on Vertex AI.", url: "https://cloud.google.com/free" },
  { id: "gcp-research", name: "Google Cloud research credits", audience: "researcher", value: "By application", summary: "Cloud credits for academic research, including Vertex AI.", url: "https://cloud.google.com/edu/researchers" },
  { id: "tpu-research-cloud", name: "TPU Research Cloud", audience: "researcher", value: "Free TPU time, by application", summary: "Free access to Cloud TPUs for open research you intend to publish.", url: "https://sites.research.google/trc/about/" },
  { id: "openai-researcher", name: "OpenAI Researcher Access", audience: "researcher", value: "Up to about $1,000", summary: "API credits for research on safety, fairness and societal impact, by application.", url: "https://openai.com/form/researcher-access-program/" },
  { id: "anthropic-researcher", name: "Anthropic External Researcher Access", audience: "researcher", value: "About $1,000 per cycle", summary: "API credits for researchers working on AI safety and alignment, by application. Search the program name on Anthropic's site for the current form.", url: "https://www.anthropic.com/" },
  { id: "nairr", name: "NAIRR Pilot", audience: "researcher", value: "Compute and model access, by application", summary: "The US National AI Research Resource pilot: compute, datasets and hosted models for US-based research.", url: "https://nairrpilot.org/" },
  { id: "google-startups", name: "Google for Startups Cloud Program", audience: "startup", value: "Up to $350,000", summary: "Cloud credit that covers Gemini and partner models on Vertex AI.", url: "https://cloud.google.com/startup" },
  { id: "aws-activate", name: "AWS Activate", audience: "startup", value: "Up to $200,000", summary: "Credit that covers models on Amazon Bedrock.", url: "https://aws.amazon.com/startups/credits" },
  {
    id: "microsoft-startups",
    name: "Microsoft for Startups Founders Hub",
    audience: "startup",
    value: "Up to $150,000",
    summary: "Azure credit that covers Azure OpenAI deployed natively in Azure.",
    url: "https://www.microsoft.com/startups",
    warning: "Third-party models bought through Azure AI Foundry's Marketplace (for example other labs' models) are billed separately and are not paid from these credits. Check the billing line before you deploy.",
  },
];

export interface FreeRecipe {
  id: string;
  title: string;
  body: string;
  /** Catalog provider ids or runner ids this recipe uses, for linking into the screen. */
  providers: string[];
}

export const FREE_RECIPES: readonly FreeRecipe[] = [
  {
    id: "openrouter-unlock",
    title: "OpenRouter: $10 once unlocks 1,000 free requests a day",
    body: "`:free` models are limited to about 50 requests a day. Buying $10 of credit once raises that to 1,000 requests a day on `:free` models, permanently. You do not have to spend the credit.",
    providers: ["openrouter"],
  },
  {
    id: "stack-workhorses",
    title: "Stack the free workhorses for quick work",
    body: "Cerebras (about 1M tokens a day), Groq, Cloudflare Workers AI (10,000 Neurons a day) and OVHcloud AI Endpoints each have a large free allowance. Connect several: Scholar sends quick tasks (chat, extraction, summaries) to them first and keeps your scarcer reasoning quota for drafting and review.",
    providers: ["cerebras", "groq", "cloudflare", "ovhcloud"],
  },
  {
    id: "backup-keys",
    title: "Add backup keys, in different projects",
    body: "Each provider takes up to three keys. When one runs out, Scholar switches to the next without interrupting your work. For Gemini, create each key in a different Google project: quotas are per project, not per key.",
    providers: ["gemini"],
  },
  {
    id: "huggingface-pro",
    title: "Hugging Face PRO credits",
    body: "A PRO subscription includes about $2 a month of inference credit across Hugging Face's providers, on top of the free allowance.",
    providers: ["huggingface"],
  },
  {
    id: "free-gpu-tunnel",
    title: "Run your own open model on a free GPU",
    body: "Modal's starter plan includes about $30 a month of compute, and Kaggle gives roughly 30 GPU hours a week. Serve a model with vLLM or Ollama, expose it with a Cloudflare Tunnel, and paste the https address as that runner's address. Scholar's server calls it, so it works without your laptop. Keep the address private: anyone with it can use your GPU.",
    providers: ["vllm", "ollama"],
  },
];
