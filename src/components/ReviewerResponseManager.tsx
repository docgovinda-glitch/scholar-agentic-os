import React, { useState, useMemo } from "react";
import { PaperProject } from "../types";
import { ReviewerComment, ResponseDraft } from "../types/submissionTypes";
import { GlassmorphicCard, ProgressBar, StatusIndicator } from "./SciFiComponents";
import { Plus, Trash2, Edit2, Download, Copy, Eye, AlertCircle, CheckCircle2 } from "lucide-react";

interface ReviewerResponseManagerProps {
  project: PaperProject;
  onSaveDraft?: (draft: ResponseDraft) => void;
}

export function ReviewerResponseManager({
  project,
  onSaveDraft
}: ReviewerResponseManagerProps) {
  const [reviewerComments, setReviewerComments] = useState<ReviewerComment[]>(
    (project.submissionPack as any)?.reviewerComments || []
  );

  const [responseDraft, setResponseDraft] = useState<ResponseDraft>(
    (project.submissionPack as any)?.responseDraft || {
      id: Math.random().toString(36).substr(2, 9),
      journalName: project.targetJournal?.name || "",
      submissionId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      overallResponse: "",
      responses: [],
      status: "draft"
    }
  );

  const [showCommentForm, setShowCommentForm] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"comments" | "responses" | "preview">("comments");
  const [copied, setCopied] = useState(false);

  const [commentForm, setCommentForm] = useState<Partial<ReviewerComment>>({
    reviewer: "",
    date: new Date().toISOString().split("T")[0],
    section: "",
    comment: "",
    severity: "minor"
  });

  // Initialize responses if not present
  const ensureResponses = () => {
    const existing = responseDraft.responses || [];
    const reviewerIndices = new Set(existing.map(r => r.reviewerIndex));
    const newResponses = reviewerComments
      .map((comment, idx) => {
        if (!reviewerIndices.has(idx)) {
          return {
            reviewerIndex: idx,
            reviewer: comment.reviewer,
            pointByPointResponse: ""
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    if (newResponses.length > 0) {
      setResponseDraft(prev => ({
        ...prev,
        responses: [...existing, ...newResponses],
        updatedAt: new Date().toISOString()
      }));
    }
  };

  React.useEffect(() => {
    if (reviewerComments.length > 0 && responseDraft.responses.length === 0) {
      ensureResponses();
    }
  }, [reviewerComments]);

  // Statistics
  const stats = useMemo(() => {
    const totalComments = reviewerComments.length;
    const majorCount = reviewerComments.filter(c => c.severity === "major").length;
    const minorCount = reviewerComments.filter(c => c.severity === "minor").length;
    const respondedCount = responseDraft.responses.filter(r => r.pointByPointResponse.trim().length > 0).length;
    const responseRate = totalComments > 0 ? Math.round((respondedCount / totalComments) * 100) : 0;

    return { totalComments, majorCount, minorCount, respondedCount, responseRate };
  }, [reviewerComments, responseDraft]);

  // Handle comment submission
  const handleCommentSubmit = () => {
    if (!commentForm.reviewer || !commentForm.comment) {
      alert("Please fill in reviewer name and comment");
      return;
    }

    if (editingCommentId) {
      setReviewerComments(prev =>
        prev.map(c => c.id === editingCommentId ? { ...c, ...commentForm } as ReviewerComment : c)
      );
      setEditingCommentId(null);
    } else {
      const newComment: ReviewerComment = {
        id: Math.random().toString(36).substr(2, 9),
        reviewer: commentForm.reviewer as string,
        date: commentForm.date as string,
        section: commentForm.section,
        comment: commentForm.comment as string,
        severity: commentForm.severity as "minor" | "major"
      };
      setReviewerComments(prev => [...prev, newComment]);
    }

    setCommentForm({
      reviewer: "",
      date: new Date().toISOString().split("T")[0],
      section: "",
      comment: "",
      severity: "minor"
    });
    setShowCommentForm(false);
  };

  // Handle comment edit
  const handleEditComment = (comment: ReviewerComment) => {
    setCommentForm(comment);
    setEditingCommentId(comment.id);
    setShowCommentForm(true);
  };

  // Handle comment delete
  const handleDeleteComment = (commentId: string) => {
    setReviewerComments(prev => prev.filter(c => c.id !== commentId));
    setResponseDraft(prev => ({
      ...prev,
      responses: prev.responses.filter(r => r.reviewer !== reviewerComments.find(c => c.id === commentId)?.reviewer)
    }));
  };

  // Update response for reviewer
  const updateReviewerResponse = (reviewerIndex: number, response: string) => {
    setResponseDraft(prev => ({
      ...prev,
      responses: prev.responses.map(r =>
        r.reviewerIndex === reviewerIndex
          ? { ...r, pointByPointResponse: response }
          : r
      ),
      updatedAt: new Date().toISOString()
    }));
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(generatePreview());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download response
  const handleDownload = () => {
    const content = generatePreview();
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `reviewer-responses-${project.targetJournal?.name || "submission"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Generate preview text
  const generatePreview = (): string => {
    let preview = `REVIEWER RESPONSE LETTER\n`;
    preview += `=${"=".repeat(60)}\n\n`;
    preview += `Journal: ${responseDraft.journalName}\n`;
    preview += `Submission ID: ${responseDraft.submissionId || "Not specified"}\n`;
    preview += `Date: ${new Date().toLocaleDateString()}\n\n`;

    if (responseDraft.overallResponse) {
      preview += `OVERALL RESPONSE\n${"-".repeat(60)}\n`;
      preview += responseDraft.overallResponse + "\n\n";
    }

    responseDraft.responses.forEach((response, idx) => {
      const comment = reviewerComments[response.reviewerIndex];
      preview += `REVIEWER ${idx + 1}: ${response.reviewer}\n`;
      if (comment?.section) {
        preview += `Section: ${comment.section}\n`;
      }
      if (comment?.comment) {
        preview += `Comment: ${comment.comment}\n`;
      }
      preview += `Severity: ${comment?.severity.toUpperCase() || "N/A"}\n`;
      preview += `Response:\n${response.pointByPointResponse || "(No response yet)"}\n\n`;
    });

    return preview;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-mono font-bold text-slate-100">
            Reviewer Response Manager
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Track reviewer feedback and manage point-by-point responses
          </p>
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          {!showCommentForm && (
            <button
              onClick={() => setShowCommentForm(true)}
              className="px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue font-mono text-xs font-bold uppercase transition-all flex items-center gap-2 w-fit"
            >
              <Plus className="w-3 h-3" />
              Add Comment
            </button>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Total Comments</p>
          <p className="text-2xl font-bold text-slate-100">{stats.totalComments}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Major</p>
          <p className="text-2xl font-bold text-orange-400">{stats.majorCount}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Minor</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.minorCount}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Responded</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.respondedCount}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Progress</p>
          <p className="text-2xl font-bold text-luminous-blue">{stats.responseRate}%</p>
        </GlassmorphicCard>
      </div>

      {/* View Selector */}
      <div className="flex gap-2 flex-wrap">
        {["comments", "responses", "preview"].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode as any)}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-all ${
              viewMode === mode
                ? "bg-luminous-blue/30 border border-luminous-blue text-luminous-blue"
                : "bg-slate-700/30 border border-slate-600 text-slate-400 hover:border-slate-500"
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Comments View */}
      {viewMode === "comments" && (
        <div className="space-y-4">
          {showCommentForm && (
            <GlassmorphicCard className="p-6 space-y-4">
              <h4 className="font-mono font-bold text-luminous-blue uppercase text-sm">
                {editingCommentId ? "Edit Comment" : "Add Reviewer Comment"}
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
                    Reviewer Name *
                  </label>
                  <input
                    type="text"
                    value={commentForm.reviewer || ""}
                    onChange={(e) => setCommentForm({ ...commentForm, reviewer: e.target.value })}
                    placeholder="e.g., Reviewer 1, Dr. Smith"
                    className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
                      Date
                    </label>
                    <input
                      type="date"
                      value={commentForm.date || ""}
                      onChange={(e) => setCommentForm({ ...commentForm, date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
                      Severity
                    </label>
                    <select
                      value={commentForm.severity || "minor"}
                      onChange={(e) => setCommentForm({ ...commentForm, severity: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
                    >
                      <option value="minor">Minor</option>
                      <option value="major">Major</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
                    Section
                  </label>
                  <input
                    type="text"
                    value={commentForm.section || ""}
                    onChange={(e) => setCommentForm({ ...commentForm, section: e.target.value })}
                    placeholder="e.g., Introduction, Methods, Results"
                    className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
                    Comment *
                  </label>
                  <textarea
                    value={commentForm.comment || ""}
                    onChange={(e) => setCommentForm({ ...commentForm, comment: e.target.value })}
                    placeholder="Enter reviewer comment..."
                    className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50 resize-none"
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCommentSubmit}
                  className="flex-1 px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue font-mono text-xs font-bold uppercase transition-all"
                >
                  {editingCommentId ? "Update" : "Add"} Comment
                </button>
                <button
                  onClick={() => {
                    setShowCommentForm(false);
                    setEditingCommentId(null);
                    setCommentForm({
                      reviewer: "",
                      date: new Date().toISOString().split("T")[0],
                      section: "",
                      comment: "",
                      severity: "minor"
                    });
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-400 font-mono text-xs font-bold uppercase transition-all"
                >
                  Cancel
                </button>
              </div>
            </GlassmorphicCard>
          )}

          {reviewerComments.length > 0 ? (
            <div className="space-y-3">
              {reviewerComments.map((comment, idx) => (
                <GlassmorphicCard key={comment.id} className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-mono font-bold text-slate-100">
                          {comment.reviewer}
                        </h4>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {comment.section && (
                            <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">
                              {comment.section}
                            </span>
                          )}
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            comment.severity === "major"
                              ? "bg-orange-600/20 text-orange-400"
                              : "bg-yellow-600/20 text-yellow-400"
                          }`}>
                            {comment.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">{comment.date}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditComment(comment)}
                          className="p-2 rounded-lg bg-slate-700/30 hover:bg-slate-600/30 text-slate-400 hover:text-slate-300 transition-all"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-2 rounded-lg bg-red-700/20 hover:bg-red-700/30 text-red-400 hover:text-red-300 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{comment.comment}</p>
                  </div>
                </GlassmorphicCard>
              ))}
            </div>
          ) : (
            <GlassmorphicCard className="p-8 text-center">
              <p className="text-slate-400 text-sm">
                No reviewer comments yet. Add comments to start building responses.
              </p>
            </GlassmorphicCard>
          )}
        </div>
      )}

      {/* Responses View */}
      {viewMode === "responses" && (
        <div className="space-y-4">
          {/* Overall Response */}
          <GlassmorphicCard className="p-4">
            <label className="block text-sm font-mono font-bold text-luminous-blue mb-3 uppercase">
              Overall Response Letter
            </label>
            <textarea
              value={responseDraft.overallResponse}
              onChange={(e) => setResponseDraft({ ...responseDraft, overallResponse: e.target.value, updatedAt: new Date().toISOString() })}
              placeholder="Enter your overall response to the editor and reviewers..."
              className="w-full px-4 py-3 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50 resize-none"
              rows={5}
            />
          </GlassmorphicCard>

          {/* Individual Responses */}
          {responseDraft.responses.map((response, idx) => {
            const comment = reviewerComments[response.reviewerIndex];
            return (
              <GlassmorphicCard key={idx} className="p-4">
                <div className="mb-3 pb-3 border-b border-slate-700">
                  <h4 className="font-mono font-bold text-slate-100">
                    Response to {response.reviewer}
                  </h4>
                  {comment && (
                    <p className="text-xs text-slate-400 mt-1">
                      {comment.section && `Section: ${comment.section} • `}
                      Severity: {comment.severity.toUpperCase()}
                    </p>
                  )}
                  {comment?.comment && (
                    <p className="text-xs text-slate-300 mt-2 bg-slate-700/30 p-2 rounded italic">
                      "{comment.comment}"
                    </p>
                  )}
                </div>
                <textarea
                  value={response.pointByPointResponse}
                  onChange={(e) => updateReviewerResponse(response.reviewerIndex, e.target.value)}
                  placeholder="Enter your point-by-point response..."
                  className="w-full px-4 py-3 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50 resize-none"
                  rows={4}
                />
              </GlassmorphicCard>
            );
          })}

          {responseDraft.responses.length === 0 && (
            <GlassmorphicCard className="p-8 text-center">
              <p className="text-slate-400 text-sm">
                Add reviewer comments first to create response drafts.
              </p>
            </GlassmorphicCard>
          )}
        </div>
      )}

      {/* Preview View */}
      {viewMode === "preview" && (
        <div className="space-y-4">
          <GlassmorphicCard className="p-6">
            <div className="space-y-4 bg-navy-3 p-4 rounded-lg font-serif text-slate-200 leading-relaxed text-sm whitespace-pre-wrap overflow-auto max-h-96">
              {generatePreview()}
            </div>
          </GlassmorphicCard>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex-1 min-w-[120px] px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 min-w-[120px] px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
        </div>
      )}

      {/* Response Status */}
      <GlassmorphicCard className="p-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono text-slate-300">Response Progress</span>
            <span className="text-sm font-mono font-bold text-luminous-blue">{stats.responseRate}%</span>
          </div>
          <ProgressBar progress={stats.responseRate} />
          <p className="text-xs text-slate-400">
            {stats.respondedCount} of {stats.totalComments} reviewer comments have been addressed.
          </p>
        </div>
      </GlassmorphicCard>
    </div>
  );
}
