/**
 * Normalização de importação — domínio PURO (doc 01 §5). Sem IO: recebe texto,
 * devolve valor normalizado ou Erro tipado com a mensagem de exibição.
 * Regras: trim + NFC; booleanos true/false/Sim/Não/1/0 (vazio e "Não identificado"
 * → null); níveis/renovação/status mapeados; datas ISO ou DD/MM/YYYY; inteiros
 * inequívocos (nunca adivinhar 1.234); fórmulas de planilha REJEITADAS.
 */

export class NormalizeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const clean = (raw: string): string => raw.normalize("NFC").trim();

export function isFormulaCell(raw: string): boolean {
  return /^[=+\-@\t\r]/.test(clean(raw)) && clean(raw).length > 1;
}

export function normalizeBool(raw: string): boolean | null {
  const v = clean(raw).toLowerCase();
  if (v === "" || v === "não identificado" || v === "nao identificado") return null;
  if (["true", "sim", "1"].includes(v)) return true;
  if (["false", "não", "nao", "0"].includes(v)) return false;
  throw new NormalizeError("INVALID_BOOLEAN", `Booleano inválido: "${raw}" (use true/false, Sim/Não ou 1/0)`);
}

export function normalizeLevel(raw: string): "low" | "medium" | "high" | null {
  const v = clean(raw).toLowerCase();
  if (v === "" || v === "não identificado" || v === "nao identificado") return null;
  const map: Record<string, "low" | "medium" | "high"> = { baixo: "low", baixa: "low", médio: "medium", medio: "medium", média: "medium", media: "medium", alto: "high", alta: "high" };
  if (v in map) return map[v]!;
  if (["low", "medium", "high"].includes(v)) return v as "low" | "medium" | "high";
  throw new NormalizeError("INVALID_LEVEL", `Nível inválido: "${raw}" (Baixo/Médio/Alto)`);
}

export function normalizeRenewal(raw: string): "m0_3" | "m4_6" | "m7_12" | "over_12" | null {
  const v = clean(raw).toLowerCase().replace(/\s+/g, " ");
  if (v === "" || v.includes("desconhec")) return null;
  const map: Array<[RegExp, "m0_3" | "m4_6" | "m7_12" | "over_12"]> = [
    [/^(0[ –-]?3|0–3|0-3)/, "m0_3"],
    [/^(4[ –-]?6|4–6|4-6)/, "m4_6"],
    [/^(7[ –-]?12|7–12|7-12)/, "m7_12"],
    [/^(>|mais de\s+)\s*12/, "over_12"],
  ];
  for (const [re, out] of map) if (re.test(v)) return out;
  if (["m0_3", "m4_6", "m7_12", "over_12"].includes(v)) return v as "m0_3" | "m4_6" | "m7_12" | "over_12";
  throw new NormalizeError("INVALID_RENEWAL", `Renovação inválida: "${raw}" (0–3, 4–6, 7–12 ou >12 meses)`);
}

export function normalizeStatus(raw: string): "active" | "inactive" | "unknown" {
  const v = clean(raw).toLowerCase();
  if (v === "") return "unknown";
  if (["ativa", "active"].includes(v)) return "active";
  if (["inativa", "encerrada", "inactive"].includes(v)) return "inactive";
  if (v === "unknown" || v === "não identificad" + "o") return "unknown";
  throw new NormalizeError("INVALID_STATUS", `Status inválido: "${raw}" (Ativa/Inativa/Encerrada)`);
}

export function normalizeDate(raw: string): string | null {
  const v = clean(raw);
  if (v === "") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return validateDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) return validateDate(Number(br[3]), Number(br[2]), Number(br[1]));
  throw new NormalizeError("INVALID_DATE", `Data inválida: "${raw}" (use AAAA-MM-DD ou DD/MM/AAAA)`);
}

function validateDate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new NormalizeError("INVALID_DATE", `Data inexistente: ${y}-${m}-${d}`);
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeInt(raw: string, opts: { min?: number; max?: number }): number | null {
  const v = clean(raw);
  if (v === "") return null;
  if (!/^-?\d+$/.test(v.replace(/\s/g, ""))) {
    throw new NormalizeError("INVALID_INT", `Inteiro inválido: "${raw}" (sem separador de milhar; frações não são aceitas)`);
  }
  const n = Number(v.replace(/\s/g, ""));
  if (opts.min !== undefined && n < opts.min) throw new NormalizeError("INVALID_INT", `Valor abaixo do mínimo: ${n} < ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new NormalizeError("INVALID_INT", `Valor acima do máximo: ${n} > ${opts.max}`);
  return n;
}

/** Detecta separador quando TODA coluna do cabeçalho é conhecida (doc 01 §5):
 * aceita subconjunto das colunas canônicas; coluna desconhecida em ambos os
 * separadores é erro — nunca adivinha. */
export function detectSeparator(sample: string, isKnownColumn: (h: string) => boolean): string {
  const first = stripBom(sample).split(/\r?\n/)[0] ?? "";
  for (const sep of [",", ";"]) {
    const cols = first.split(sep).map(normalizeHeader).filter((c) => c !== "");
    if (cols.length > 1 && cols.every(isKnownColumn)) return sep;
  }
  throw new NormalizeError("UNDETECTABLE_SEPARATOR", "Cabeçalho não reconhecido: colunas desconhecidas ou separador ambíguo (use , ou ;)");
}

export function normalizeHeader(raw: string): string {
  return clean(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Parse CSV mínimo com aspas — suficiente para os templates do produto. */
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Remove BOM se presente. */
export function stripBom(text: string): string {
  return text.startsWith("\ufeff") ? text.slice(1) : text;
}
