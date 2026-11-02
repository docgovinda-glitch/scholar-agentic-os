import { useEffect, useRef, useState } from "react";
import { ImagePlus, Table2, Trash2 } from "lucide-react";
import { figureToken, parseTableText, type ManuscriptFigure } from "../../domain/journal/figures";

const MAX_SIDE = 1600;
const MAX_BYTES = 1_500_000;
const box = "w-full text-xs p-2 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]";

/** Reads an image file and scales it so its long side is at most 1600 px. */
async function readImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("The image could not be read."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't an image this browser can read (use PNG or JPEG)."));
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.length * 0.75 <= MAX_BYTES && /^data:image\/(png|jpeg)/.test(dataUrl)) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  return png.length * 0.75 <= MAX_BYTES ? png : canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * The manuscript's figures and tables as objects: an uploaded image or typed
 * table, a caption, alt text and a credit line. The text refers to each by
 * its token; numbers follow the order of first mention.
 */
export default function FiguresPanel({ figures: saved, onChange: save }: { figures: ManuscriptFigure[]; onChange: (next: ManuscriptFigure[]) => Promise<void> }) {
  // The list on screen is the source of truth: each edit builds on the latest
  // one, even before the previous save has come back.
  const [figures, setFigures] = useState(saved);
  const latest = useRef(saved);
  // Saves go one at a time and each sends the latest list, so a slower,
  // older save can never land after a newer one and undo it.
  const saving = useRef<Promise<void> | null>(null);
  const unsaved = useRef(false);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (!saving.current && !unsaved.current) {
      latest.current = saved;
      setFigures(saved);
    }
  }, [savedKey]);
  const onChange = (next: ManuscriptFigure[]): Promise<void> => {
    latest.current = next;
    setFigures(next);
    unsaved.current = true;
    if (!saving.current) {
      saving.current = (async () => {
        try {
          while (unsaved.current) {
            unsaved.current = false;
            await save(latest.current);
          }
        } finally {
          saving.current = null;
        }
      })();
    }
    return saving.current;
  };
  const [error, setError] = useState<string | null>(null);
  const [tableDraft, setTableDraft] = useState<Record<string, string>>({});
  const set = (id: string, patch: Partial<ManuscriptFigure>) => void onChange(latest.current.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const nextId = (kind: "figure" | "table") => {
    const prefix = kind === "table" ? "tab" : "fig";
    let i = latest.current.filter((f) => f.kind === kind).length + 1;
    while (latest.current.some((f) => f.id === `${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  };

  const addFigure = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const image = await readImage(file);
      if (image.length * 0.75 > MAX_BYTES) throw new Error("The image is still over 1.5 MB after scaling; export a smaller version.");
      await onChange([...latest.current, { id: nextId("figure"), kind: "figure", caption: "", altText: "", image }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image could not be added.");
    }
  };

  return (
    <section aria-label="Figures and tables" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer">
          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
          Add figure
          <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Figure image" onChange={(e) => void addFigure(e.target.files?.[0])} />
        </label>
        <button
          type="button"
          onClick={() => void onChange([...latest.current, { id: nextId("table"), kind: "table", caption: "", altText: "", rows: [] }])}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
        >
          <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
          Add table
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          {error}
        </p>
      )}
      {figures.length === 0 && <p className="text-xs text-[color:var(--text-muted)]">No figures or tables yet. In the Studio, insert a reference to one where the text discusses it; it is numbered by first mention.</p>}
      <ul className="space-y-3">
        {figures.map((f) => {
          const name = `${f.kind === "table" ? "Table" : "Figure"} ${f.id}`;
          return (
            <li key={f.id} className="p-3 rounded-xl border border-[color:var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                  {f.kind === "table" ? "Table" : "Figure"} · <code className="normal-case">{figureToken(f)}</code>
                </span>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => void onChange(latest.current.filter((x) => x.id !== f.id))} className="p-1 rounded text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              {f.kind === "figure" && f.image && <img src={f.image} alt={f.altText || f.caption || "Uploaded figure"} className="max-h-40 rounded border border-[color:var(--border-subtle)]" />}
              {f.kind === "table" && (
                <>
                  <textarea
                    aria-label={`${name} rows`}
                    rows={4}
                    placeholder={"Paste from a spreadsheet, or type rows like:\nGroup | n | Mean age\nSleep | 15 | 24.1"}
                    value={tableDraft[f.id] ?? (f.rows ?? []).map((r) => r.join(" | ")).join("\n")}
                    onChange={(e) => setTableDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                    onBlur={(e) => set(f.id, { rows: parseTableText(e.target.value) })}
                    className={`${box} font-mono`}
                  />
                  {(f.rows?.length ?? 0) > 0 && (
                    <p className="text-[11px] text-[color:var(--text-muted)]">
                      {f.rows!.length - 1} row{f.rows!.length === 2 ? "" : "s"} × {Math.max(...f.rows!.map((r) => r.length))} columns; the first row is the header.
                    </p>
                  )}
                </>
              )}
              <input aria-label={`${name} caption`} placeholder="Caption: what it shows, so it stands on its own" defaultValue={f.caption} onBlur={(e) => e.target.value !== f.caption && set(f.id, { caption: e.target.value })} className={box} />
              {f.kind === "figure" && (
                <input aria-label={`${name} alt text`} placeholder="Alt text: describe the image for readers who can't see it" defaultValue={f.altText} onBlur={(e) => e.target.value !== f.altText && set(f.id, { altText: e.target.value })} className={box} />
              )}
              <input aria-label={`${name} credit`} placeholder="Source or permission, if reproduced (optional)" defaultValue={f.credit ?? ""} onBlur={(e) => e.target.value !== (f.credit ?? "") && set(f.id, { credit: e.target.value })} className={box} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
