/**
 * 0.4T — Banco e auditoria (AUD02, AUD03, INV-1, INV-2). Executa contra o banco dev real;
 * sem DATABASE_URL, a suíte é pulada (fundação não depende de rede para typecheck/lint).
 */
import { describe, expect, test } from "vitest";
import { PrismaClient } from "@prisma/client";

const appUrl = process.env.DATABASE_URL;
const describeIfDb = appUrl ? describe : describe.skip;

describeIfDb("Trilha append-only e privilégios", () => {
  const prisma = new PrismaClient();

  test("AUD03/INV-2 — credencial da app não escreve na trilha", async () => {
    for (const statement of [
      `UPDATE "AuditEvent" SET operation = 'tampered'`,
      `DELETE FROM "AuditEvent"`,
      `TRUNCATE "AuditEvent"`,
      `INSERT INTO "AuditEvent" ("id","entity_type","entity_id","operation","source") VALUES (gen_random_uuid(),'x','00000000-0000-0000-0000-000000000000','create','manual')`,
    ]) {
      await expect(prisma.$executeRawUnsafe(statement)).rejects.toThrow();
    }
    const canInsert = await prisma.$queryRaw<Array<{ v: boolean }>>`
      SELECT has_table_privilege(current_user, 'AuditEvent', 'INSERT') AS v`;
    expect(canInsert[0].v).toBe(false);
    const canUpdate = await prisma.$queryRaw<Array<{ v: boolean }>>`
      SELECT has_table_privilege(current_user, 'AuditEvent', 'UPDATE') AS v`;
    expect(canUpdate[0].v).toBe(false);
  });

  test("AUD02 — mutação de negócio sem ator válido falha fechada e reverte", async () => {
    const company = await prisma.company.findFirst({
      where: { archived_at: null },
      select: { id: true, name: true, dataset_id: true },
    });
    if (!company) throw new Error("Seed não carregado — rode pnpm db:seed antes dos testes de banco.");

    await expect(
      prisma.$transaction([
        prisma.$executeRawUnsafe(
          `UPDATE "Company" SET name = name || ' — alteração sem ator' WHERE id = '${company.id}'`,
        ),
      ]),
    ).rejects.toThrow(/AUDIT_ACTOR_MISSING/);

    const after = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { name: true, version: true },
    });
    expect(after.name).toBe(company.name);
  });

  test("INV-1 — nenhum evento de negócio sem ator", async () => {
    const nulls = await prisma.auditEvent.count({ where: { actor_user_id: null } });
    expect(nulls).toBe(0);
  });
});
