import { describe, expect, it } from "vitest";
import { newsDescriptionText } from "../webSearchEngine.ts";

describe("newsDescriptionText", () => {
  it("decodes entity-encoded HTML and gives no snippet when it only repeats the headline and publisher", () => {
    const raw = '&lt;a href="https://news.google.com/rss/articles/CBMi?oc=5" target="_blank"&gt;Effects of dance mindfulness on social anxiety&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Nature&lt;/font&gt;';
    const text = newsDescriptionText(raw, "Effects of dance mindfulness on social anxiety", "Nature");
    expect(text).toBe("");
  });

  it("keeps a real description, as text without tags", () => {
    const raw = "&lt;p&gt;A trial of 400 pupils found that an eight-week mindfulness course reduced reported test anxiety compared with usual lessons.&lt;/p&gt;";
    const text = newsDescriptionText(raw, "Mindfulness course trial", "Example News");
    expect(text).toMatch(/^A trial of 400 pupils found/);
    expect(text).not.toMatch(/<|&lt;/);
  });
});
