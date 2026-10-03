"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, ErrorState, Input, Loading, Select } from "@/components/ui/primitives";
import { GateBadge } from "@/components/badges";
import { Decomposition, type AssessmentView } from "@/components/decomposition";

interface CompanyDetailDto {
  id: string;
  external_id: string;
  name: string;
  domain: string | null;
  segment: string | null;
  employees: number | null;
  uf: string | null;
  operates_in_brazil: boolean | null;
  hr_structured: boolean | null;
  has_benefits: boolean | null;
  seeks_benefit_differentiation: boolean | null;
  multi_region: boolean | null;
  growth: "low" | "medium" | "high" | null;
  employer_branding: "low" | "medium" | "high" | null;
  retention_pain: "low" | "medium" | "high" | null;
  renewal_window: "m0_3" | "m4_6" | "m7_12" | "over_12" | null;
  renewed_24_plus: boolean | null;
  operating_status: "active" | "inactive" | "unknown";
  source_label: string | null;
  version: number;
  archived_at: string | null;
  assessment: AssessmentView & { id: string; as_of: string };
  signals: Array<{ id: string; signal_type: string; evidence_text: string; strength: string; observed_on: string | null; source_allowed: boolean | null }>;
  contacts: Array<{ id: string; full_name: string | null; job_title: string | null; channel_type: string; channel_value: string; source_allowed: boolean | null }>;
}

interface HistoryRow {
  id: string;
  operation: string;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: string;
  occurred_at: string;
}

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const BOOL = [
  { v: "", label: "Não informado" },
  { v: "true", label: "Sim" },
  { v: "false", label: "Não" },
];
const LEVELS = [
  { v: "", label: "Não informado" },
  { v: "low", label: "Baixo" },
  { v: "medium", label: "Médio" },
  { v: "high", label: "Alto" },
];
const RENEWALS = [
  { v: "", label: "Não informado" },
  { v: "m0_3", label: "0–3 meses" },
  { v: "m4_6", label: "4–6 meses" },
  { v: "m7_12", label: "7–12 meses" },
  { v: "over_12", label: "> 12 meses" },
];

type Draft = Record<string, string>;

function draftFrom(detail: CompanyDetailDto): Draft {
  const b = (v: boolean | null) => (v === null ? "" : String(v));
  const l = (v: string | null) => v ?? "";
  return {
    name: detail.name,
    domain: detail.domain ?? "",
    segment: detail.segment ?? "",
    employees: detail.employees === null ? "" : String(detail.employees),
    uf: detail.uf ?? "",
    operates_in_brazil: b(detail.operates_in_brazil),
    hr_structured: b(detail.hr_structured),
    has_benefits: b(detail.has_benefits),
    seeks_benefit_differentiation: b(detail.seeks_benefit_differentiation),
    multi_region: b(detail.multi_region),
    growth: l(detail.growth),
    employer_branding: l(detail.employer_branding),
    retention_pain: l(detail.retention_pain),
    renewal_window: l(detail.renewal_window),
    renewed_24_plus: b(detail.renewed_24_plus),
    operating_status: detail.operating_status === "unknown" ? "" : detail.operating_status,
    source_label: detail.source_label ?? "",
  };
}

/** Detalhe da empresa (doc 05 §5): editor tipado tri-state, gate e prioridade
 * SEPARADOS, 409 com rascunho preservado, histórico before/after. */
