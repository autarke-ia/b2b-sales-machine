/**
 * 0.5T — Seed idempotente e usuários (IMP05, DATA01). Executa contra o banco dev real;
 * sem DATABASE_URL, é pulada.
 */
import { describe, expect, test } from "vitest";
import { PrismaClient } from "@prisma/client";

const appUrl = process.env.DATABASE_URL;
const describeIfDb = appUrl ? describe : describe.skip;

const TECHNICAL_ACTOR_ID = "3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9";

describeIfDb("Seed idempotente", () => {
  const prisma = new PrismaClient();

  test("DATA01 — dataset demo carregado com contagens do pacote", async () => {
    const demo = await prisma.dataset.findFirst({
      where: { kind: "demo" },
      select: { id: true, default_as_of: true, _count: { select: { companies: true, signals: true, contacts: true, opportunities: true } } },
    });
    expect(demo).not.toBeNull();
    expect(demo!._count).toEqual({ companies: 120, signals: 287, contacts: 120, opportunities: 70 });
    expect(demo!.default_as_of.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  test("IMP05 — rodar o seed duas vezes não duplica nem gera audit de no-op", async () => {
    const { execFileSync } = await import("node:child_process");
    // Escopo source='seed': o no-op é sobre o EFEITO do seed; eventos 'manual' de
    // outras suítes (datasets de teste) não são atribuíveis a esta execução.
    const before = await prisma.auditEvent.count({ where: { source: "seed" } });
    execFileSync("pnpm", ["db:seed"], { shell: true, stdio: "pipe" });
    const after = await prisma.auditEvent.count({ where: { source: "seed" } });
    expect(after).toBe(before);
    const demo = await prisma.dataset.findFirst({
      where: { kind: "demo" },
      select: { _count: { select: { companies: true } } },
    });
    expect(demo!._count.companies).toBe(120);
  });

  test("Ruleset publicado ativo existe e INV-14 — nenhum rascunho pontua", async () => {
    const demo = await prisma.dataset.findFirstOrThrow({ where: { kind: "demo" }, select: { active_ruleset_id: true } });
    const ruleset = await prisma.ruleset.findUniqueOrThrow({ where: { id: demo.active_ruleset_id! } });
    expect(ruleset.status).toBe("published");
  });

  test("Ator técnico existe, sem login, e trilha seed tem autoria", async () => {
    const actor = await prisma.user.findUnique({ where: { id: TECHNICAL_ACTOR_ID } });
    expect(actor?.is_technical).toBe(true);
    expect(actor?.active).toBe(false);
    const seeded = await prisma.auditEvent.count({ where: { source: "seed" } });
    expect(seeded).toBeGreaterThan(0);
  });
});
