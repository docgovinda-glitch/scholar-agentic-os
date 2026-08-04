/**
 * Ask tab — chat interface for questions and advice (docs 23 §5.3).
 * Real-time chat with Scholar OS assistant for sourcing, synthesis, and review help.
 * Phase 4.6 implementation — base structure only.
 */

import { useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AskViewProps {
  messages?: ChatMessage[];
  onSendMessage?: (text: string) => void;
  isLoading?: boolean;
  onBack: () => void;
}

export default function AskView({
  messages = [],
  onSendMessage,
  isLoading = false,
  onBack,
}: AskViewProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage?.(input);
      setInput("");
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="pb-2 border-b border-[color:var(--color-border-subtle)]">
        <h2 className="text-sm font-serif font-bold text-[#F1F5F9]">Scholar OS Assistant</h2>
        <p className="text-xs text-[#64748B] mt-1">Ask questions about sourcing and synthesis</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="text-2xl">💬</div>
            <p className="text-[#64748B] text-sm">No messages yet</p>
            <p className="text-[#475569] text-xs max-w-sm">
              Ask about sourcing strategies, synthesis patterns, or how to refine your work.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[color:var(--color-luminous-blue-dim)] text-white"
                    : "bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-[#E2E8F0]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] px-3 py-2 rounded-lg">
              <div className="flex gap-1">
                <span className="text-[#94A3B8] text-xs">●</span>
                <span className="text-[#94A3B8] text-xs">●</span>
                <span className="text-[#94A3B8] text-xs">●</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="space-y-2 border-t border-[color:var(--color-border-subtle)] pt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-xs rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-[#E2E8F0] placeholder-[#64748B] focus:outline-none focus:border-[color:var(--color-luminous-blue-dim)] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs font-mono uppercase tracking-wide disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-[10px] text-[#64748B] font-mono uppercase tracking-wide text-center py-2"
      >
        ← Back
      </button>
    </div>
  );
}
