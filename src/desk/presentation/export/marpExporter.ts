import type { PresentationProjectData, PresentationSlide } from "../types";

export interface MarpExportOptions {
  theme?: "default" | "gaia" | "uncover";
  backgroundColor?: string;
  color?: string;
  paginate?: boolean;
  header?: string;
  footer?: string;
}

export function generateMarpMarkdown(
  deckData: PresentationProjectData,
  options: MarpExportOptions = {}
): string {
  const {
    theme = "default",
    backgroundColor = "#0f172a",
    color = "#f8fafc",
    paginate = true,
    header = deckData.title,
    footer = "Scholar Core Academic Research Deck",
  } = options;

  let md = `---
marp: true
theme: ${theme}
paginate: ${paginate}
backgroundColor: '${backgroundColor}'
color: '${color}'
header: '${header.replace(/'/g, "\\'")}'
footer: '${footer.replace(/'/g, "\\'")}'
style: |
  section {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 40px;
    font-size: 24px;
  }
  h1 {
    color: #38bdf8;
    font-size: 36px;
    margin-bottom: 0.3em;
  }
  h2 {
    color: #94a3b8;
    font-size: 26px;
  }
  h3 {
    color: #38bdf8;
    font-size: 20px;
  }
  li {
    margin-bottom: 0.4em;
  }
---

<!-- _class: lead -->
<!-- _paginate: false -->
<!-- _header: "" -->
<!-- _footer: "" -->

# ${deckData.title}

### ${deckData.targetAudience} · ${deckData.durationMinutes} Minutes Talk

**Core Insight:** ${deckData.coreInsight || "Evidence-grounded scholarly analysis."}

**Presenter:** Scholar Core Research Suite
`;

  deckData.slides.forEach((slide: PresentationSlide) => {
    md += `
---

# ${slide.title}
${slide.subtitle ? `## ${slide.subtitle}\n` : ""}

${slide.keyPoints.map((k) => `- ${k}`).join("\n")}

${slide.visualFocus ? `\n> 🎯 **Visual Focus:** ${slide.visualFocus}\n` : ""}

<!--
Speaker Notes (~${slide.targetDurationSeconds}s):
${slide.speakerNotes || "Present key findings clearly and concisely."}
-->
`;
  });

  return md;
}

export function generateHtmlPresentation(deckData: PresentationProjectData): string {
  const slidesHtml = deckData.slides
    .map(
      (s, idx) => `
    <section class="slide" id="slide-${idx + 1}">
      <div class="slide-header">
        <span class="badge">${deckData.title}</span>
        <span class="slide-number">Slide ${s.slideNumber} / ${deckData.slides.length}</span>
      </div>
      <div class="slide-content">
        <h1>${s.title}</h1>
        ${s.subtitle ? `<h2>${s.subtitle}</h2>` : ""}
        <ul class="key-points">
          ${s.keyPoints.map((pt) => `<li>${pt}</li>`).join("")}
        </ul>
      </div>
      <div class="slide-footer">
        <span>⏱️ Target: ${s.targetDurationSeconds}s</span>
        <span class="visual-focus">🎯 ${s.visualFocus}</span>
      </div>
      <div class="speaker-notes" style="display:none;">${s.speakerNotes}</div>
    </section>
  `
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${deckData.title} - Scholar Presentation</title>
  <style>
    :root {
      --bg: #0b0f19;
      --surface: #111827;
      --accent: #38bdf8;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    .slide-container {
      width: 90vw;
      max-width: 1280px;
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      position: relative;
    }
    .slide-header {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: var(--muted);
    }
    .badge {
      color: var(--accent);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1 {
      font-size: 38px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 20px;
      font-weight: 500;
      color: var(--accent);
      margin-bottom: 24px;
    }
    .key-points {
      list-style-type: none;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .key-points li {
      font-size: 20px;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .key-points li::before {
      content: "•";
      color: var(--accent);
      font-size: 28px;
      line-height: 0;
    }
    .slide-footer {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--muted);
      border-top: 1px solid #334155;
      padding-top: 16px;
    }
    .nav-controls {
      position: fixed;
      bottom: 24px;
      display: flex;
      gap: 12px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      padding: 8px 16px;
      border-radius: 9999px;
      border: 1px solid #334155;
    }
    button {
      background: transparent;
      border: 1px solid #475569;
      color: #f8fafc;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover {
      background: #334155;
    }
  </style>
</head>
<body>
  <div class="slide-container" id="active-slide">
    ${slidesHtml}
  </div>

  <div class="nav-controls">
    <button onclick="prevSlide()">← Prev</button>
    <span id="slide-indicator" style="align-self:center; font-size:13px; font-weight:600;">Slide 1 / ${deckData.slides.length}</span>
    <button onclick="nextSlide()">Next →</button>
  </div>

  <script>
    let currentIdx = 0;
    const slides = document.querySelectorAll('.slide');
    const indicator = document.getElementById('slide-indicator');

    function showSlide(idx) {
      slides.forEach((s, i) => {
        s.style.display = i === idx ? 'flex' : 'none';
        s.style.flexDirection = 'column';
        s.style.justifyContent = 'space-between';
        s.style.height = '100%';
      });
      indicator.textContent = 'Slide ' + (idx + 1) + ' / ' + slides.length;
    }

    function prevSlide() {
      if (currentIdx > 0) {
        currentIdx--;
        showSlide(currentIdx);
      }
    }

    function nextSlide() {
      if (currentIdx < slides.length - 1) {
        currentIdx++;
        showSlide(currentIdx);
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    });

    showSlide(0);
  </script>
</body>
</html>`;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
