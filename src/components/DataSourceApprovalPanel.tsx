import React, { useState } from "react";
import { DiscoveredDataSource, PaperProject } from "../types";
import { CheckCircle2, XCircle, ExternalLink, AlertCircle, Filter } from "lucide-react";
import { GlassmorphicCard, StatusIndicator } from "./SciFiComponents";

interface DataSourceApprovalPanelProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
}

type FilterStatus = "all" | "pending" | "approved";

export function DataSourceApprovalPanel({
  project,
  updateProject
}: DataSourceApprovalPanelProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dataSources = project.dataSources || [];

  const filteredSources = dataSources.filter((source) => {
    if (filterStatus === "all") return true;
    return source.status === filterStatus;
  });

  const approvePending = (sourceIndex: number) => {
    const updated = [...dataSources];
    updated[sourceIndex] = { ...updated[sourceIndex], status: "approved" };
    updateProject({ dataSources: updated });
  };

  const rejectPending = (sourceIndex: number) => {
    const updated = dataSources.filter((_, idx) => idx !== sourceIndex);
    updateProject({ dataSources: updated });
  };

  const pendingCount = dataSources.filter((s) => s.status === "pending").length;
  const approvedCount = dataSources.filter((s) => s.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-luminous-blue" />
          Research Materials Approval
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          Review and approve discovered sources before using them in citations and drafts.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <GlassmorphicCard className="p-4">
          <div className="text-xs text-slate-400">Total Sources</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{dataSources.length}</div>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-4">
          <div className="text-xs text-slate-400">Pending Review</div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{pendingCount}</div>
        </GlassmorphicCard>
        <GlassmorphicCard className="p-4">
          <div className="text-xs text-slate-400">Approved</div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{approvedCount}</div>
        </GlassmorphicCard>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-4">
        {(["all", "pending", "approved"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-2 text-xs font-bold transition-colors rounded-lg ${ filterStatus === status ? "bg-luminous-blue text-navy-0" : "bg-navy-2 text-slate-400 hover:text-slate-200" }`}
          >
            {status === "all" && "All"}
            {status === "pending" && `Pending (${pendingCount})`}
            {status === "approved" && `Approved (${approvedCount})`}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {dataSources.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="text-sm">No research materials discovered yet.</p>
          <p className="text-xs text-slate-500 mt-1">Run Phase C (Data Discovery) to find sources.</p>
        </div>
      )}

      {/* Sources List */}
      {filteredSources.length > 0 && (
        <div className="space-y-3">
          {filteredSources.map((source, displayIdx) => {
            const actualIdx = dataSources.findIndex((s) => s.name === source.name && s.url === source.url);
            const isExpanded = expandedId === source.url;

            return (
              <GlassmorphicCard
                key={source.url}
                className="p-4 hover:border-luminous-blue/50 transition-all cursor-pointer"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : source.url)}
                  className="space-y-3"
                >
                  {/* Header Row */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-mono font-bold text-slate-100">{source.name}</h4>
                        <StatusIndicator
                          status={source.status === "approved" ? "success" : "processing"}
                          label={source.status === "approved" ? "Approved" : "Pending"}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block text-xs px-2 py-1 bg-navy-3 rounded text-slate-400">
                          {source.type}
                        </span>
                        <span className="inline-block text-xs px-2 py-1 bg-navy-3 rounded text-slate-400">
                          {source.reliability}
                        </span>
                      </div>
                    </div>
                    {source.status === "pending" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            approvePending(actualIdx);
                          }}
                          title="Approve this source"
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectPending(actualIdx);
                          }}
                          title="Reject this source"
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-700 space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Relevance</p>
                        <p className="text-slate-300 text-sm">{source.relevance}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Limitations</p>
                        <p className="text-slate-300 text-sm">{source.limitations}</p>
                      </div>
                      <div className="pt-2 flex items-center gap-2">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-luminous-blue hover:underline font-mono"
                        >
                          View Source
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </GlassmorphicCard>
            );
          })}
        </div>
      )}

      {/* Empty Filter Result */}
      {filteredSources.length === 0 && dataSources.length > 0 && (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">No {filterStatus === "all" ? "sources" : filterStatus + " sources"} found.</p>
        </div>
      )}
    </div>
  );
}
