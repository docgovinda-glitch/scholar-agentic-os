import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, ChevronRight, ChevronsRight, Sparkles, Lightbulb, Check, AlertTriangle, Send } from 'lucide-react';
import type { SlideDeck, SlideCard } from '../types/slides';
import ScholarCoreLogo from '../../../components/ScholarCoreLogo';

export interface AskScholarPresentationDrawerProps {
  deck: SlideDeck;
  onUpdateDeck?: (updated: SlideDeck) => void;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    type?: 'audit' | 'headlines' | 'pacing' | 'layout';
    items?: string[];
  };
}

export const SUGGESTED_PROMPT_PILLS = [
  'Improve action headlines',
  'Audit 6x6 bullet rules',
  'Check visual pacing',
  'Suggest image ideas',
];

export default function AskScholarPresentationDrawer({
  deck,
  onUpdateDeck,
  isOpen,
  onClose,
  className = '',
}: AskScholarPresentationDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const generatePresentationAdvice = (query: string): string => {
    const q = query.toLowerCase();
    const slideCount = deck.slides?.length || 0;
    const activeSlide = deck.slides?.[deck.activeSlideIndex || 0];

    if (q.includes('headline') || q.includes('action') || q.includes('stronger')) {
      const suggestions = deck.slides.map((s, idx) => {
        const headline = s.actionHeadline;
        // Transform passive or descriptive phrases into conclusive action claims
        let improved = headline;
        if (!headline || headline.startsWith('Slide') || headline.length < 15) {
          improved = `Empirical Synthesis ${idx + 1}: Key Mechanisms Driving Observed Variance`;
        } else if (headline.includes('Introduction') || headline.includes('Overview')) {
          improved = `Core Analytical Framing: Decoupling Strategic Incentives from Conventional Norms`;
        } else if (headline.includes('Method') || headline.includes('Framework')) {
          improved = `Methodological Rigor: Triangulating Multi-Source Observational Datasets`;
        } else if (headline.includes('Result') || headline.includes('Finding')) {
          improved = `Empirical Validation: Measured Interventions Yield Statistically Significant Lift`;
        } else if (!/[.:]/.test(headline)) {
          improved = `${headline}: Strategic Trade-Offs and Long-Term Horizon Impacts`;
        }
        return `• **Slide ${idx + 1}**: "${improved}"`;
      });

      return `Here are proposed punchy, claim-driven action headlines for your deck:\n\n${suggestions.slice(0, 5).join('\n\n')}\n\n*Rule of thumb: Every slide title should state the single conclusion you want your audience to remember.*`;
    }

    if (q.includes('6x6') || q.includes('bullet') || q.includes('audit')) {
      let totalViolations = 0;
      const reportLines: string[] = [];

      deck.slides.forEach((s, idx) => {
        const bulletBlock = s.blocks.find((b) => b.type === 'bullet-list') as any;
        const bullets: string[] = bulletBlock?.items || [];

        const bulletCountViolated = bullets.length > 6;
        const wordCountViolations = bullets.filter((b) => b.trim().split(/\s+/).length > 6);

        if (bulletCountViolated || wordCountViolations.length > 0) {
          totalViolations++;
          reportLines.push(
            `• **Slide ${idx + 1}** (${s.actionHeadline.slice(0, 30)}...): ` +
              (bulletCountViolated ? `exceeds 6 bullets (${bullets.length} total); ` : '') +
              (wordCountViolations.length > 0
                ? `${wordCountViolations.length} bullets exceed 6 words each.`
                : '')
          );
        }
      });

      if (totalViolations === 0) {
        return `✅ **6x6 Rule Audit Passed!**\n\nAll ${slideCount} slides strictly adhere to the collegiate 6x6 rule: no slide exceeds 6 bullets, and all bullets remain crisp (≤ 6 words). Your presentation will maintain exceptional audience cognitive focus.`;
      }

      return `⚠️ **6x6 Rule Audit: ${totalViolations} slide(s) require tightening:**\n\n${reportLines.join('\n')}\n\n*Recommendation: Condense compound clauses and split multi-layered arguments across adjacent slides.*`;
    }

    if (q.includes('pacing') || q.includes('visual') || q.includes('flow')) {
      const layouts = deck.slides.map((s) => s.layoutType || 'bullets');
      const bulletCount = layouts.filter((l) => l === 'bullets').length;
      const visualCount = layouts.filter((l) => l !== 'bullets').length;

      return `📊 **Visual Pacing Assessment (${slideCount} Slides)**:\n\n` +
        `• **Text-Heavy / Bullets**: ${bulletCount} slides\n` +
        `• **Visual / Metrics / Split**: ${visualCount} slides\n\n` +
        (bulletCount > visualCount * 2
          ? `*Pacing Alert*: Your deck is leaning heavily on sequential bullet lists. Consider switching Slide 2 or 3 to **Split Image + Text** or **Big Metric Focus** to reset visual rhythm.`
          : `*Excellent Rhythm*: You have a balanced cadence of conceptual lists and visual callouts, keeping audience retention high across a 10-minute presentation.`);
    }

    if (q.includes('image') || q.includes('layout') || q.includes('suggest') || q.includes('recommend')) {
      const activeIdx = (deck.activeSlideIndex || 0) + 1;
      const currentLayout = activeSlide?.layoutType || 'bullets';

      return `💡 **Layout & Image Recommendations for Slide ${activeIdx}**:\n\n` +
        `• Current Layout: \`${currentLayout}\`\n` +
        `• **Recommendation 1**: Switch to **Split Image + Text** with 50% image dropzone for visual grounding.\n` +
        `• **Recommendation 2**: Switch to **Big Metric Focus** for quantitative proof points.\n` +
        `• **Recommendation 3**: Use **2-Column Comparison** to contrast baseline vs proposed solutions.`;
    }

    // Default scholarly advice
    return `Regarding "${query}": In collegiate presentation design, clarity stems from strict constraints. Anchor each slide with a declarative action headline, limit body copy to 3–4 punchy evidentiary takeaways, and use high-contrast signal colors exclusively for key focal points.`;
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query || isTyping) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Realistic brief assistant response time
    setTimeout(() => {
      const responseText = generatePresentationAdvice(query);
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <aside
      className={`w-full sm:w-80 lg:w-96 fixed sm:relative inset-y-0 right-0 flex-shrink-0 border-l border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] flex flex-col h-full max-h-[100dvh] shadow-lg z-30 sm:z-20 transition-all duration-300 select-text ${className}`}
      data-testid="ask-scholar-drawer"
      aria-label="Ask Scholar Presentation Copilot"
    >
      {/* Drawer Header */}
      <div className="p-4 sm:p-5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 dark:bg-amber-400/15 border border-amber-500/25 dark:border-amber-400/25 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
            <Lightbulb className="w-4 h-4 stroke-[2.1]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white truncate">
              Ask Scholar
            </h3>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold truncate">
              Slide &amp; Outline Advisor
            </p>
          </div>
        </div>

        {/* Close Button ✕ */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Ask Scholar drawer"
          title="Close Ask Scholar"
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0 font-medium"
        >
          ✕
        </button>
      </div>

      {/* Drawer Body: Chat History & Suggested Prompt Pills */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1">
              <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Live Presentation Copilot
              </span>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                I can critique slide headlines, audit your deck against the 6x6 bullet rule, and recommend layouts tailored to your topic.
              </p>
            </div>

            {/* Suggested Action Pills */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block">
                Suggested Actions
              </span>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_PROMPT_PILLS.map((pill, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(pill)}
                    data-testid={`ask-scholar-pill-${idx}`}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all text-left text-xs cursor-pointer shadow-2xs group"
                  >
                    <span className="font-medium">{pill}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider mb-1 text-neutral-400">
                  {msg.role === 'user' ? 'You' : 'Scholar Advisor'}
                </span>
                <div
                  className={`text-xs p-3.5 rounded-2xl max-w-[92%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-tr-none font-medium'
                      : 'bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 text-neutral-800 dark:text-neutral-200 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex flex-col items-start">
                <span className="text-[10px] uppercase font-bold tracking-wider mb-1 text-neutral-400">
                  Scholar Advisor
                </span>
                <div className="bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 rounded-2xl rounded-tl-none p-3 flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Suggested Follow-up Chips when thread has active messages */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {SUGGESTED_PROMPT_PILLS.map((pill, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(pill)}
              className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {pill}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Dock Input Pill */}
      <div className="border-t border-neutral-200/60 dark:border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white dark:bg-[#1C1C1E] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isTyping}
            placeholder="Ask Scholar for presentation advice..."
            aria-label="Ask Scholar for presentation advice"
            className="w-full rounded-full border border-neutral-200/80 bg-neutral-50 pl-4 pr-11 py-2.5 text-xs sm:text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all dark:bg-[#171717] dark:border-white/10 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            aria-label="Send message"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}
