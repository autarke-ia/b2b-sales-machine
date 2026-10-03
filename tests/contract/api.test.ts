/**
 * Fase 1.1 — contratos de schema, datasets (idempotência), listagem de empresas
 * (filtros, paginação, golden do gate) e ranking (snapshots, INV-5/6/7/8, CSV).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as schemaRoute from "../../app/api/v1/schema/route";
import * as datasetsRoute from "../../app/api/v1/datasets/route";
import * as datasetDetailRoute from "../../app/api/v1/datasets/[dataset_id]/route";
import * as companiesRoute from "../../app/api/v1/datasets/[dataset_id]/companies/route";
import * as rankingRoute from "../../app/api/v1/datasets/[dataset_id]/ranking/route";
import * as rankingCsvRoute from "../../app/api/v1/datasets/[dataset_id]/ranking.csv/route";
import * as loginRoute from "../../app/api/v1/auth/login/route";
import { evaluate, rankRows, type RuleConfig } from "../../src/domain/scoring";
import { call, err, login, ok, prisma, DEMO_DATASET, type SessionCtx } from "../helpers/routes";
import rulesDefault from "../../contracts/rules-default-v1.json";

let ctx: SessionCtx;

beforeAll(async () => {
  ctx = await login(loginRoute.POST);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const demo = (path = "") => `/datasets/${DEMO_DATASET.id}${path}`;
const ds = (id: string, path = "") => `/datasets/${id}${path}`;

describe("/schema", () => {
  test("requer sessão e devolve o catálogo de campos do contrato", async () => {
    const denied = await err(await call(schemaRoute.GET, "/schema", {}));
    expect(denied.status).toBe(401);

    const res = await call(schemaRoute.GET, "/schema", { session: ctx });
    expect(res.status).toBe(200);
    const body = await ok<Record<string, unknown>>(res);
    const text = JSON.stringify(body.data);
    expect(text).toContain("employees");
    expect(text).toContain("renewal_window");
    expect(text).toContain("uf");
  });
});

describe("/datasets", () => {
  test("lista bases compartilhadas; demo presente com as_of 2026-09-30", async () => {
    const res = await call(datasetsRoute.GET, "/datasets", { session: ctx });
    const body = await ok<Array<{ id: string; kind: string; default_as_of: string }>>(res);
    const demoRow = body.data.find((d) => d.id === DEMO_DATASET.id);
    expect(demoRow).toBeDefined();
    expect(demoRow!.kind).toBe("demo");
    expect(demoRow!.default_as_of).toBe("2026-09-30");
  });

  test("detalhe da base expõe data_revision e ruleset ativo; base inexistente é 404", async () => {
    const res = await call(datasetDetailRoute.GET, demo(), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<{ data_revision: number; active_ruleset_id: string | null }>(res);
    expect(body.data.data_revision).toBeGreaterThanOrEqual(1);
    expect(body.data.active_ruleset_id).toBeTruthy();

    const nf = await err(await call(datasetDetailRoute.GET, ds("00000000-0000-0000-0000-000000000000"), { session: ctx }, { dataset_id: "00000000-0000-0000-0000-000000000000" }));
    expect(nf.status).toBe(404);
    expect(nf.code).toBe("NOT_FOUND");
  });

  test("idempotência: mesma chave+payload reproduz o MESMO dataset; payload divergente é 409", async () => {
    const key = `test-${crypto.randomUUID()}`;
    const payload = { name: `Base de idempotência ${crypto.randomUUID().slice(0, 8)}` };
    const first = await call(datasetsRoute.POST, "/datasets", { method: "POST", body: payload, session: ctx, headers: { "idempotency-key": key } });
    expect(first.status).toBe(201);
    const firstBody = await ok<{ id: string }>(first);

    const replay = await call(datasetsRoute.POST, "/datasets", { method: "POST", body: payload, session: ctx, headers: { "idempotency-key": key } });
    expect(replay.status).toBe(201);
    const replayBody = await ok<{ id: string }>(replay);
    expect(replayBody.data.id).toBe(firstBody.data.id);

    const conflict = await err(
      await call(datasetsRoute.POST, "/datasets", { method: "POST", body: { name: "outro nome" }, session: ctx, headers: { "idempotency-key": key } }),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  test("POST sem chave de idempotência é rejeitado", async () => {
    const r = await err(await call(datasetsRoute.POST, "/datasets", { method: "POST", body: { name: "sem chave" }, session: ctx }));
    expect(r.status).toBe(422);
  });

  test("DATA02 — company de outra base não vaza entre bases", async () => {
    const created = await call(datasetsRoute.POST, "/datasets", {
      method: "POST",
      body: { name: `Base vazia ${crypto.randomUUID().slice(0, 8)}` },
      session: ctx,
      headers: { "idempotency-key": `ds-${crypto.randomUUID()}` },
    });
    const empty = (await ok<{ id: string }>(created)).data.id;
    const list = await call(companiesRoute.GET, ds(empty, "/companies"), { session: ctx }, { dataset_id: empty });
    const body = await ok<unknown[]>(list);
    expect(body.data).toEqual([]);
    const meta = body.meta.pagination as { total: number };
    expect(meta.total).toBe(0);
  });
});

describe("/companies — filtros, paginação e golden do gate", () => {
  test("golden: icp_state=in|out|pending retorna 56|37|27 sob os defaults", async () => {
    for (const [state, expected] of [["in", 56], ["out", 37], ["pending", 27]] as const) {
      const res = await call(companiesRoute.GET, demo(`/companies?icp_state=${state}`), { session: ctx }, { dataset_id: DEMO_DATASET.id });
      const body = await ok<unknown[]>(res);
      expect((body.meta.pagination as { total: number }).total).toBe(expected);
    }
  });

  test("ordem external_id ASC, página padrão 25 e nullable explícito", async () => {
    const res = await call(companiesRoute.GET, demo("/companies"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<Array<{ external_id: string }>>(res);
    expect(body.data.length).toBe(25);
    expect((body.meta.pagination as { page_size: number }).page_size).toBe(25);
    expect(body.data[0]!.external_id).toBe("EMP-0001");
    const sorted = [...body.data].map((c) => c.external_id).sort();
    expect(body.data.map((c) => c.external_id)).toEqual(sorted);
  });

  test("página além do fim: array vazio preservando totais", async () => {
    const res = await call(companiesRoute.GET, demo("/companies?page=99"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<unknown[]>(res);
    expect(body.data).toEqual([]);
    expect((body.meta.pagination as { total: number }).total).toBe(120);
  });

  test("busca q substring case-insensitive e uf exata", async () => {
    const res = await call(companiesRoute.GET, demo(`/companies?q=${encodeURIComponent("EMP-01")}&page_size=100`), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<Array<{ external_id: string }>>(res);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThan(120);
    for (const c of body.data) expect(c.external_id).toMatch(/^EMP-01/i);

    const uf = await call(companiesRoute.GET, demo("/companies?uf=SP&page_size=100"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const ufBody = await ok<Array<{ uf: string | null }>>(uf);
    expect(ufBody.data.length).toBeGreaterThan(0);
    for (const c of ufBody.data) expect(c.uf).toBe("SP");
  });
});

describe("/ranking — snapshots determinísticos (INV-5/6/7/8)", () => {
  test("somente empresas 'in' ranqueadas; total 56; meta completa; INV-5 em cada linha", async () => {
    const res = await call(rankingRoute.GET, demo("/ranking"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<Array<{ rank: number; assessment: { gate: { state: string; in_icp: boolean | null }; priority: { score: number } | null } }>>(res);
    const meta = body.meta as Record<string, unknown>;
    expect((meta.pagination as { total: number }).total).toBe(56);
    expect(meta.snapshot_id).toBeTruthy();
    expect(meta.as_of).toBe("2026-09-30");
    expect(meta.is_stale).toBe(false);
    for (const row of body.data) {
      expect(row.assessment.gate.state).toBe("in");
      expect(row.assessment.gate.in_icp).toBe(true);
      expect(row.assessment.priority).not.toBeNull();
    }
    expect(body.data.map((r) => r.rank)).toEqual(body.data.map((_, i) => i + 1));
  });

  test("reprocessamento sem snapshot_id REUSA o snapshot (INV-7/8): mesmo ID, linhas idênticas", async () => {
    const a = await call(rankingRoute.GET, demo("/ranking"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const b = await call(rankingRoute.GET, demo("/ranking"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const aBody = await ok(a);
    const bBody = await ok(b);
    expect((bBody.meta as Record<string, unknown>).snapshot_id).toBe((aBody.meta as Record<string, unknown>).snapshot_id);
    expect(JSON.stringify(bBody.data)).toBe(JSON.stringify(aBody.data));
  });

  test("consistência com o motor: posições conferem com rankRows sobre o banco (INV-6/7)", async () => {
    const companies = await prisma.company.findMany({ where: { dataset_id: DEMO_DATASET.id, archived_at: null } });
    const signals = await prisma.signal.findMany({ where: { dataset_id: DEMO_DATASET.id } });
    const contacts = await prisma.contact.findMany({ where: { dataset_id: DEMO_DATASET.id } });
    const opportunities = await prisma.opportunity.findMany({ where: { dataset_id: DEMO_DATASET.id } });
    const rows = companies.map((c) => {
      const assessment = evaluate({
        company: {
          ...c,
          growth: c.growth as "low" | "medium" | "high" | null,
          employer_branding: c.employer_branding as "low" | "medium" | "high" | null,
          retention_pain: c.retention_pain as "low" | "medium" | "high" | null,
          renewal_window: c.renewal_window as "m0_3" | "m4_6" | "m7_12" | "over_12" | null,
          operating_status: c.operating_status as "active" | "inactive" | "unknown",
        },
        signals: signals.map((s) => ({ ...s, strength: s.strength as "low" | "medium" | "high" })),
        contacts,
        opportunities,
        rules: rulesDefault as RuleConfig,
        as_of: "2026-09-30",
      });
      return { external_id: c.external_id, assessment };
    });
    const expected = rankRows(rows).map((r) => r.external_id);

    const res = await call(rankingRoute.GET, demo("/ranking?page_size=100"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<Array<{ external_id: string }>>(res);
    expect(body.data.map((r) => r.external_id)).toEqual(expected);
    expect(body.data.length).toBe(56);
  });

  test("filtros preservam a posição original do snapshot", async () => {
    const all = await call(rankingRoute.GET, demo("/ranking?page_size=100"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const allBody = await ok<Array<{ rank: number; assessment: { priority: { band: string } } }>>(all);
    const snapshotId = (allBody.meta as Record<string, unknown>).snapshot_id as string;
    const high = allBody.data.filter((r) => r.assessment.priority.band === "high");

    const res = await call(rankingRoute.GET, demo(`/ranking?snapshot_id=${snapshotId}&band=high&page_size=100`), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const body = await ok<Array<{ rank: number }>>(res);
    expect((body.meta.pagination as { total: number }).total).toBe(high.length);
    expect((body.meta as Record<string, unknown>).snapshot_id).toBe(snapshotId);
    expect(body.data.map((r) => r.rank)).toEqual(high.map((r) => r.rank));
  });

  test("as_of conflitante com snapshot é rejeitado", async () => {
    const all = await call(rankingRoute.GET, demo("/ranking"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const snapshotId = ((await all.json()) as { meta: { snapshot_id: string } }).meta.snapshot_id;
    const r = await err(await call(rankingRoute.GET, demo(`/ranking?snapshot_id=${snapshotId}&as_of=2026-01-01`), { session: ctx }, { dataset_id: DEMO_DATASET.id }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(["MALFORMED_REQUEST", "VALIDATION_ERROR", "INVALID_STATE_TRANSITION"]).toContain(r.code);
  });
});

describe("/ranking.csv — exportação congelada", () => {
  test("CSV do snapshot com BOM, cabeçalho fixo e todas as 56 linhas", async () => {
    const all = await call(rankingRoute.GET, demo("/ranking"), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    const snapshotId = ((await all.json()) as { meta: { snapshot_id: string } }).meta.snapshot_id;

    const noSnapshot = await err(await call(rankingCsvRoute.GET, demo("/ranking.csv"), { session: ctx }, { dataset_id: DEMO_DATASET.id }));
    expect(noSnapshot.status).toBeGreaterThanOrEqual(400);

    const res = await call(rankingCsvRoute.GET, demo(`/ranking.csv?snapshot_id=${snapshotId}`), { session: ctx }, { dataset_id: DEMO_DATASET.id });
    expect(res.status).toBe(200);
    // BOM confere nos BYTES (TextDecoder de res.text() consumiria o BOM por padrão).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = text.replace(/^\ufeff/, "").trim().split(/\r?\n/);
    expect(lines[0]).toBe("rank,external_id,name,segment,uf,employees,priority_score,priority_min,priority_max,priority_band,review_status,ruleset_id,as_of");
    expect(lines.length).toBe(57);
  });
});
