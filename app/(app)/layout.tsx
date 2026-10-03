"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Building2, LogOut, Settings2, Timer, Trophy } from "lucide-react";
import { Button, Loading } from "@/components/ui/primitives";
import { api, ensureSession, logout, user } from "@/lib/api";

interface DatasetRow {
  id: string;
  name: string;
  kind: "demo" | "user";
  default_as_of: string;
}

/**
 * Shell autenticado: sidebar ink (peça-clímax), badge "Dados fictícios" na demo
 * (doc 05 §3). Sem sessão → /login preservando retorno.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ datasetId?: string }>();
  const datasetId = params?.datasetId;
  const [dataset, setDataset] = useState<DatasetRow | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await ensureSession();
      if (!alive) return;
      if (!u) {
        router.replace(`/login?retorno=${encodeURIComponent(pathname)}`);
        return;
      }
      if (datasetId) {
        try {
          const res = await api<DatasetRow>(`/datasets/${datasetId}`);
          if (alive) setDataset(res.data);
        } catch {
          if (alive) router.replace("/app");
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [datasetId, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading label="Verificando sessão…" />
      </div>
    );
  }

  const base = datasetId ? `/app/${datasetId}` : "/app";
  const nav = [
    { href: `${base}/companies`, label: "Empresas", icon: Building2 },
    { href: `${base}/ranking`, label: "Ranking", icon: Trophy },
    { href: `${base}/rules`, label: "Regras", icon: Settings2 },
    { href: `${base}/metrics`, label: "Métricas", icon: Timer },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="on-ink flex w-60 shrink-0 flex-col border-r border-ink-line">
        <div className="border-b border-ink-line p-4">
          <div className="eyebrow">Autarkeia</div>
          <Link href="/app" className="mt-2 block text-[var(--text-base)] text-ink-fg">
            B2B Sales Machine
          </Link>
          {dataset ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[var(--text-xs)] text-muted">{dataset.name}</span>
              {dataset.kind === "demo" ? (
                <span className="bg-hover-ink px-1.5 py-0.5 text-[var(--text-2xs)] text-muted">Dados fictícios</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <nav className="flex-1 space-y-0.5 p-2 text-[var(--text-sm)]">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`interactive-ink flex items-center gap-2.5 px-2.5 py-1.5 ${active ? "bg-hover-ink text-ink-fg" : "text-muted"}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-ink-line p-3">
          <p className="text-[var(--text-xs)] text-muted">{user()?.name}</p>
          <Button
            variant="ghost"
            className="mt-1 text-muted"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut className="size-3.5" aria-hidden /> Sair
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-bg p-6">{children}</main>
    </div>
  );
}
