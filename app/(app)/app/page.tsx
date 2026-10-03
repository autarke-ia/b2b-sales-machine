"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, EmptyState, ErrorState, Loading } from "@/components/ui/primitives";

interface DatasetRow {
  id: string;
  name: string;
  kind: "demo" | "user";
  default_as_of: string;
  data_revision: number;
}

/** Seleção de base compartilhada (doc 05 §3): demo em destaque; "Nova base" cria
 * agrupamento vazio com defaults — nunca organização/assinatura. */
export default function DatasetsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => api<DatasetRow[]>("/datasets?page_size=100").then((r) => setRows(r.data)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="eyebrow">Bases</div>
      <h1 className="mt-2 text-[var(--text-2xl)] font-light">Selecionar base</h1>
      {error ? <div className="mt-4"><ErrorState message={error} onRetry={load} /></div> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nenhuma base disponível" hint="Todas as bases do ambiente aparecem aqui para todos os usuários." />
        </div>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border border-line bg-panel">
          {rows.map((d) => (
            <li key={d.id}>
              <button
                className="interactive flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => router.push(`/app/${d.id}/companies`)}
              >
                <span>
                  <span className="text-[var(--text-base)]">{d.name}</span>
                  {d.kind === "demo" ? (
                    <span className="ml-2 bg-hover px-1.5 py-0.5 align-middle text-[var(--text-2xs)] text-muted">Dados fictícios</span>
                  ) : null}
                </span>
                <span className="mono text-[var(--text-2xs)] text-faint">
                  as_of {d.default_as_of} · rev {d.data_revision}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">
        <Button
          variant="secondary"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              const name = `Base de ${new Date().toLocaleDateString("pt-BR")}`;
              const res = await api<DatasetRow>("/datasets", {
                method: "POST",
                body: { name },
                idempotencyKey: `ui-${crypto.randomUUID()}`,
              });
              router.push(`/app/${res.data.id}/companies`);
            } catch (e) {
              setError((e as Error).message);
              setCreating(false);
            }
          }}
        >
          {creating ? "Criando…" : "Nova base"}
        </Button>
      </div>
    </div>
  );
}
