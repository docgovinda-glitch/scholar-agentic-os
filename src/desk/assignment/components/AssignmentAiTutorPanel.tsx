import React, { useState, useRef, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import WordCountTracker from "./WordCountTracker";

const QUICK_PROMPTS = [
  "Does this draft answer the question?",
  "Why is this argument weak?",
  "Give me a strong counterargument",
  "Make this paragraph more analytical",
  "Check this against my rubric",
  "Reduce this section by 100 words",
  "Check my citations & consistency",
  "Explain this key theoretical concept",
];

export default function AssignmentAiTutorPanel({ className = "" }: { className?: string }) {
  const { tutorMessages, sendTutorMessage, isTutorReplying, academicLevel, currentStage } =
    useAssignmentWorkspace();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [tutorMessages, isTutorReplying]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTutorReplying) return;
    sendTutorMessage(inputText);
    setInputText("");
  };

  const handleChipClick = (prompt: string) => {
    if (isTutorReplying) return;
    sendTutorMessage(prompt);
  };

  return (
    <aside
      className={`flex flex-col h-full bg-[color:var(--surface-canvas)] border-l border-[color:var(--border-subtle)] ${className}`}
    >
      {/* Tutor Header */}
      <div className="p-4 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] flex items-center justify-center text-base shadow-xs">
            🎓
          </div>
          <div>
            <h3 className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              Academic Thinking & Writing Tutor
            </h3>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {academicLevel === "postgraduate" ? "Postgraduate Synthesis & Critique Mode" : "Undergraduate Guidance Mode"}
            </p>
          </div>
        </div>
      </div>

      {/* Embedded Live Word Count Meter */}
      <div className="p-3 border-b border-[color:var(--border-subtle)]">
        <WordCountTracker />
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tutorMessages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${
                  isUser
                    ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-br-xs"
                    : "bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] rounded-bl-xs shadow-xs"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.actionableSuggestion && (
                  <div className="mt-2.5 pt-2 border-t border-[color:var(--border-subtle)] text-[11px]">
                    <span className="font-bold text-[color:var(--accent)] block mb-1">
                      💡 Suggested Improvement:
                    </span>
                    <p className="italic text-[color:var(--text-secondary)]">
                      {msg.actionableSuggestion.suggestedText}
                    </p>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-[color:var(--text-muted)] mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isTutorReplying && (
          <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)] p-2">
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce [animation-delay:0.4s]" />
            <span>Tutor analyzing academic perspective…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Contextual Prompt Chips */}
      <div className="p-3 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-2">
          Suggested Academic Queries:
        </span>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isTutorReplying}
              onClick={() => handleChipClick(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] transition-colors cursor-pointer text-left truncate max-w-full"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask your Academic Tutor anything..."
            disabled={isTutorReplying}
            className="flex-1 bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isTutorReplying}
            className="px-3 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
          >
            Ask
          </button>
        </div>
      </form>
    </aside>
  );
}
