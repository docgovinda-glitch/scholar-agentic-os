/**
 * Hardware pre-check for Local AI.
 *
 * Runs before we suggest downloading anything, because a local model download
 * is several gigabytes and a machine that cannot run it comfortably will
 * simply swap and crawl — a slow, expensive way to discover a mismatch.
 *
 * The panel is explicit about detection confidence rather than presenting
 * guesses as facts. `navigator.deviceMemory` is capped at 8 GB for
 * fingerprinting reasons, so a 64 GB workstation and an 8 GB laptop report
 * identically, and no browser API reports video memory at all. Both are
 * shown as "at least" figures with an obvious way to correct them, and a
 * corrected value is treated as authoritative — the user can read their own
 * system information, the browser cannot.
 */

import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, Loader2, MonitorCog, Pencil, RefreshCw, Check, AlertTriangle, Download } from "lucide-react";
import {
  detectHardware,
  loadHardwareProfile,
  saveHardwareProfile,
  applyUserOverrides,
  assessHardware,
  usableModelMemoryGb,
  type HardwareProfile,
  type CpuArchitecture,
} from "../../services/hardwareProfile";
import { recommendLocalModels, type ModelRecommendation } from "../../config/localModelCatalog";

interface HardwareCheckPanelProps {
  /** Called when the user picks a model, e.g. to prefill the Ollama model field */
  onSelectModel?: (ollamaTag: string) => void;
}

