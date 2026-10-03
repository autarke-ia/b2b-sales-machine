"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, apiPagination } from "@/lib/api";
import { EmptyState, ErrorState, Input, Loading, Select } from "@/components/ui/primitives";
import { GateBadge } from "@/components/badges";
import { Pager } from "@/components/pager";

interface CompanyRow {
  id: string;
  external_id: string;
  name: string;
  segment: string | null;
  uf: string | null;
  employees: number | null;
  operating_status: "active" | "inactive" | "unknown";
  archived_at: string | null;
}

interface ListState {
  rows: CompanyRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

/** Lista de empresas (doc 05 §4): todas as contas, filtros AND, gate visível por
 * linha, visão de arquivadas para restauração futura. */
export default function CompaniesPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const [state, setState] = useState<ListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [icp, setIcp] = useState("");
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), page_size: "25" });
    if (q) p.set("q", q);
    if (uf) p.set("uf", uf);
    if (icp) p.set("icp_state", icp);
    if (archived) p.set("include_archived", "true");
    return p.toString().replace(/=(&|$)/g, "$1");
  }, [q, uf, icp, page, archived]);

  const load = useCallback(() => {
    setState(null);
    setError(null);
    api<CompanyRow[]>(`/datasets/${datasetId}/companies?${query}`)
      .then((res) => setState({ rows: res.data, ...apiPagination(res) }))
      .catch((e) => setError(e.message));
  }, [datasetId, query]);

  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Empresas</div>
          <h1 className="mt-2 text-[var(--text-2xl)] font-light">Contas da base</h1>
        </div>
        <p className="mono text-[var(--text-2xs)] text-faint">{state ? `${state.total} registros` : ""}</p>
      </div>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <Input
          className="max-w-xs"
          placeholder="Buscar nome ou ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar por nome ou external_id"
        />
        <Select value={icp} onChange={(e) => { setIcp(e.target.value); setPage(1); }} aria-label="Filtrar por estado do ICP">
          <option value="">ICP: todos</option>
          <option value="in">Dentro do ICP</option>
          <option value="pending">Pendente</option>
          <option value="out">Fora do ICP</option>
        </Select>
        <Select value={uf} onChange={(e) => { setUf(e.target.value); setPage(1); }} aria-label="Filtrar por UF">
          <option value="">UF: todas</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-[var(--text-xs)] text-muted">
          <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} />
          ver arquivadas
        </label>
      </form>

      {error ? <div className="mt-4"><ErrorState message={error} onRetry={load} /></div> : null}
      {!state && !error ? <Loading /> : null}
      {state && state.rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhuma empresa com estes filtros"
            hint={archived ? "Sem registros arquivados." : "Ajuste a busca ou os filtros; contas fora do ICP continuam listadas aqui."}
          />
        </div>
      ) : null}

      {state && state.rows.length > 0 ? (
        <>
          <div className="mt-4 overflow-x-auto border border-line bg-panel">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[var(--text-2xs)] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">Segmento</th>
                  <th className="px-2 py-2 font-medium">UF</th>
                  <th className="px-2 py-2 text-right font-medium">Colab.</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((c) => (
                  <tr key={c.id} className="interactive border-b border-line2 last:border-b-0">
                    <td className="mono px-4 py-2 text-[var(--text-xs)] text-muted">{c.external_id}</td>
                    <td className="px-2 py-2">
                      <Link href={`/app/${datasetId}/companies/${c.id}`} className="hover:underline">
                        {c.name}
                        {c.archived_at ? <span className="ml-2 text-[var(--text-2xs)] text-broken-fg">arquivada</span> : null}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-[var(--text-sm)] text-muted">{c.segment ?? "—"}</td>
                    <td className="px-2 py-2 text-[var(--text-sm)]">{c.uf ?? "—"}</td>
                    <td className="num px-2 py-2 text-right text-[var(--text-sm)]">{c.employees ?? "—"}</td>
                    <td className="px-4 py-2">{c.archived_at ? <span className="text-[var(--text-2xs)] text-broken-fg">arquivada</span> : c.operating_status === "inactive" ? <GateBadge state="out" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={state.page} totalPages={state.total_pages} onPage={setPage} />
        </>
      ) : null}
    </div>
  );
}

