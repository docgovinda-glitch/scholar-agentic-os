/** A literature item shown in the Evidence Matrix. (The unused prompt builder and export formatters that lived here were removed; AI prompts belong to scholarBrain and references to the citation engine.) */

export interface LiteratureItem {
  id: string;
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  journal: string;
  source: "vault" | "external";
  relevanceScore: number;
  themes: string[];
  abstract: string;
  isLandmark?: boolean;
  portal?: string;
  url?: string;
  citationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdfUrl?: string;
}
