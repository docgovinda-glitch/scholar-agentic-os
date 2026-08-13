import { useState } from "react";
import { saveManualHardwareProfile } from "../../services/hardwareProfiler";

/**
 * Manual hardware entry (Section 16) — always available, independent of
 * whether auto-detection found anything. Every field is optional; a blank
 * field stays "Unknown" rather than falling back to a guess, matching the
 * same honesty rule the auto-detected profile follows. Submitting overrides
 * whatever profile (auto-detected or a previous manual entry) Scholar was
 * using for local-model recommendations — see saveManualHardwareProfile's
 * own doc comment for why that's a deliberate override, not a second,
 * blended profile.
 */
export default function ManualHardwareForm({ onSaved }: { onSaved: () => void }) {
  const [os, setOs] = useState("");
  const [cpuCores, setCpuCores] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [ramGb, setRamGb] = useState("");
  const [gpuInfo, setGpuInfo] = useState("");
  const [vramGb, setVramGb] = useState("");
  const [storageFreeGb, setStorageFreeGb] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasAnyField = [os, cpuCores, architecture, ramGb, gpuInfo, vramGb, storageFreeGb].some((v) => v.trim() !== "");

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await saveManualHardwareProfile({
        os: os.trim() || undefined,
        cpuCores: cpuCores.trim() ? Number(cpuCores) : undefined,
        architecture: architecture.trim() || undefined,
        ramGb: ramGb.trim() ? Number(ramGb) : undefined,
        gpuInfo: gpuInfo.trim() || undefined,
        vramGb: vramGb.trim() ? Number(vramGb) : undefined,
        storageFreeGb: storageFreeGb.trim() ? Number(storageFreeGb) : undefined,
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-2.5 py-1.5 text-sm text-[color:var(--text-primary)]";
  const labelClass = "text-xs font-medium text-[color:var(--text-secondary)]";

  return (
    <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Enter your hardware manually</h3>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        If you know your machine's specs better than your browser's estimate, enter them here. Every field is optional —
        leave anything you don't know blank.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="hw-os">Operating system</label>
          <input id="hw-os" value={os} onChange={(e) => setOs(e.target.value)} placeholder="e.g. macOS 15" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="hw-arch">Architecture</label>
          <input id="hw-arch" value={architecture} onChange={(e) => setArchitecture(e.target.value)} placeholder="e.g. arm64" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="hw-cores">CPU cores</label>
          <input id="hw-cores" type="number" min="1" value={cpuCores} onChange={(e) => setCpuCores(e.target.value)} className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="hw-ram">RAM (GB)</label>
          <input id="hw-ram" type="number" min="0" value={ramGb} onChange={(e) => setRamGb(e.target.value)} className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="hw-gpu">GPU model</label>
          <input id="hw-gpu" value={gpuInfo} onChange={(e) => setGpuInfo(e.target.value)} placeholder="e.g. RTX 4070" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="hw-vram">
            VRAM (GB) <span className="font-normal text-[color:var(--text-muted)]">— if known</span>
          </label>
          <input id="hw-vram" type="number" min="0" value={vramGb} onChange={(e) => setVramGb(e.target.value)} placeholder="Most people don't know this" className={`mt-1 ${inputClass}`} />
        </div>
        <div className="col-span-2">
          <label className={labelClass} htmlFor="hw-storage">Free storage (GB)</label>
          <input id="hw-storage" type="number" min="0" value={storageFreeGb} onChange={(e) => setStorageFreeGb(e.target.value)} className={`mt-1 ${inputClass}`} />
        </div>
      </div>

      {saved && <p role="status" className="mt-3 text-xs text-[color:var(--state-success)]">Saved. Recommendations below now use your entry.</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !hasAnyField}
        className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save my hardware"}
      </button>
    </section>
  );
}
