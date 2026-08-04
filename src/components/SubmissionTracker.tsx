import React, { useState, useMemo } from "react";
import { SubmissionRecord, SubmissionStatus } from "../types/submissionTypes";
import { GlassmorphicCard, StatusIndicator } from "./SciFiComponents";
import { Plus, Trash2, Edit2, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";

interface SubmissionTrackerProps {
  submissions?: SubmissionRecord[];
  onAddSubmission?: (submission: Omit<SubmissionRecord, "id" | "statusUpdatedAt">) => void;
  onUpdateSubmission?: (id: string, update: Partial<SubmissionRecord>) => void;
  onDeleteSubmission?: (id: string) => void;
}

const STATUS_COLORS: Record<SubmissionStatus, { bg: string; text: string; icon: string }> = {
  draft: { bg: "bg-slate-600/20", text: "text-slate-400", icon: "📝" },
  submitted: { bg: "bg-blue-600/20", text: "text-blue-400", icon: "✉️" },
  under_review: { bg: "bg-amber-600/20", text: "text-amber-400", icon: "🔍" },
  minor_revisions: { bg: "bg-yellow-600/20", text: "text-yellow-400", icon: "⚡" },
  major_revisions: { bg: "bg-orange-600/20", text: "text-orange-400", icon: "⚠️" },
  accepted: { bg: "bg-emerald-600/20", text: "text-emerald-400", icon: "✓" },
  rejected: { bg: "bg-red-600/20", text: "text-red-400", icon: "✗" },
  desk_rejected: { bg: "bg-red-700/20", text: "text-red-300", icon: "🚫" }
};

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  minor_revisions: "Minor Revisions",
  major_revisions: "Major Revisions",
  accepted: "Accepted",
  rejected: "Rejected",
  desk_rejected: "Desk Rejected"
};

