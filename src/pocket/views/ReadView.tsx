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
        <p className="text-[color:var(--text-primary)] text-sm">No document loaded</p>
        <button
          onClick={onBack}
          className="mt-4 text-[color:var(--color-luminous-blue)] text-xs"
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
        <h1 className="text-sm font-serif font-bold text-[color:var(--text-primary)]">{document.title}</h1>
        <p className="text-xs text-[color:var(--text-secondary)]">{document.authors.join(", ")}</p>
        <div className="flex gap-2 text-[10px] text-[color:var(--text-muted)]">
          <span>Section {currentBlockIndex + 1} of {document.blocks.length}</span>
          {blockComments.length > 0 && (
            <span className="text-[color:var(--state-warning)]">· {blockComments.length} comment{blockComments.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Block Content */}
        <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-4">
          {currentBlock.kind === "heading1" && (
            <h2 className="text-lg font-serif font-bold text-[color:var(--text-primary)]">{currentBlock.text}</h2>
          )}
          {currentBlock.kind === "heading2" && (
            <h3 className="text-base font-serif font-bold text-[color:var(--text-primary)]">{currentBlock.text}</h3>
          )}
          {currentBlock.kind === "heading3" && (
            <h4 className="text-sm font-serif font-bold text-[color:var(--text-primary)]">{currentBlock.text}</h4>
          )}
          {currentBlock.kind === "paragraph" && (
            <p className="text-sm leading-relaxed text-[color:var(--text-primary)]">{currentBlock.text}</p>
          )}
          {currentBlock.kind === "quote" && (
            <blockquote className="text-sm italic border-l-2 border-[color:var(--color-luminous-blue-dim)] pl-3 text-[color:var(--text-secondary)]">
              {currentBlock.text}
            </blockquote>
          )}
          {currentBlock.kind === "list-item" && (
            <li className="text-sm text-[color:var(--text-primary)]">• {currentBlock.text}</li>
          )}
        </div>

        {/* Comments */}
        {showComments && blockComments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[color:var(--text-secondary)]">Comments</p>
            {blockComments.map((comment) => (
              <div
                key={comment.id}
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  comment.resolved
                    ? "border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)]/50 opacity-60"
                    : "border-[color:var(--state-warning)] bg-[color:var(--state-warning)]/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--text-secondary)]">{comment.author}</span>
                  {!comment.resolved && (
                    <button
                      onClick={() => onResolveComment?.(comment.id)}
                      className="text-[color:var(--text-muted)] hover:text-[color:var(--state-success)] text-[10px]"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
                <p className="text-[color:var(--text-primary)]">{comment.text}</p>
                {comment.resolved && (
                  <p className="text-[color:var(--text-muted)] text-[10px]">✓ Resolved</p>
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
          className="w-full px-3 py-2 text-xs rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none focus:border-[color:var(--color-luminous-blue-dim)]"
        />
        {newComment.trim() && (
          <button
            onClick={handleAddComment}
            className="w-full py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs"
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
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)] text-xs disabled:opacity-50"
        >
          ← Prev
        </button>
        <button
          onClick={onBack}
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--color-luminous-blue)] text-xs"
        >
          Done
        </button>
        <button
          onClick={handleNext}
          disabled={isLast}
          className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)] text-xs disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
