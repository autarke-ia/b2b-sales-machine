"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorState, Select } from "@/components/ui/primitives";

interface PreviewDto {
  import_id: string;
  status: "previewed" | "invalid";
  target: string;
  counts: { create: number; update: number; ignore: number; error: number };
  errors: Array<{ row: number; field?: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  dataset_revision: number;
  expires_at: string;
}

const TARGETS = [
  { v: "companies", label: "Empresas" },
  { v: "signals", label: "Sinais" },
  { v: "contacts", label: "Contatos" },
  { v: "opportunities", label: "Oportunidades" },
  { v: "icp_rules", label: "Pesos de ICP (rascunho)" },
  { v: "priority_rules", label: "Pesos de prioridade (rascunho)" },
  { v: "disqualifiers", label: "Desqualificadores" },
];

/** Importação de CSV (doc 05 §6): escolher arquivo → validar → prévia → confirmar.
 * Upload aceito NÃO é importação concluída; confirmação desabilitada para invalid/expired. */
export function ImportPanel({ datasetId, onCommitted }: { datasetId: string; onCommitted?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("signals");
  const [policy, setPolicy] = useState("fill_missing");
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("target", target);
      fd.append("merge_policy", policy);
      const res = await fetch(`/api/v1/datasets/${datasetId}/imports`, {
        method: "POST",
        headers: { "x-csrf-token": (await (await fetch("/api/v1/auth/session")).json()).data.csrf_token },
        body: fd,
        credentials: "same-origin",
      });
      if (!res.ok) throw Object.assign(new Error("Falha na prévia"), { message: ((await res.json()) as { error: { message: string } }).error.message });
      const body = (await res.json()) as { data: PreviewDto };
      setPreview(body.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/datasets/${datasetId}/imports/${preview.import_id}/commit`, {
        method: "POST",
        body: { expected_dataset_revision: preview.dataset_revision, ...(policy === "overwrite_non_null" ? { confirm_overwrite: true } : {}) },
        idempotencyKey: `import-${preview.import_id}-${preview.dataset_revision}`,
      });
      setPreview(null);
      setFile(null);
      onCommitted?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Importar CSV" className="border border-line bg-panel">
      <header className="border-b border-line px-4 py-2">
        <span className="eyebrow">Importar CSV</span>
      </header>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3">
        <label className="block space-y-1">
          <span className="text-[var(--text-xs)] text-muted">Arquivo (.csv)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Arquivo CSV"
            className="block w-64 border border-line bg-panel px-2 py-1 text-[var(--text-xs)] file:mr-2 file:border-0 file:bg-ink file:px-2 file:py-1 file:text-ink-fg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[var(--text-xs)] text-muted">Destino</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Destino da importação">
            {TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </Select>
        </label>
        <label className="block space-y-1">
          <span className="text-[var(--text-xs)] text-muted">Política</span>
          <Select value={policy} onChange={(e) => setPolicy(e.target.value)} aria-label="Política de atualização">
            <option value="fill_missing">Preencher lacunas</option>
            <option value="overwrite_non_null">Sobrescrever não vazios</option>
          </Select>
        </label>
        <Button variant="secondary" onClick={upload} disabled={!file || busy}>
          <Upload className="size-3.5" aria-hidden /> {busy ? "Validando…" : "Validar e pré-visualizar"}
        </Button>
      </div>

      {error ? <div className="px-4 pb-3"><ErrorState message={error} onRetry={upload} /></div> : null}

      {preview ? (
        <div className="border-t border-line px-4 py-3">
          <p className="mono text-[var(--text-xs)] text-muted">
            {preview.status === "previewed" ? "Prévia válida" : "PRÉVIA INVÁLIDA — commit indisponível"} · criar {preview.counts.create} · alterar {preview.counts.update} · ignorar {preview.counts.ignore} · erros {preview.counts.error}
          </p>
          {preview.errors.length ? (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[var(--text-xs)] text-bad-fg">
              {preview.errors.slice(0, 20).map((e, i) => (
                <li key={i}>linha {e.row}{e.field ? ` · ${e.field}` : ""}: {e.message}</li>
              ))}
            </ul>
          ) : null}
          {preview.warnings.length ? (
            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[var(--text-xs)] text-broken-fg">
              {preview.warnings.slice(0, 10).map((w, i) => <li key={i}>linha {w.row}: {w.message}</li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" onClick={confirm} disabled={busy || preview.status !== "previewed"}>
              {busy ? "Confirmando…" : "Confirmar importação"}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>Descartar prévia</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
