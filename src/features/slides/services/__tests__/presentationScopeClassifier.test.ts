import { describe, it, expect } from 'vitest';
import {
  classifyPresentationScope,
  stripLineTags,
} from '../presentationScopeClassifier';

describe('presentationScopeClassifier', () => {
  it('strips line markers like [L001] and [L012-L015] cleanly', () => {
    expect(stripLineTags('[L001] Why does Zappos offer $2,000 to quit?')).toBe(
      'Why does Zappos offer $2,000 to quit?'
    );
    expect(stripLineTags('[L012-L015] "Schein\'s three levels of culture"')).toBe(
      "Schein's three levels of culture"
    );
  });

  it('classifies Zappos and Schein organizational culture briefs into plain-English green and yellow scope boundaries', () => {
    const scope = classifyPresentationScope(
      'MN6094NI Developing Breakthrough Leadership Week 2 Tutorial.pptx.pdf',
      'Why Zappos Pays New Hires $2,000 to Quit'
    );

    // Green Card: What This Presentation Covers (5 Key Points)
    expect(scope.covers).toHaveLength(5);
    expect(scope.covers[0]).toBe(
      'The real strategic reason Zappos pays people to leave during training.'
    );
    expect(scope.covers[1]).toBe(
      "How Schein's 3 levels explain visible perks vs. invisible company values."
    );
    expect(scope.covers[2]).toBe(
      'Why changing dress codes or office furniture does not change organizational culture.'
    );
    expect(scope.covers[3]).toBe(
      'Which cultural layer leaders should target first to make changes stick.'
    );
    expect(scope.covers[4]).toBe(
      "Actionable questions to ask in an interview to uncover a company's real culture."
    );

    // Yellow Card: What to Avoid / Out of Scope (4 Rules)
    expect(scope.avoids).toHaveLength(4);
    expect(scope.avoids[0]).toBe(
      'Do not include classroom instructions, team pairings, or tutorial time limits.'
    );
    expect(scope.avoids[1]).toBe(
      'Avoid long paragraphs of text—enforce clean 6x6 bullet phrasing.'
    );
    expect(scope.avoids[2]).toBe(
      'Do not treat superficial perks (free coffee, ping pong) as real company culture.'
    );
    expect(scope.avoids[3]).toBe(
      "Avoid generic business cliches without theoretical grounding in Schein's model."
    );
  });

  it('a bare topic gets no stand-in points: the presenter writes their own', () => {
    const scope = classifyPresentationScope('', 'Autonomous Multi-Agent Consensus');
    expect(scope.covers).toEqual([]);
    expect(scope.summaryBanner).toMatch(/Add the points you want to make/);
    expect(scope.avoids.length).toBeGreaterThanOrEqual(3);
    scope.avoids.forEach((item) => expect(item).not.toMatch(/\[L\d+/));
  });

  it("the author's own questions become the points, without line tags", () => {
    const scope = classifyPresentationScope('', 'T', ['[L001] Why do decoders fall behind?', '[L002] What does pipelining change?']);
    expect(scope.covers).toEqual(['Why do decoders fall behind?', 'What does pipelining change?']);
  });
});