export default function HardwareCheckPanel({ onSelectModel }: HardwareCheckPanelProps) {
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftRam, setDraftRam] = useState("");
  const [draftVram, setDraftVram] = useState("");
  const [draftArch, setDraftArch] = useState<CpuArchitecture>("unknown");

  const runDetection = async () => {
    setDetecting(true);
    try {
      const detected = await detectHardware();
      // A profile the user has already confirmed outranks a fresh detection —
      // re-detecting must never quietly discard their corrections.
      const stored = loadHardwareProfile();
      const next = stored?.userConfirmed
        ? applyUserOverrides(detected, {
            ramGb: stored.ramGb,
            vramGb: stored.vramGb,
            cpuCores: stored.cpuCores,
            architecture: stored.architecture,
          })
        : detected;
      setProfile(next);
      saveHardwareProfile(next);
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    const stored = loadHardwareProfile();
    if (stored) {
      setProfile(stored);
    } else {
      void runDetection();
    }
    // Detection runs once on mount; the refresh button re-runs it on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginEdit = () => {
    if (!profile) return;
    setDraftRam(profile.ramGb ? String(profile.ramGb) : "");
    setDraftVram(profile.vramGb != null ? String(profile.vramGb) : "");
    setDraftArch(profile.architecture);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!profile) return;
    const next = applyUserOverrides(profile, {
      ramGb: draftRam ? Number(draftRam) : null,
      vramGb: draftVram ? Number(draftVram) : null,
      architecture: draftArch,
    });
    setProfile(next);
    saveHardwareProfile(next);
    setEditing(false);
  };

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)] p-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking what this computer can run...
      </div>
    );
  }

  const assessment = assessHardware(profile);
  const usable = usableModelMemoryGb(profile);
  const recommendations = recommendLocalModels(usable, { limit: 4 });

  const tierColor =
    assessment.tier === "insufficient"
      ? "text-red-400 border-red-500/30 bg-red-500/10"
      : assessment.tier === "entry"
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-[color:var(--color-luminous-blue)] border-[color:var(--color-luminous-blue)]/30 bg-[color:var(--color-luminous-blue)]/10";

  return (
    <div className="space-y-4">
      {/* Detected specification */}
      <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MonitorCog className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
            <span className="text-xs font-bold text-[color:var(--text-secondary)]">
              This computer
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={beginEdit}
              className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              Correct
            </button>
            <button
              type="button"
              onClick={runDetection}
              disabled={detecting}
              className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {detecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Re-detect
            </button>
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-[color:var(--text-secondary)]">
              Your browser hides some of this for privacy. Entering the real figures gives you far
              better recommendations — you can find them in System Information (macOS), Task Manager
              → Performance (Windows), or with <code className="text-[color:var(--text-primary)]">free -h</code> (Linux).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-[color:var(--text-secondary)]">
                  System memory (GB)
                </span>
                <input
                  type="number"
                  min="1"
                  value={draftRam}
                  onChange={(e) => setDraftRam(e.target.value)}
                  placeholder="16"
                  className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[color:var(--text-secondary)]">
                  Graphics memory (GB)
                </span>
                <input
                  type="number"
                  min="0"
                  value={draftVram}
                  onChange={(e) => setDraftVram(e.target.value)}
                  placeholder="0 if none"
                  className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[color:var(--text-secondary)]">
                  Processor
                </span>
                <select
                  value={draftArch}
                  onChange={(e) => setDraftArch(e.target.value as CpuArchitecture)}
                  className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
                >
                  <option value="apple-silicon">Apple Silicon (M1/M2/M3/M4)</option>
                  <option value="x86-64">Intel or AMD (x86-64)</option>
                  <option value="arm64">ARM (other)</option>
                  <option value="unknown">Not sure</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 border border-[color:var(--color-navy-4)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SpecTile
              icon={<Cpu className="w-3.5 h-3.5" />}
              label="Processor cores"
              value={profile.cpuCores ? String(profile.cpuCores) : "Unknown"}
              note={profile.architecture !== "unknown" ? archLabel(profile.architecture) : undefined}
            />
            <SpecTile
              icon={<HardDrive className="w-3.5 h-3.5" />}
              label="System memory"
              value={profile.ramGb ? `${profile.ramGb} GB` : "Unknown"}
              note={profile.ramConfidence === "lower-bound" ? "at least — browser caps this" : undefined}
            />
            <SpecTile
              icon={<MonitorCog className="w-3.5 h-3.5" />}
              label="Graphics memory"
              value={profile.vramGb != null ? `${profile.vramGb} GB` : profile.unifiedMemory ? "Shared" : "Not reported"}
              note={profile.unifiedMemory ? "unified with system memory" : undefined}
            />
            <SpecTile
              icon={<Check className="w-3.5 h-3.5" />}
              label="Usable for models"
              value={usable != null ? `~${usable} GB` : "Unknown"}
            />
          </dl>
        )}

        {profile.gpuName && !editing && (
          <p className="mt-3 text-[11px] text-[color:var(--text-secondary)] font-mono truncate">Graphics: {profile.gpuName}</p>
        )}
      </div>

      {/* Verdict */}
      <div className={`border rounded-xl p-4 ${tierColor}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">{assessment.label}</span>
        </div>
        <p className="text-xs mt-1.5 leading-relaxed text-[color:var(--text-primary)]">{assessment.summary}</p>
        {assessment.caveats.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {assessment.caveats.map((caveat) => (
              <li key={caveat} className="flex items-start gap-1.5 text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <span className="text-xs font-bold text-[color:var(--text-secondary)]">
            Models that fit this computer
          </span>
          <div className="mt-2 space-y-2">
            {recommendations.map((rec) => (
              <ModelRow key={rec.model.id} rec={rec} onSelect={onSelectModel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function archLabel(arch: CpuArchitecture): string {
  switch (arch) {
    case "apple-silicon":
      return "Apple Silicon";
    case "x86-64":
      return "Intel/AMD";
    case "arm64":
      return "ARM";
    default:
      return "";
  }
}

function SpecTile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-[color:var(--color-navy-3)]/60 rounded-lg p-2.5">
      <dt className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--text-secondary)]">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="text-sm font-bold text-[color:var(--text-primary)] mt-1">{value}</dd>
      {note && <p className="text-[10px] text-[color:var(--text-secondary)] mt-0.5 leading-tight">{note}</p>}
    </div>
  );
}

function ModelRow({ rec, onSelect }: { rec: ModelRecommendation; onSelect?: (tag: string) => void }) {
  const { model, fit, rationale } = rec;

  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-[color:var(--text-primary)]">{model.name}</span>
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded ${ fit === "comfortable" ? "bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]" : "bg-amber-500/15 text-amber-400" }`}
            >
              {fit === "comfortable" ? "Good fit" : "Tight fit"}
            </span>
            <span className="text-[10px] font-mono text-[color:var(--text-secondary)]">
              {model.downloadSizeGb} GB · {model.quantization}
            </span>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">{model.academicFit}</p>
          <p className="text-[11px] text-[color:var(--text-secondary)] mt-1 leading-relaxed opacity-80">{rationale}</p>
        </div>
        {onSelect && (
          <button
            type="button"
            onClick={() => onSelect(model.ollamaTag)}
            className="px-2.5 py-1.5 border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[color:var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Use
          </button>
        )}
      </div>
      <code className="block mt-2 text-[11px] font-mono text-[color:var(--color-luminous-blue)] bg-[color:var(--color-navy-3)]/60 rounded px-2 py-1 overflow-x-auto">
        ollama pull {model.ollamaTag}
      </code>
    </div>
  );
}
