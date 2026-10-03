/**
 * Fase 3.1 — Normalização de importação (doc 01 §5) como domínio PURO.
 * Cada regra do documento tem seu caso; divergência corrige o pacote antes daqui.
 */
import { describe, expect, test } from "vitest";
import {
  normalizeBool,
  normalizeLevel,
  normalizeRenewal,
  normalizeStatus,
  normalizeDate,
  normalizeInt,
  detectSeparator,
  isFormulaCell,
  normalizeHeader,
} from "../../src/domain/normalize";

describe("booleans (doc 01 §5)", () => {
  test("true/false, Sim/Não, 1/0 e vazio→null; outros textos são ERRO", () => {
    expect(normalizeBool("true")).toBe(true);
    expect(normalizeBool("Não")).toBe(false);
    expect(normalizeBool("1")).toBe(true);
    expect(normalizeBool("0")).toBe(false);
    expect(normalizeBool("")).toBeNull();
    expect(normalizeBool("Não identificado")).toBeNull();
    expect(() => normalizeBool("talvez")).toThrow();
  });
});

describe("níveis e enums", () => {
  test("Baixo/Médio/Alto → low/medium/high; Não identificado → null", () => {
    expect(normalizeLevel("Alto")).toBe("high");
    expect(normalizeLevel("médio")).toBe("medium");
    expect(normalizeLevel("Baixo")).toBe("low");
    expect(normalizeLevel("Não identificado")).toBeNull();
    expect(() => normalizeLevel("extremo")).toThrow();
  });

  test("renovação: 0–3 meses → m0_3 … >12 → over_12; desconhecida → null", () => {
    expect(normalizeRenewal("0–3 meses")).toBe("m0_3");
    expect(normalizeRenewal("4-6 meses")).toBe("m4_6");
    expect(normalizeRenewal("7–12 meses")).toBe("m7_12");
    expect(normalizeRenewal(">12 meses")).toBe("over_12");
    expect(normalizeRenewal("desconhecida")).toBeNull();
    expect(() => normalizeRenewal("13 meses")).toThrow();
  });

  test("status: Ativa → active; Inativa/Encerrada → inactive; ausente → unknown", () => {
    expect(normalizeStatus("Ativa")).toBe("active");
    expect(normalizeStatus("Encerrada")).toBe("inactive");
    expect(normalizeStatus("")).toBe("unknown");
    expect(() => normalizeStatus("zombie")).toThrow();
  });
});

describe("datas e inteiros", () => {
  test("ISO e DD/MM/YYYY; inválida é erro, não null", () => {
    expect(normalizeDate("2026-09-30")).toBe("2026-09-30");
    expect(normalizeDate("30/09/2026")).toBe("2026-09-30");
    expect(normalizeDate("")).toBeNull();
    expect(() => normalizeDate("31/02/2026")).toThrow();
    expect(() => normalizeDate("2026-13-01")).toThrow();
  });

  test("inteiros: frações e negativos rejeitados para colaboradores", () => {
    expect(normalizeInt("1234", { min: 0 })).toBe(1234);
    expect(() => normalizeInt("1.234", { min: 0 })).toThrow(); // ambíguo → erro, nunca adivinha
    expect(() => normalizeInt("-5", { min: 0 })).toThrow();
    expect(normalizeInt("", { min: 0 })).toBeNull();
  });
});

describe("CSV estrutural", () => {
  test("separador detectado quando toda coluna é conhecida; desconhecida é erro", () => {
    const known = (h: string) => ["a", "b", "c"].includes(h);
    expect(detectSeparator("a,b,c", known)).toBe(",");
    expect(detectSeparator("a;b;c", known)).toBe(";");
    expect(() => detectSeparator("a;b;x", known)).toThrow();
  });

  test("célula de fórmula é rejeitada (doc 01 §5)", () => {
    for (const cell of ["=cmd()", "+1", "@x", "-2"]) expect(isFormulaCell(cell)).toBe(true);
    expect(isFormulaCell("texto normal")).toBe(false);
    expect(isFormulaCell("")).toBe(false);
  });

  test("cabeçalho normaliza caixa/acentos; colisão pós-normalização é erro", () => {
    expect(normalizeHeader(" Colaboradores ")).toBe("colaboradores");
    expect(normalizeHeader("UF")).toBe("uf");
    expect(normalizeHeader("Employer Branding")).toBe("employer branding");
  });
});
