/**
 * Fase 3-B — CRUD relacionados (CRUD01–05 análogos) + regras versionadas (RULE01–04).
 * Usa base de teste própria; limpeza com credencial owner no afterAll.
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { describeIfDb } from "../helpers/db";
import * as loginRoute from "../../app/api/v1/auth/login/route";
import * as datasetsRoute from "../../app/api/v1/datasets/route";
import * as signalsRoute from "../../app/api/v1/datasets/[dataset_id]/signals/route";
import * as signalItemRoute from "../../app/api/v1/datasets/[dataset_id]/signals/[record_id]/route";
import * as signalArchiveRoute from "../../app/api/v1/datasets/[dataset_id]/signals/[record_id]/archive/route";
import * as signalHistoryRoute from "../../app/api/v1/datasets/[dataset_id]/signals/[record_id]/history/route";
import * as companiesRoute from "../../app/api/v1/datasets/[dataset_id]/companies/route";
import * as companyArchiveRoute from "../../app/api/v1/datasets/[dataset_id]/companies/[record_id]/archive/route";
import * as rulesetRoute from "../../app/api/v1/datasets/[dataset_id]/ruleset/route";
import * as draftsRoute from "../../app/api/v1/datasets/[dataset_id]/rulesets/drafts/route";
import * as publishRoute from "../../app/api/v1/datasets/[dataset_id]/rulesets/[ruleset_id]/publish/route";
import * as rulesHistoryRoute from "../../app/api/v1/datasets/[dataset_id]/rulesets/[ruleset_id]/history/route";
import * as rankingRoute from "../../app/api/v1/datasets/[dataset_id]/ranking/route";
import { call, err, login, ok, prisma, type SessionCtx } from "../helpers/routes";

let ctx: SessionCtx;
let datasetId: string;
let companyId: string;

const base = () => `/datasets/${datasetId}`;
const params = () => ({ dataset_id: datasetId });

beforeAll(async () => {
  ctx = await login(loginRoute.POST);
  const created = await call(datasetsRoute.POST, "/datasets", {
    method: "POST",
    body: { name: `Base 3B ${crypto.randomUUID().slice(0, 8)}` },
    session: ctx,
    headers: { "idempotency-key": `b3-${crypto.randomUUID()}` },
  });
  datasetId = (await ok<{ id: string }>(created)).data.id;
  const company = await call(companiesRoute.POST, `${base()}/companies`, {
    method: "POST",
    body: { external_id: "EMP-T", name: "Empresa Teste 3B", employees: 400, uf: "SP", hr_structured: true, operates_in_brazil: true, operating_status: "active" },
    session: ctx,
    headers: { "idempotency-key": `c-${crypto.randomUUID()}` },
  }, params());
  companyId = (await ok<{ id: string }>(company)).data.id;
});

afterAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATION_URL });
  try {
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.actor_user_id', '3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9', true), set_config('app.source', 'system', true)`);
      await tx.rankingSnapshot.deleteMany({ where: { dataset_id: datasetId } });
      await tx.assessment.deleteMany({ where: { dataset_id: datasetId } });
      await tx.importRow.deleteMany({ where: { batch: { dataset_id: datasetId } } });
      await tx.importBatch.deleteMany({ where: { dataset_id: datasetId } });
      await tx.sourceFile.deleteMany({ where: { dataset_id: datasetId } });
      await tx.opportunity.deleteMany({ where: { dataset_id: datasetId } });
      await tx.contact.deleteMany({ where: { dataset_id: datasetId } });
      await tx.signal.deleteMany({ where: { dataset_id: datasetId } });
      await tx.company.deleteMany({ where: { dataset_id: datasetId } });
      await tx.ruleset.deleteMany({ where: { dataset_id: datasetId } });
      await tx.dataset.delete({ where: { id: datasetId } });
    });
  } finally {
    await owner.$disconnect();
    await prisma.$disconnect();
  }
});

describeIfDb("Relacionados — CRUD versionado", () => {
  let signalId = "";

  test("cria sinal com FK composta e autoria da sessão; evento source=manual", async () => {
    const res = await call(signalsRoute.POST, `${base()}/signals`, {
      method: "POST",
      body: {
        company_external_id: "EMP-T",
        external_id: "SIG-T1",
        signal_type: "Contratação",
        evidence_text: "Vagas abertas no RH da empresa",
        strength: "high",
        observed_on: "2026-09-20",
        source_allowed: true,
      },
      session: ctx,
      headers: { "idempotency-key": `s-${crypto.randomUUID()}` },
    }, params());
    expect(res.status).toBe(201);
    const body = await ok<{ id: string; company_id: string; version: number }>(res);
    signalId = body.data.id;
    expect(body.data.company_id).toBe(companyId);
    const events = await prisma.auditEvent.findMany({ where: { entity_id: signalId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe("manual");
  });

  test("PATCH versionado: muda campo, incrementa versão, no-op não gera evento", async () => {
    const events0 = await prisma.auditEvent.count({ where: { entity_id: signalId } });
    const res = await call(signalItemRoute.PATCH, `${base()}/signals/${signalId}`, {
      method: "PATCH",
      body: { expected_version: 1, changes: { strength: "low" } },
      session: ctx,
    }, { ...params(), record_id: signalId });
    expect(res.status).toBe(200);
    const body = await ok<{ version: number; strength: string }>(res);
    expect(body.data.version).toBe(2);
    expect(body.data.strength).toBe("low");
    expect(await prisma.auditEvent.count({ where: { entity_id: signalId } })).toBe(events0 + 1);

    const noop = await call(signalItemRoute.PATCH, `${base()}/signals/${signalId}`, {
      method: "PATCH",
      body: { expected_version: 2, changes: { strength: "low" } },
      session: ctx,
    }, { ...params(), record_id: signalId });
    const noopBody = await ok<{ version: number }>(noop);
    expect(noopBody.data.version).toBe(2);
    expect(await prisma.auditEvent.count({ where: { entity_id: signalId } })).toBe(events0 + 1);

    const stale = await err(await call(signalItemRoute.PATCH, `${base()}/signals/${signalId}`, {
      method: "PATCH",
      body: { expected_version: 1, changes: { strength: "medium" } },
      session: ctx,
    }, { ...params(), record_id: signalId }));
    expect(stale.status).toBe(409);
    expect(stale.code).toBe("VERSION_CONFLICT");
  });

  test("histórico do sinal filtra por campo com before/after", async () => {
    const res = await call(signalHistoryRoute.GET, `${base()}/signals/${signalId}/history?field=strength`, { session: ctx }, { ...params(), record_id: signalId });
    const body = await ok<Array<{ changed_fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }>>(res);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0]!.before.strength).toBe("high");
    expect(body.data[0]!.after.strength).toBe("low");
  });

  test("CRUD05 — escrita bloqueada com pai arquivado; restauração reabilita", async () => {
    const cur = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    await call(companyArchiveRoute.POST, `${base()}/companies/${companyId}/archive`, {
      method: "POST", body: { archived: true, expected_version: cur.version }, session: ctx,
    }, { ...params(), record_id: companyId });
    const blocked = await err(await call(signalItemRoute.PATCH, `${base()}/signals/${signalId}`, {
      method: "PATCH", body: { expected_version: 2, changes: { strength: "medium" } }, session: ctx,
    }, { ...params(), record_id: signalId }));
    expect(blocked.status).toBe(422);
    const cur2 = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    await call(companyArchiveRoute.POST, `${base()}/companies/${companyId}/archive`, {
      method: "POST", body: { archived: false, expected_version: cur2.version }, session: ctx,
    }, { ...params(), record_id: companyId });
    const freed = await call(signalItemRoute.PATCH, `${base()}/signals/${signalId}`, {
      method: "PATCH", body: { expected_version: 2, changes: { strength: "medium" } }, session: ctx,
    }, { ...params(), record_id: signalId });
    expect(freed.status).toBe(200);
  });

  test("archive do sinal remove do cálculo (input_revision da empresa sobe)", async () => {
    const before = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const res = await call(signalArchiveRoute.POST, `${base()}/signals/${signalId}/archive`, {
      method: "POST", body: { archived: true, expected_version: 3 }, session: ctx,
    }, { ...params(), record_id: signalId });
    expect(res.status).toBe(200);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(after.input_revision).toBe(before.input_revision + 1);
  });
});

describeIfDb("RULE01-04 — regras versionadas", () => {
  test("RULE01 — soma ≠ 100 rejeita o rascunho", async () => {
    const active = await ok<{ config: Record<string, unknown> }>(
      await call(rulesetRoute.GET, `${base()}/ruleset`, { session: ctx }, params()),
    );
    const bad = structuredClone(active.data.config) as { icp: { weights: Record<string, number> } };
    bad.icp.weights.size = 19;
    const r = await err(await call(draftsRoute.POST, `${base()}/rulesets/drafts`, {
      method: "POST", body: { config: bad }, session: ctx, headers: { "idempotency-key": `r1-${crypto.randomUUID()}` },
    }, params()));
    expect(r.status).toBe(422);
  });

  test("rascunho → publicação muda ativa e o RANKING reage; publicada é imutável", async () => {
    const activeBefore = await ok<{ id: string; config: Record<string, unknown> }>(
      await call(rulesetRoute.GET, `${base()}/ruleset`, { session: ctx }, params()),
    );

    // Ranking com corte 60: EMP-T (400 colab, SP, RH, sem resto) → size 20+hr 14+region 8 = 42 < 60 → out (não ranqueada).
    const rankBefore = await ok<{ data: unknown[] }>(
      await call(rankingRoute.GET, `${base()}/ranking`, { session: ctx }, params()),
    );
    expect(rankBefore.data).toHaveLength(0);

    // Rascunho com corte 40: a mesma empresa passa a estar 'in' e ranqueada.
    const draftConfig = structuredClone(activeBefore.data.config) as { icp: { threshold: number } };
    draftConfig.icp.threshold = 40;
    const draft = await ok<{ id: string; status: string; base_ruleset_id: string | null }>(
      await call(draftsRoute.POST, `${base()}/rulesets/drafts`, {
        method: "POST", body: { config: draftConfig }, session: ctx, headers: { "idempotency-key": `r2-${crypto.randomUUID()}` },
      }, params()),
    );
    expect(draft.data.status).toBe("draft");
    expect(draft.data.base_ruleset_id).toBe(activeBefore.data.id);

    // RULE02 — publicação com ativa divergente → RULESET_CONFLICT.
    const wrongActive = await err(await call(publishRoute.POST, `${base()}/rulesets/${draft.data.id}/publish`, {
      method: "POST", body: { expected_active_ruleset_id: null }, session: ctx, headers: { "idempotency-key": `r3-${crypto.randomUUID()}` },
    }, { ...params(), ruleset_id: draft.data.id }));
    expect(wrongActive.status).toBe(409);
    expect(wrongActive.code).toBe("RULESET_CONFLICT");

    const published = await ok<{ status: string; dataset_revision: number }>(
      await call(publishRoute.POST, `${base()}/rulesets/${draft.data.id}/publish`, {
        method: "POST", body: { expected_active_ruleset_id: activeBefore.data.id }, session: ctx, headers: { "idempotency-key": `r4-${crypto.randomUUID()}` },
      }, { ...params(), ruleset_id: draft.data.id }),
    );
    expect(published.data.status).toBe("published");

    const republish = await err(await call(publishRoute.POST, `${base()}/rulesets/${draft.data.id}/publish`, {
      method: "POST", body: { expected_active_ruleset_id: draft.data.id }, session: ctx, headers: { "idempotency-key": `r5-${crypto.randomUUID()}` },
    }, { ...params(), ruleset_id: draft.data.id }));
    expect(republish.status).toBe(409); // já publicada — imutável (RULE04)

    const rankAfter = await ok<{ data: unknown[] }>(
      await call(rankingRoute.GET, `${base()}/ranking`, { session: ctx }, params()),
    );
    expect(rankAfter.data).toHaveLength(1);

    // Histórico encadeado por linhagem: publicada → inicial.
    const history = await ok<Array<{ id: string; status: string }>>(
      await call(rulesHistoryRoute.GET, `${base()}/rulesets/${draft.data.id}/history`, { session: ctx }, { ...params(), ruleset_id: draft.data.id }),
    );
    expect(history.data.map((h) => h.id)).toEqual(expect.arrayContaining([draft.data.id, activeBefore.data.id]));
  });
});
