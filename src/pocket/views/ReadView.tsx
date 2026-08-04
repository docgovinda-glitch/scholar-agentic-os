/**
 * Read tab — document review and annotation (docs 23 §5.2).
 * Shows document content with inline comment threads for collaborative review.
 * One section at a time for thumb-zone optimization.
 */

import { useState } from "react";
import type { Block } from "../../desk/types";

export interface DocumentReview {
  id: string;
  title: string;
  authors: string[];
  blocks: Block[];
}

export interface Comment {
  id: string;
  blockId: string;
  author: string;
  text: string;
  timestamp: Date;
  resolved: boolean;
}

interface ReadViewProps {
  document: DocumentReview;
  comments?: Comment[];
  onAddComment?: (blockId: string, text: string) => void;
  onResolveComment?: (commentId: string) => void;
  onBack: () => void;
}

export default function ReadView({
  document,
  comments = [],
  onAddComment,
  onResolveComment,
  onBack,
}: ReadViewProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [showComments, setShowComments] = useState(true);
  const [newComment, setNewComment] = useState("");

  const currentBlock = document.blocks[currentBlockIndex];
  const blockComments = comments.filter((c) => c.blockId === currentBlock?.id);
  const isLast = currentBlockIndex === document.blocks.length - 1;
  const isFirst = currentBlockIndex === 0;

  const handleAddComment = () => {
    if (newComment.trim() && currentBlock) {
      onAddComment?.(currentBlock.id, newComment);
      setNewComment("");
    }
  };

  const handleNext = () => {
    if (!isLast) {
      setCurrentBlockIndex(currentBlockIndex + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentBlockIndex(currentBlockIndex - 1);
    }
  };

  if (!currentBlock) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-2xl">📖</div>
        <p className="text-[#F1F5F9] text-sm">No document loaded</p>
        <button
          onClick={onBack}
          className="mt-4 text-[color:var(--color-luminous-blue)] text-xs font-mono uppercase tracking-wide"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Document Header */}
      <div className="space-y-2 pb-2 border-b border-[color:var(--color-border-subtle)]">
        <h1 className="text-sm font-serif font-bold text-[#F1F5F9]">{document.title}</h1>
        <p className="text-xs text-[#94A3B8]">{document.authors.join(", ")}</p>
        <div className="flex gap-2 text-[10px] text-[#64748B]">
          <span>Section {currentBlockIndex + 1} of {document.blocks.length}</span>
          {blockComments.length > 0 && (
            <span className="text-[#FBBF24]">· {blockComments.length} comment{blockComments.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Block Content */}
        <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-4">
          {currentBlock.kind === "heading1" && (
            <h2 className="text-lg font-serif font-bold text-[#F1F5F9]">{currentBlock.text}</h2>
          )}
          {currentBlock.kind === "heading2" && (
            <h3 className="text-base font-serif font-bold text-[#F1F5F9]">{currentBlock.text}</h3>
          )}
          {currentBlock.kind === "heading3" && (
            <h4 className="text-sm font-serif font-bold text-[#F1F5F9]">{currentBlock.text}</h4>
          )}
          {currentBlock.kind === "paragraph" && (
            <p className="text-sm leading-relaxed text-[#E2E8F0]">{currentBlock.text}</p>
          )}
          {currentBlock.kind === "quote" && (
            <blockquote className="text-sm italic border-l-2 border-[color:var(--color-luminous-blue-dim)] pl-3 text-[#94A3B8]">
              {currentBlock.text}
            </blockquote>
          )}
          {currentBlock.kind === "list-item" && (
            <li className="text-sm text-[#E2E8F0]">• {currentBlock.text}</li>
          )}
        </div>

        {/* Comments */}
        {showComments && blockComments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wide text-[#94A3B8]">Comments</p>
            {blockComments.map((comment) => (
              <div
                key={comment.id}
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  comment.resolved
                    ? "border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)]/50 opacity-60"
                    : "border-[#FBBF24] bg-[#FBBF24]/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">{comment.author}</span>
                  {!comment.resolved && (
                    <button
                      onClick={() => onResolveComment?.(comment.id)}
                      className="text-[#64748B] hover:text-[#86EFAC] text-[10px]"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
                <p className="text-[#E2E8F0]">{comment.text}</p>
                {comment.resolved && (
                  <p className="text-[#64748B] text-[10px]">✓ Resolved</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Comment */}
      <div className="space-y-2 border-t border-[color:var(--color-border-subtle)] pt-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="w-full px-3 py-2 text-xs rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-[#E2E8F0] placeholder-[#64748B] focus:outline-none focus:border-[color:var(--color-luminous-blue-dim)]"
        />
        {newComment.trim() && (
          <button
            onClick={handleAddComment}
            className="w-full py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs font-mono uppercase tracking-wide"
          >
            Post Comment
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-2 border-t border-[color:var(--color-border-subtle)] pt-4">
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[#94A3B8] text-xs font-mono uppercase tracking-wide disabled:opacity-50"
        >
          ← Prev
        </button>
        <button
          onClick={onBack}
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--color-luminous-blue)] text-xs font-mono uppercase tracking-wide"
        >
          Done
        </button>
        <button
          onClick={handleNext}
          disabled={isLast}
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[#94A3B8] text-xs font-mono uppercase tracking-wide disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
