/**
 * Extração de sugestões — domínio PURO (doc 06). A "interpretação" do
 * protótipo é heurística determinística sobre os sinais permitidos: encontra
 * palavra-chave, propõe valor tipado e cita TRECHO LITERAL da evidência (o
 * backend valida a contenção exata — INV-10). Sinais são DADOS, nunca
 * instruções (AI04): nenhum texto altera regra, peso ou score.
 */

export const SUGGESTIBLE_FIELDS = [
  "employees",
  "uf",
  "operates_in_brazil",
  "hr_structured",
  "has_benefits",
  "seeks_benefit_differentiation",
  "multi_region",
  "growth",
  "employer_branding",
  "retention_pain",
  "renewal_window",
  "renewed_24_plus",
  "operating_status",
] as const;

export type SuggestibleField = (typeof SUGGESTIBLE_FIELDS)[number];

export interface ProviderSignalInput {
  id: string;
  version: number;
  evidence_text: string;
  signal_type: string;
  observed_on: string | null;
}

export interface ProviderCompanyInput {
  id: string;
  external_id: string;
  fields: Record<string, unknown>;
}

/** Saída bruta do provedor — o backend adiciona IDs/estados e RECALCULA a relação. */
export interface RawProposal {
  field: string;
  value: unknown;
  signal_id: string;
  quote: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

/** Erro tipado de provedor: vira `failed` explícito do item, nunca 500 mudo. */
export class ProviderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface Rule {
  re: RegExp;
  field: SuggestibleField;
  value: unknown;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

const RULES: Rule[] = [
  { re: /encerrou|encerramento|fal[iê]ncia|fechou as portas/i, field: "operating_status", value: "inactive", confidence: "high", rationale: "Evidência descreve encerramento de atividades." },
  { re: /expans[ãa]o (do time|da opera[çc][ãa]o|acelerada)|crescimento acelerado|contratando em massa/i, field: "growth", value: "high", confidence: "high", rationale: "Texto indica crescimento forte/expansão." },
  { re: /vagas? (abertas? )?(em|no|para o) RH|estruturando (o|a) RH|RH estruturado|área de RH dedicada/i, field: "hr_structured", value: true, confidence: "high", rationale: "Texto indica RH estruturado ou em estruturação." },
  { re: /novas? filiais|multi-?regi[ãa]o|presente em (v[áa]rios|diversos) estados|modelo distrib u[íi]do|equipes? distrib u[íi]das/i, field: "multi_region", value: true, confidence: "medium", rationale: "Texto indica operação multi-região/distribuída." },
  { re: /benef[íi]cios? (atrativos|diferenciados|competitivos)|pacote de benef[íi]cios/i, field: "has_benefits", value: true, confidence: "medium", rationale: "Texto menciona benefícios como diferencial." },
  { re: /atrair e reter talentos|diferencia[çc][ãa]o (de|na) (marca empregadora|proposta)/i, field: "seeks_benefit_differentiation", value: true, confidence: "medium", rationale: "Texto indica busca ativa por diferenciação." },
  { re: /renova[çc][ãa]o de contrato (prevista|pr[óo]xima)|janela de renova[çc][ãa]o/i, field: "renewal_window", value: "m4_6", confidence: "low", rationale: "Texto menciona renovação em horizonte curto." },
  { re: /rotatividade alta|turnover elevado|dificuldade de reten[çc][ãa]o/i, field: "retention_pain", value: "high", confidence: "medium", rationale: "Texto descreve dor de retenção." },
];

/** Heurística do provider fixture: uma proposta por regra que casar, citando
 * trecho literal centrado na palavra-chave. Marcador "[fail]" força erro
 * (determinismo para AI06 — falha parcial explícita, nunca silenciosa). */
export function fixtureProposals(company: ProviderCompanyInput, signals: ProviderSignalInput[]): RawProposal[] {
  const out: RawProposal[] = [];
  for (const s of signals) {
    if (s.evidence_text.includes("[fail]")) {
      throw new ProviderError("FIXTURE_FORCED_FAILURE", `Sinal ${s.id} marcado com [fail] para teste de falha parcial.`);
    }
    if (/crescimento/i.test(s.evidence_text) && !/acelerado/i.test(s.evidence_text) && !/expans[ãa]o/i.test(s.evidence_text)) {
      out.push({
        field: "growth",
        value: null,
        signal_id: s.id,
        quote: quoteAround(s.evidence_text, /crescimento/i),
        confidence: "low",
        rationale: "Menciona crescimento sem intensidade — insuficiente para propor nível.",
      });
      continue;
    }
    for (const rule of RULES) {
      const m = rule.re.exec(s.evidence_text);
      if (m) {
        out.push({
          field: rule.field,
          value: rule.value,
          signal_id: s.id,
          quote: quoteAround(s.evidence_text, rule.re),
          confidence: rule.confidence,
          rationale: rule.rationale,
        });
      }
    }
  }
  return dedupeByField(out);
}

/** Trecho literal (substring exata) de até ~90 chars centrado no match. */
export function quoteAround(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m || m.index < 0) return text.slice(0, 90);
  const start = Math.max(0, m.index - 35);
  const end = Math.min(text.length, m.index + m[0].length + 55);
  return text.slice(start, end).trim();
}

function dedupeByField(proposals: RawProposal[]): RawProposal[] {
  const seen = new Set<string>();
  const out: RawProposal[] = [];
  for (const p of proposals) {
    if (seen.has(p.field)) continue;
    seen.add(p.field);
    out.push(p);
  }
  return out;
}

/** Relação RECALCULADA pelo backend (doc 06 §4) — nunca confiamos no rótulo
 * do modelo: compara valor proposto normalizado com o valor vigente. */
export function computeRelation(field: string, proposed: unknown, current: unknown): "confirmation" | "contradiction" | "fill" | "inconclusive" {
  if (proposed === null || proposed === undefined) return "inconclusive";
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
  if (current === null || current === undefined) return "fill";
  return norm(proposed) === norm(current) ? "confirmation" : "contradiction";
}

/** Tipo do valor por campo — saída com tipo errado é descartada (AI05 análogo). */
export function valueMatchesField(field: string, value: unknown): boolean {
  if (value === null) return true;
  switch (field) {
    case "employees":
      return Number.isInteger(value) && (value as number) >= 0;
    case "uf":
      return typeof value === "string" && /^[A-Z]{2}$/.test(value);
    case "operates_in_brazil":
    case "hr_structured":
    case "has_benefits":
    case "seeks_benefit_differentiation":
    case "multi_region":
    case "renewed_24_plus":
      return typeof value === "boolean";
    case "growth":
    case "employer_branding":
    case "retention_pain":
      return value === "low" || value === "medium" || value === "high";
    case "renewal_window":
      return ["m0_3", "m4_6", "m7_12", "over_12"].includes(value as string);
    case "operating_status":
      return value === "active" || value === "inactive";
    default:
      return false;
  }
}
