"use client";

import { Badge } from "./ui/primitives";

/** Estado do gate com cor + TEXTO (nunca só cor — doc 05 §1). */
export function GateBadge({ state }: { state: "in" | "out" | "pending" }) {
  if (state === "in") return <Badge tone="ok">Dentro do ICP</Badge>;
  if (state === "out") return <Badge tone="bad">Fora do ICP</Badge>;
  return <Badge tone="wait">Pendente</Badge>;
}

export function BandBadge({ band }: { band: "high" | "medium" | "low" }) {
  const label = { high: "Alta", medium: "Média", low: "Baixa" }[band];
  const tone = { high: "ok", medium: "wait", low: "neutral" } as const;
  return <Badge tone={tone[band]}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: "preliminary" | "reviewed" }) {
  return status === "reviewed" ? (
    <Badge tone="ok">Revisado</Badge>
  ) : (
    <Badge tone="broken">Preliminar</Badge>
  );
}

/** Fator do critério — texto além da cor (0/0,5/1/desconhecido). */
export function FactorText({ factor }: { factor: number | null }) {
  if (factor === null) return <span className="text-faint">—</span>;
  if (factor === 1) return <span className="text-ok-fg">1</span>;
  if (factor === 0) return <span className="text-muted">0</span>;
  return <span className="text-wait-fg">{factor.toFixed(2).replace(".", ",")}</span>;
}