export default function CompanyDetailPage() {
  const { datasetId, companyId } = useParams<{ datasetId: string; companyId: string }>();
  const [detail, setDetail] = useState<CompanyDetailDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; currentVersion: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyField, setHistoryField] = useState("");
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setConflict(null);
    api<CompanyDetailDto>(`/datasets/${datasetId}/companies/${companyId}`)
      .then((res) => {
        setDetail(res.data);
        setDraft(draftFrom(res.data));
      })
      .catch((e) => setError(e.message));
  }, [datasetId, companyId]);

  const loadHistory = useCallback(() => {
    api<HistoryRow[]>(`/datasets/${datasetId}/companies/${companyId}/history${historyField ? `?field=${historyField}` : ""}`)
      .then((res) => setHistory(res.data))
      .catch(() => setHistory([]));
  }, [datasetId, companyId, historyField]);

  useEffect(load, [load]);
  useEffect(loadHistory, [loadHistory]);

  async function save() {
    if (!detail || !draft) return;
    setSaving(true);
    setConflict(null);
    const changes: Record<string, unknown> = {};
    const current = draftFrom(detail);
    for (const k of Object.keys(draft)) {
      if (draft[k] !== current[k]) {
        changes[k] = draft[k] === "" ? null : k === "employees" ? Number(draft[k]) : draft[k] === "true" ? true : draft[k] === "false" ? false : draft[k];
      }
    }
    if (Object.keys(changes).length === 0) {
      setSaving(false);
      return;
    }
    if (changes.name === null) {
      setError("Nome não pode ficar vazio — é um campo obrigatório.");
      setSaving(false);
      return;
    }
    try {
      await api(`/datasets/${datasetId}/companies/${companyId}`, {
        method: "PATCH",
        body: { expected_version: detail.version, changes },
      });
      setSaved(true);
      load();
    } catch (e) {
      const apiErr = e as { code?: string; message?: string; details?: { current_version?: number } };
      if (apiErr.code === "VERSION_CONFLICT") {
        setConflict({ message: apiErr.message ?? "Conflito de versão.", currentVersion: apiErr.details?.current_version ?? detail.version + 1 });
      } else {
        setError(apiErr.message ?? "Falha ao salvar.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (error && !detail) return <ErrorState message={error} onRetry={load} />;
  if (!detail || !draft) return <Loading />;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false); // nova edição limpa o aviso da anterior
    setDraft({ ...draft, [k]: e.target.value });
  };
  const triBool = (k: string, label: string) => (
    <label className="block space-y-1">
      <span className="text-[var(--text-xs)] text-muted">{label}</span>
      <Select value={draft[k]} onChange={set(k)} aria-label={label}>
        {BOOL.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </Select>
    </label>
  );
  const level = (k: string, label: string) => (
    <label className="block space-y-1">
      <span className="text-[var(--text-xs)] text-muted">{label}</span>
      <Select value={draft[k]} onChange={set(k)} aria-label={label}>
        {LEVELS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </Select>
    </label>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Empresa</div>
          <h1 className="mt-2 text-[var(--text-2xl)] font-light">{detail.name}</h1>
          <p className="mono mt-1 text-[var(--text-2xs)] text-faint">
            {detail.external_id} · versão {detail.version} · as_of {detail.assessment.as_of}
            {detail.archived_at ? " · ARQUIVADA" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <GateBadge state={detail.assessment.gate.state} />
          {saved ? <span className="text-[var(--text-2xs)] text-ok-fg">Alteração salva e recalculada.</span> : null}
          <Button
            variant={detail.archived_at ? "secondary" : "danger"}
            disabled={archiving}
            onClick={async () => {
              setArchiving(true);
              try {
                await api(`/datasets/${datasetId}/companies/${companyId}/archive`, {
                  method: "POST",
                  body: { archived: !detail.archived_at, expected_version: detail.version },
                });
                load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setArchiving(false);
              }
            }}
          >
            {archiving ? "Processando…" : detail.archived_at ? "Restaurar empresa" : "Arquivar empresa"}
          </Button>
        </div>
      </header>

      {conflict ? (
        <div className="border border-broken/30 bg-tint-broken px-3 py-2" role="alert">
          <p className="text-[var(--text-sm)] text-broken-fg">{conflict.message} (atual: v{conflict.currentVersion}; você editou a v{detail.version})</p>
          <p className="mt-1 text-[var(--text-xs)] text-muted">Seu rascunho foi preservado nos campos abaixo — recarregue para ver o que mudou e reaplique conscientemente.</p>
          <Button variant="secondary" className="mt-2" onClick={load}>Recarregar dados atuais (descarta o rascunho)</Button>
        </div>
      ) : null}

      <Decomposition assessment={detail.assessment} />

      <section aria-label="Cadastro" className="border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="eyebrow">Cadastro</span>
          <Button variant="primary" onClick={save} disabled={saving || !!detail.archived_at}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </header>
        <fieldset className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3" disabled={saving}>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Nome</span>
            <Input value={draft.name} onChange={set("name")} aria-label="Nome" />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Domínio</span>
            <Input value={draft.domain} onChange={set("domain")} placeholder="empresa.com.br" aria-label="Domínio" />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Segmento</span>
            <Input value={draft.segment} onChange={set("segment")} aria-label="Segmento" />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Colaboradores</span>
            <Input type="number" min={0} value={draft.employees} onChange={set("employees")} aria-label="Colaboradores" />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">UF</span>
            <Select value={draft.uf} onChange={set("uf")} aria-label="UF">
              <option value="">Não informado</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Status operacional</span>
            <Select value={draft.operating_status} onChange={set("operating_status")} aria-label="Status operacional">
              <option value="">Não informado</option>
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </Select>
          </label>
          {triBool("operates_in_brazil", "Opera no Brasil")}
          {triBool("hr_structured", "RH estruturado")}
          {triBool("multi_region", "Multi-região")}
          {triBool("has_benefits", "Possui benefícios")}
          {triBool("seeks_benefit_differentiation", "Busca diferenciação")}
          {triBool("renewed_24_plus", "Renovou ≥ 24 meses")}
          {level("growth", "Crescimento")}
          {level("employer_branding", "Employer branding")}
          {level("retention_pain", "Dor de retenção")}
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Renovação provável</span>
            <Select value={draft.renewal_window} onChange={set("renewal_window")} aria-label="Renovação provável">
              {RENEWALS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </Select>
          </label>
        </fieldset>
      </section>

      <section aria-label={`Sinais (${detail.signals.length})`} className="border border-line bg-panel">
        <header className="border-b border-line px-4 py-2"><span className="eyebrow">Sinais ({detail.signals.length})</span></header>
        <ul className="divide-y divide-line2">
          {detail.signals.map((s) => (
            <li key={s.id} className="px-4 py-2">
              <p className="text-[var(--text-sm)]">{s.evidence_text}</p>
              <p className="mono mt-0.5 text-[var(--text-2xs)] text-faint">
                {s.signal_type} · força {s.strength} · {s.observed_on ?? "sem data"} · {s.source_allowed === true ? "fonte permitida" : s.source_allowed === false ? "fonte bloqueada" : "uso não declarado"}
              </p>
            </li>
          ))}
          {detail.signals.length === 0 ? <li className="px-4 py-3 text-[var(--text-sm)] text-muted">Nenhum sinal cadastrado.</li> : null}
        </ul>
      </section>

      <section aria-label={`Contatos (${detail.contacts.length})`} className="border border-line bg-panel">
        <header className="border-b border-line px-4 py-2"><span className="eyebrow">Contatos ({detail.contacts.length})</span></header>
        <ul className="divide-y divide-line2">
          {detail.contacts.map((c) => (
            <li key={c.id} className="px-4 py-2 text-[var(--text-sm)]">
              {c.full_name ?? "Canal sem pessoa identificada"} {c.job_title ? `· ${c.job_title}` : ""}
              <span className="mono ml-2 text-[var(--text-2xs)] text-faint">
                {c.channel_type} · {c.channel_value} · {c.source_allowed === true ? "permitido" : c.source_allowed === false ? "bloqueado" : "não declarado"}
              </span>
            </li>
          ))}
          {detail.contacts.length === 0 ? <li className="px-4 py-3 text-[var(--text-sm)] text-muted">Nenhum contato cadastrado.</li> : null}
        </ul>
      </section>

      <section aria-label="Histórico" className="border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="eyebrow">Histórico</span>
          <Select value={historyField} onChange={(e) => setHistoryField(e.target.value)} aria-label="Filtrar histórico por campo">
            <option value="">Todos os campos</option>
            {["name","domain","segment","employees","uf","operates_in_brazil","hr_structured","has_benefits","seeks_benefit_differentiation","multi_region","growth","employer_branding","retention_pain","renewal_window","renewed_24_plus","operating_status","source_label","archived_at"].map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </header>
        <ul className="divide-y divide-line2">
          {(history ?? []).map((h) => (
            <li key={h.id} className="px-4 py-2">
              <p className="mono text-[var(--text-2xs)] text-faint">
                {new Date(h.occurred_at).toLocaleString("pt-BR")} · {h.source} · {h.operation}
              </p>
              {(h.changed_fields ?? []).map((f) => (
                <p key={f} className="mt-0.5 text-[var(--text-xs)]">
                  <span className="text-muted">{f}:</span>{" "}
                  <span className="mono">{JSON.stringify(h.before?.[f] ?? null)}</span>
                  <span className="text-muted"> → </span>
                  <span className="mono">{JSON.stringify(h.after?.[f] ?? null)}</span>
                </p>
              ))}
            </li>
          ))}
          {history && history.length === 0 ? <li className="px-4 py-3 text-[var(--text-sm)] text-muted">Sem eventos com este filtro.</li> : null}
        </ul>
      </section>
    </div>
  );
}