function SubmissionTracker({
  submissions = [],
  onAddSubmission,
  onUpdateSubmission,
  onDeleteSubmission
}: SubmissionTrackerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [sortBy, setSortBy] = useState<"date" | "status">("date");

  const [formData, setFormData] = useState<Partial<SubmissionRecord>>({
    journalName: "",
    submissionDate: new Date().toISOString().split("T")[0],
    status: "draft" as SubmissionStatus
  });

  // Filter and sort submissions
  const filteredSubmissions = useMemo(() => {
    let filtered = [...submissions];

    if (filter === "active") {
      filtered = filtered.filter(
        s => !["accepted", "rejected", "desk_rejected"].includes(s.status)
      );
    } else if (filter === "completed") {
      filtered = filtered.filter(
        s => ["accepted", "rejected", "desk_rejected"].includes(s.status)
      );
    }

    if (sortBy === "date") {
      filtered.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
    } else {
      filtered.sort((a, b) => {
        const statusOrder = ["draft", "submitted", "under_review", "minor_revisions", "major_revisions", "accepted", "rejected", "desk_rejected"];
        return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      });
    }

    return filtered;
  }, [submissions, filter, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    const total = submissions.length;
    const submitted = submissions.filter(s => s.status !== "draft").length;
    const pending = submissions.filter(s => ["submitted", "under_review", "minor_revisions", "major_revisions"].includes(s.status)).length;
    const accepted = submissions.filter(s => s.status === "accepted").length;
    const rejected = submissions.filter(s => ["rejected", "desk_rejected"].includes(s.status)).length;

    return { total, submitted, pending, accepted, rejected };
  }, [submissions]);

  const handleSubmit = () => {
    if (!formData.journalName || !formData.submissionDate) {
      alert("Please fill in journal name and submission date");
      return;
    }

    if (editingId) {
      onUpdateSubmission?.(editingId, formData);
      setEditingId(null);
    } else {
      onAddSubmission?.(formData as Omit<SubmissionRecord, "id" | "statusUpdatedAt">);
    }

    setFormData({
      journalName: "",
      submissionDate: new Date().toISOString().split("T")[0],
      status: "draft" as SubmissionStatus
    });
    setShowForm(false);
  };

  const handleEdit = (submission: SubmissionRecord) => {
    setFormData(submission);
    setEditingId(submission.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setFormData({
      journalName: "",
      submissionDate: new Date().toISOString().split("T")[0],
      status: "draft" as SubmissionStatus
    });
    setEditingId(null);
    setShowForm(false);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const getDaysAgo = (dateString: string): string => {
    const days = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-mono font-bold text-slate-100">
            Submission Tracker
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Track journal submissions and manuscript status across multiple venues
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue text-xs font-bold transition-all flex items-center gap-2 w-fit"
          >
            <Plus className="w-3 h-3" />
            New Submission
          </button>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400">Pending</p>
          <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400">Accepted</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.accepted}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400">Rejected</p>
          <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-3">
          <p className="text-xs text-slate-400">Success Rate</p>
          <p className="text-2xl font-bold text-blue-400">
            {stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0}%
          </p>
        </GlassmorphicCard>
      </div>

      {/* Form */}
      {showForm && (
        <GlassmorphicCard className="p-6 space-y-4">
          <h4 className="font-bold text-luminous-blue text-sm">
            {editingId ? "Edit Submission" : "Add New Submission"}
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Journal Name *
              </label>
              <input
                type="text"
                value={formData.journalName || ""}
                onChange={(e) => setFormData({ ...formData, journalName: e.target.value })}
                placeholder="e.g., Nature Machine Intelligence"
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Journal URL
              </label>
              <input
                type="url"
                value={formData.journalUrl || ""}
                onChange={(e) => setFormData({ ...formData, journalUrl: e.target.value })}
                placeholder="https://example.com"
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Submission Date *
              </label>
              <input
                type="date"
                value={formData.submissionDate || ""}
                onChange={(e) => setFormData({ ...formData, submissionDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Status
              </label>
              <select
                value={formData.status || "draft"}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as SubmissionStatus })}
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Submission ID
              </label>
              <input
                type="text"
                value={formData.submissionId || ""}
                onChange={(e) => setFormData({ ...formData, submissionId: e.target.value })}
                placeholder="e.g., NATURE-2024-12345"
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Notes
              </label>
              <textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any notes or follow-up information..."
                className="w-full px-3 py-2 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50 resize-none"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue text-xs font-bold transition-all"
            >
              {editingId ? "Update" : "Add"} Submission
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-400 text-xs font-bold transition-all"
            >
              Cancel
            </button>
          </div>
        </GlassmorphicCard>
      )}

      {/* Filters & Sorting */}
      {submissions.length > 0 && !showForm && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex gap-1.5 bg-slate-700/30 rounded-lg p-1">
            {["all", "active", "completed"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${ filter === f ? "bg-luminous-blue/30 text-luminous-blue border border-luminous-blue/40" : "text-slate-400 hover:text-slate-300" }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg bg-slate-700/30 border border-slate-600 text-xs font-mono text-slate-300 focus:outline-none focus:border-luminous-blue"
          >
            <option value="date">Sort by Date</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      )}

      {/* Submissions List */}
      {filteredSubmissions.length > 0 ? (
        <div className="space-y-3">
          {filteredSubmissions.map((submission) => {
            const colors = STATUS_COLORS[submission.status];
            return (
              <GlassmorphicCard key={submission.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{colors.icon}</span>
                        <h4 className="font-mono font-bold text-slate-100 text-sm">
                          {submission.journalName}
                        </h4>
                        {submission.submissionId && (
                          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                            {submission.submissionId}
                          </span>
                        )}
                      </div>
                      <div className={`inline-block px-3 py-1 rounded-lg ${colors.bg} ${colors.text} text-xs font-bold mb-2`}>
                        {STATUS_LABELS[submission.status]}
                      </div>
                      {submission.notes && (
                        <p className="text-xs text-slate-400 mt-2">{submission.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(submission)}
                        className="p-2 rounded-lg bg-slate-700/30 hover:bg-slate-600/30 text-slate-400 hover:text-slate-300 transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteSubmission?.(submission.id)}
                        className="p-2 rounded-lg bg-red-700/20 hover:bg-red-700/30 text-red-400 hover:text-red-300 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(submission.submissionDate)}</span>
                      <span className="text-slate-600">•</span>
                      <span>{getDaysAgo(submission.submissionDate)}</span>
                    </div>
                    {submission.journalUrl && (
                      <a
                        href={submission.journalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-luminous-blue hover:text-luminous-blue/70 transition-colors"
                      >
                        Visit Journal →
                      </a>
                    )}
                  </div>
                </div>
              </GlassmorphicCard>
            );
          })}
        </div>
      ) : (
        <GlassmorphicCard className="p-8 text-center">
          <p className="text-slate-400 text-sm">
            {submissions.length === 0
              ? "No submissions yet. Create your first one to get started."
              : "No submissions match the selected filter."}
          </p>
        </GlassmorphicCard>
      )}
    </div>
  );
}

export default SubmissionTracker;
