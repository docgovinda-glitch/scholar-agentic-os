import { describe, it, expect } from "vitest";
import {
  verifyAndConvertToCSL,
  verifyAndDeduplicateSources,
  formatCSLInTextSingle,
  formatCSLBibliographyEntry,
  enforceCitationReferenceBijection,
  exportCSLToBibTeX,
  exportCSLToRIS,
  parseReferenceImportText,
  extractWebPageMetadataFromHtml,
  type RawSourceInput,
  type SupportedCSLStyle,
} from "../cslEngine";

/**
 * Golden-File Test Suite (Section 6 & Section 16):
 * Verifies exact formatted output across all supported styles (APA 7th, MLA 9th,
 * Chicago 17th Author-Date, Chicago 17th Notes & Bibliography, Harvard, IEEE, Vancouver)
 * for 5 known DOIs and 2 known web pages, plus strict rejection of placeholder metadata
 * ("Contributors", "Wikipedia Contributors", "Unknown", "Anonymous", "n.d.") and retracted works.
 */
describe("CSL-JSON Golden-File Citation Engine (Section 6)", () => {
  const FIVE_KNOWN_DOIS: RawSourceInput[] = [
    // 1. Single-author Humanities / Philosophy of Mind landmark DOI
    {
      id: "turing-1950",
      title: "Computing Machinery and Intelligence",
      authors: ["Alan M. Turing"],
      year: 1950,
      journal: "Mind",
      volume: "59",
      issue: "236",
      pages: "433-460",
      doi: "10.1093/mind/LIX.236.433",
    },
    // 2. Two-author Economics / Decision Science landmark DOI
    {
      id: "kahneman-1979",
      title: "Prospect Theory: An Analysis of Decision under Risk",
      authors: ["Daniel Kahneman", "Amos Tversky"],
      year: 1979,
      journal: "Econometrica",
      volume: "47",
      issue: "2",
      pages: "263-291",
      doi: "10.2307/1914185",
    },
    // 3. Three-author Biomedical / Genetics landmark DOI
    {
      id: "doudna-2012",
      title: "A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity",
      authors: ["Martin Jinek", "Jennifer A. Doudna", "Emmanuelle Charpentier"],
      year: 2012,
      journal: "Science",
      volume: "337",
      issue: "6096",
      pages: "816-821",
      doi: "10.1126/science.1225829",
    },
    // 4. Four-author Computer Vision conference paper DOI
    {
      id: "he-2016",
      title: "Deep Residual Learning for Image Recognition",
      authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
      year: 2016,
      journal: "IEEE Conference on Computer Vision and Pattern Recognition",
      pages: "770-778",
      doi: "10.1109/CVPR.2016.90",
    },
    // 5. Four-author Deep Learning preprint / conference DOI
    {
      id: "vaswani-2017",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"],
      year: 2017,
      journal: "Advances in Neural Information Processing Systems",
      volume: "30",
      pages: "5998-6008",
      doi: "10.48550/arXiv.1706.03762",
    },
  ];

  const TWO_KNOWN_WEB_PAGES: RawSourceInput[] = [
    // 6. Web page with named human authors
    {
      id: "pew-2023",
      title: "Teens, Social Media and Technology 2023",
      authors: ["Monica Anderson", "Michelle Faverio"],
      year: 2023,
      publisher: "Pew Research Center",
      url: "https://www.pewresearch.org/internet/2023/12/11/teens-social-media-and-technology-2023/",
    },
    // 7. Web page with verified institutional author
    {
      id: "who-2024",
      title: "Global Health Estimates: Leading Causes of Death and Disability",
      authors: ["World Health Organization"],
      year: 2024,
      publisher: "World Health Organization",
      url: "https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates",
    },
  ];

  const ALL_SEVEN_SOURCES = [...FIVE_KNOWN_DOIS, ...TWO_KNOWN_WEB_PAGES];

  it("verifies all 5 known DOIs and 2 known web pages into valid CSL-JSON items", () => {
    const { verified, excluded } = verifyAndDeduplicateSources(ALL_SEVEN_SOURCES);
    expect(excluded).toHaveLength(0);
    expect(verified).toHaveLength(7);
  });

  it("matches exact golden-file output for DOI 1 (Turing, 1950) across all styles", () => {
    const res = verifyAndConvertToCSL(FIVE_KNOWN_DOIS[0]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const csl = res.item;

    // In-text golden output
    expect(formatCSLInTextSingle(csl, "apa", 1)).toBe("(Turing, 1950)");
    expect(formatCSLInTextSingle(csl, "mla", 1)).toBe("(Turing)");
    expect(formatCSLInTextSingle(csl, "chicago", 1)).toBe("(Turing 1950)");
    expect(formatCSLInTextSingle(csl, "chicago-notes", 1)).toBe("[1]");
    expect(formatCSLInTextSingle(csl, "harvard", 1)).toBe("(Turing, 1950)");
    expect(formatCSLInTextSingle(csl, "ieee", 1)).toBe("[1]");
    expect(formatCSLInTextSingle(csl, "vancouver", 1)).toBe("(1)");

    // Bibliography golden output
    expect(formatCSLBibliographyEntry(csl, "apa", 1).markdownText).toBe(
      "Turing, A. M. (1950). Computing Machinery and Intelligence. *Mind*, *59*(236), 433-460. https://doi.org/10.1093/mind/LIX.236.433"
    );
    expect(formatCSLBibliographyEntry(csl, "mla", 1).markdownText).toBe(
      'Turing, Alan M. "Computing Machinery and Intelligence." *Mind*, vol. 59, no. 236, 1950, pp. 433-460. https://doi.org/10.1093/mind/LIX.236.433.'
    );
    expect(formatCSLBibliographyEntry(csl, "chicago", 1).markdownText).toBe(
      'Turing, Alan M. 1950. "Computing Machinery and Intelligence." *Mind* 59 (236): 433-460. https://doi.org/10.1093/mind/LIX.236.433.'
    );
    expect(formatCSLBibliographyEntry(csl, "chicago-notes", 1).markdownText).toBe(
      'Turing, Alan M. "Computing Machinery and Intelligence." *Mind* 59, no. 236 (1950): 433-460. https://doi.org/10.1093/mind/LIX.236.433.'
    );
    expect(formatCSLBibliographyEntry(csl, "harvard", 1).markdownText).toBe(
      "Turing, A.M. (1950) 'Computing Machinery and Intelligence', *Mind*, 59(236), pp. 433-460. doi:10.1093/mind/LIX.236.433."
    );
    expect(formatCSLBibliographyEntry(csl, "ieee", 1).markdownText).toBe(
      '[1] A. M. Turing, "Computing Machinery and Intelligence," *Mind*, vol. 59, no. 236, pp. 433-460, 1950, doi: 10.1093/mind/LIX.236.433.'
    );
    expect(formatCSLBibliographyEntry(csl, "vancouver", 1).markdownText).toBe(
      "1. Turing AM. Computing Machinery and Intelligence. Mind. 1950;59(236):433-460. doi:10.1093/mind/LIX.236.433"
    );
  });

  it("matches exact golden-file output for DOI 2 (Kahneman & Tversky, 1979) across all styles", () => {
    const res = verifyAndConvertToCSL(FIVE_KNOWN_DOIS[1]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const csl = res.item;

    expect(formatCSLInTextSingle(csl, "apa", 2)).toBe("(Kahneman & Tversky, 1979)");
    expect(formatCSLInTextSingle(csl, "mla", 2)).toBe("(Kahneman and Tversky)");
    expect(formatCSLInTextSingle(csl, "chicago", 2)).toBe("(Kahneman and Tversky 1979)");
    expect(formatCSLInTextSingle(csl, "harvard", 2)).toBe("(Kahneman and Tversky, 1979)");
    expect(formatCSLInTextSingle(csl, "ieee", 2)).toBe("[2]");
    expect(formatCSLInTextSingle(csl, "vancouver", 2)).toBe("(2)");

    expect(formatCSLBibliographyEntry(csl, "apa", 2).markdownText).toBe(
      "Kahneman, D., & Tversky, A. (1979). Prospect Theory: An Analysis of Decision under Risk. *Econometrica*, *47*(2), 263-291. https://doi.org/10.2307/1914185"
    );
    expect(formatCSLBibliographyEntry(csl, "mla", 2).markdownText).toBe(
      'Kahneman, Daniel, and Amos Tversky. "Prospect Theory: An Analysis of Decision under Risk." *Econometrica*, vol. 47, no. 2, 1979, pp. 263-291. https://doi.org/10.2307/1914185.'
    );
    expect(formatCSLBibliographyEntry(csl, "chicago", 2).markdownText).toBe(
      'Kahneman, Daniel, and Amos Tversky. 1979. "Prospect Theory: An Analysis of Decision under Risk." *Econometrica* 47 (2): 263-291. https://doi.org/10.2307/1914185.'
    );
    expect(formatCSLBibliographyEntry(csl, "harvard", 2).markdownText).toBe(
      "Kahneman, D. and Tversky, A. (1979) 'Prospect Theory: An Analysis of Decision under Risk', *Econometrica*, 47(2), pp. 263-291. doi:10.2307/1914185."
    );
    expect(formatCSLBibliographyEntry(csl, "ieee", 2).markdownText).toBe(
      '[2] D. Kahneman and A. Tversky, "Prospect Theory: An Analysis of Decision under Risk," *Econometrica*, vol. 47, no. 2, pp. 263-291, 1979, doi: 10.2307/1914185.'
    );
    expect(formatCSLBibliographyEntry(csl, "vancouver", 2).markdownText).toBe(
      "2. Kahneman D, Tversky A. Prospect Theory: An Analysis of Decision under Risk. Econometrica. 1979;47(2):263-291. doi:10.2307/1914185"
    );
  });

  it("matches exact golden-file output for DOI 3 (Jinek, Doudna, & Charpentier, 2012) across all styles", () => {
    const res = verifyAndConvertToCSL(FIVE_KNOWN_DOIS[2]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const csl = res.item;

    expect(formatCSLInTextSingle(csl, "apa", 3)).toBe("(Jinek et al., 2012)");
    expect(formatCSLInTextSingle(csl, "mla", 3)).toBe("(Jinek et al.)");
    expect(formatCSLInTextSingle(csl, "chicago", 3)).toBe("(Jinek et al. 2012)");
    expect(formatCSLInTextSingle(csl, "harvard", 3)).toBe("(Jinek et al., 2012)");

    expect(formatCSLBibliographyEntry(csl, "apa", 3).markdownText).toBe(
      "Jinek, M., Doudna, J. A., & Charpentier, E. (2012). A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity. *Science*, *337*(6096), 816-821. https://doi.org/10.1126/science.1225829"
    );
    expect(formatCSLBibliographyEntry(csl, "mla", 3).markdownText).toBe(
      'Jinek, Martin, et al. "A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity." *Science*, vol. 337, no. 6096, 2012, pp. 816-821. https://doi.org/10.1126/science.1225829.'
    );
    expect(formatCSLBibliographyEntry(csl, "chicago", 3).markdownText).toBe(
      'Jinek, Martin, Jennifer A. Doudna, and Emmanuelle Charpentier. 2012. "A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity." *Science* 337 (6096): 816-821. https://doi.org/10.1126/science.1225829.'
    );
  });

  it("matches exact golden-file output for DOI 4 (He et al., 2016) and DOI 5 (Vaswani et al., 2017)", () => {
    const resHe = verifyAndConvertToCSL(FIVE_KNOWN_DOIS[3]);
    const resVas = verifyAndConvertToCSL(FIVE_KNOWN_DOIS[4]);
    expect(resHe.ok && resVas.ok).toBe(true);
    if (!resHe.ok || !resVas.ok) return;

    expect(formatCSLBibliographyEntry(resHe.item, "apa", 4).markdownText).toBe(
      "He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep Residual Learning for Image Recognition. *IEEE Conference on Computer Vision and Pattern Recognition*, 770-778. https://doi.org/10.1109/CVPR.2016.90"
    );
    expect(formatCSLBibliographyEntry(resHe.item, "harvard", 4).markdownText).toBe(
      "He, K. et al. (2016) 'Deep Residual Learning for Image Recognition', *IEEE Conference on Computer Vision and Pattern Recognition*, pp. 770-778. doi:10.1109/CVPR.2016.90."
    );

    expect(formatCSLBibliographyEntry(resVas.item, "apa", 5).markdownText).toBe(
      "Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. *Advances in Neural Information Processing Systems*, *30*, 5998-6008. https://doi.org/10.48550/arXiv.1706.03762"
    );
    expect(formatCSLBibliographyEntry(resVas.item, "vancouver", 5).markdownText).toBe(
      "5. Vaswani A, Shazeer N, Parmar N, Uszkoreit J. Attention Is All You Need. Advances in Neural Information Processing Systems. 2017;30:5998-6008. doi:10.48550/arXiv.1706.03762"
    );
  });

  it("matches exact golden-file output for the 2 known web pages (human-authored and institutional)", () => {
    const resPew = verifyAndConvertToCSL(TWO_KNOWN_WEB_PAGES[0]);
    const resWho = verifyAndConvertToCSL(TWO_KNOWN_WEB_PAGES[1]);
    expect(resPew.ok && resWho.ok).toBe(true);
    if (!resPew.ok || !resWho.ok) return;

    // Web Page 1: Pew Research Center (human authors)
    expect(formatCSLInTextSingle(resPew.item, "apa", 6)).toBe("(Anderson & Faverio, 2023)");
    expect(formatCSLBibliographyEntry(resPew.item, "apa", 6).markdownText).toBe(
      "Anderson, M., & Faverio, M. (2023). Teens, Social Media and Technology 2023. *Pew Research Center*. https://www.pewresearch.org/internet/2023/12/11/teens-social-media-and-technology-2023/"
    );
    expect(formatCSLBibliographyEntry(resPew.item, "ieee", 6).markdownText).toBe(
      '[6] M. Anderson and M. Faverio, "Teens, Social Media and Technology 2023," *Pew Research Center*, 2023, [Online]. Available: https://www.pewresearch.org/internet/2023/12/11/teens-social-media-and-technology-2023/.'
    );

    // Web Page 2: World Health Organization (institutional author)
    expect(formatCSLInTextSingle(resWho.item, "apa", 7)).toBe("(World Health Organization, 2024)");
    expect(formatCSLBibliographyEntry(resWho.item, "apa", 7).markdownText).toBe(
      "World Health Organization. (2024). Global Health Estimates: Leading Causes of Death and Disability. *World Health Organization*. https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates"
    );
    expect(formatCSLBibliographyEntry(resWho.item, "harvard", 7).markdownText).toBe(
      "World Health Organization (2024) 'Global Health Estimates: Leading Causes of Death and Disability', *World Health Organization*. Available at: https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates."
    );
  });

  it("strictly rejects placeholder authors ('Contributors', 'Wikipedia Contributors', 'Unknown', 'Anonymous') and 'n.d.' dates", () => {
    const invalidInputs: RawSourceInput[] = [
      {
        title: "Artificial Intelligence Overview",
        authors: ["Wikipedia Contributors"],
        year: 2026,
        url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
      },
      {
        title: "Some Unattributed Blog Post",
        authors: ["Contributors"],
        year: 2025,
        url: "https://example.com/post",
      },
      {
        title: "Mystery Paper",
        authors: ["Unknown Author"],
        year: 2023,
      },
      {
        title: "Anonymous Commentary",
        authors: ["Anonymous"],
        year: 2022,
      },
      {
        title: "Valid Author But Missing Year",
        authors: ["Jane Doe"],
        year: "n.d.",
      },
      {
        title: "RETRACTED: Fraudulent Stem Cell Study",
        authors: ["John Fraud"],
        year: 2020,
        doi: "10.1000/retracted.1",
      },
      {
        title: "Paper With Crossref Retraction Notice",
        authors: ["Alice Researcher"],
        year: 2021,
        doi: "10.1000/retracted.2",
        crossrefUpdateTo: [{ type: "retraction", label: "Retraction" }],
      },
    ];

    const { verified, excluded } = verifyAndDeduplicateSources(invalidInputs);
    expect(verified).toHaveLength(0);
    expect(excluded).toHaveLength(7);

    expect(excluded[0].reason).toBe("author not verifiable");
    expect(excluded[1].reason).toBe("author not verifiable");
    expect(excluded[2].reason).toBe("author not verifiable");
    expect(excluded[3].reason).toBe("author not verifiable");
    expect(excluded[4].reason).toBe("publication year not verifiable");
    expect(excluded[5].reason).toBe("retracted");
    expect(excluded[6].reason).toBe("retracted");
  });

  it("enforces 1-to-1 bijection and orders APA alphabetically vs IEEE by first appearance", () => {
    const { verified } = verifyAndDeduplicateSources(FIVE_KNOWN_DOIS);
    // Prose cites source 5 (Vaswani) first, then source 1 (Turing), and does NOT cite sources 2, 3, 4
    const prose = "Self-attention mechanisms scale efficiently [5], building on foundational computability theory [1].";

    // APA: alphabetical order -> Turing (1950) is #1, Vaswani (2017) is #2; uncited 3 sources are excluded
    const apaResult = enforceCitationReferenceBijection(prose, verified, "apa");
    expect(apaResult.citedCSLItems).toHaveLength(2);
    expect(apaResult.uncitedCSLItems).toHaveLength(3);
    expect(apaResult.citedCSLItems[0].author[0].family).toBe("Turing");
    expect(apaResult.citedCSLItems[1].author[0].family).toBe("Vaswani");
    // In remapped prose, [5] (Vaswani) becomes [2] and [1] (Turing) stays [1]
    expect(apaResult.bodyProseWithCanonicalTokens).toBe(
      "Self-attention mechanisms scale efficiently [2], building on foundational computability theory [1]."
    );

    // IEEE: order of first appearance -> Vaswani (2017) is [1], Turing (1950) is [2]
    const ieeeResult = enforceCitationReferenceBijection(prose, verified, "ieee");
    expect(ieeeResult.citedCSLItems).toHaveLength(2);
    expect(ieeeResult.citedCSLItems[0].author[0].family).toBe("Vaswani");
    expect(ieeeResult.citedCSLItems[1].author[0].family).toBe("Turing");
    expect(ieeeResult.bodyProseWithCanonicalTokens).toBe(
      "Self-attention mechanisms scale efficiently [1], building on foundational computability theory [2]."
    );
    expect(ieeeResult.formattedReferences[0].plainText).toMatch(/^\[1\] A\. Vaswani/);
    expect(ieeeResult.formattedReferences[1].plainText).toMatch(/^\[2\] A\. M\. Turing/);
  });

  it("round-trips BibTeX and RIS export and import for cited sources", () => {
    const { verified } = verifyAndDeduplicateSources(FIVE_KNOWN_DOIS.slice(0, 2));
    const bibtex = exportCSLToBibTeX(verified);
    expect(bibtex).toContain("@article{turing1950computing,");
    expect(bibtex).toContain("doi = {10.1093/mind/LIX.236.433}");

    const parsedBib = parseReferenceImportText(bibtex);
    expect(parsedBib.imported).toHaveLength(2);
    expect(parsedBib.imported[0].DOI).toBe("10.1093/mind/LIX.236.433");

    const ris = exportCSLToRIS(verified);
    expect(ris).toContain("TY  - JOUR");
    expect(ris).toContain("DO  - 10.2307/1914185");

    const parsedRis = parseReferenceImportText(ris);
    expect(parsedRis.imported).toHaveLength(2);
    expect(parsedRis.imported[1].DOI).toBe("10.2307/1914185");
  });

  it("extracts structured metadata from HTML meta tags and JSON-LD while rejecting banned authors", () => {
    const html = `
      <html>
        <head>
          <meta name="citation_title" content="Climate Adaptation Policy in 2025" />
          <meta name="citation_author" content="Elena Rostova" />
          <meta name="citation_publication_date" content="2025-03-14" />
          <meta name="citation_journal_title" content="Nature Climate Change" />
          <meta name="citation_doi" content="10.1038/s41558-025-0001-x" />
        </head>
      </html>
    `;
    const meta = extractWebPageMetadataFromHtml(html, "https://nature.com/articles/s41558-025-0001-x");
    const check = verifyAndConvertToCSL(meta);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.item.author[0].family).toBe("Rostova");
      expect(check.item.issued["date-parts"][0][0]).toBe(2025);
      expect(check.item.DOI).toBe("10.1038/s41558-025-0001-x");
    }
  });
});

