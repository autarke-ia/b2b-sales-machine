/**
 * Fase 2.1 — CRUD versionado, auditoria e detalhe (CRUD01–05, AUD01/04/05, DATA02, INV-1/3/4).
 * Edita uma empresa da demo e devolve o estado original ao final (banco dev compartilhado).
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import * as loginRoute from "../../app/api/v1/auth/login/route";
import * as detailRoute from "../../app/api/v1/datasets/[dataset_id]/companies/[record_id]/route";
import * as patchRoute from "../../app/api/v1/datasets/[dataset_id]/companies/[record_id]/route";
import * as archiveRoute from "../../app/api/v1/datasets/[dataset_id]/companies/[record_id]/archive/route";
import * as historyRoute from "../../app/api/v1/datasets/[dataset_id]/companies/[record_id]/history/route";
import { call, err, login, ok, prisma, DEMO_DATASET, type SessionCtx } from "../helpers/routes";
import { describeIfDb } from "../helpers/db";
import type { Company } from "@prisma/client";

let ctx: SessionCtx;
let target: Company;
let originalVersion: number;
const original: Record<string, unknown> = {};
const EDITABLE = ["name","domain","segment","employees","uf","operates_in_brazil","hr_structured","has_benefits","seeks_benefit_differentiation","multi_region","growth","employer_branding","retention_pain","renewal_window","renewed_24_plus","operating_status","source_label"] as const;

beforeAll(async () => {
  ctx = await login(loginRoute.POST);
  target = await prisma.company.findFirstOrThrow({
    where: { dataset_id: DEMO_DATASET.id, external_id: "EMP-0001" },
  });
  originalVersion = target.version;
  for (const k of EDITABLE) original[k] = target[k];
});

afterAll(async () => {
  // Devolve o estado original com a mesma mecânica do produto (PATCH versionado).
  if (target) {
    const current = await prisma.company.findUnique({ where: { id: target.id } });
    if (current) {
      const restore: Record<string, unknown> = {};
      for (const k of EDITABLE) {
        if ((current as Record<string, unknown>)[k] !== original[k]) restore[k] = original[k];
      }
      if (Object.keys(restore).length > 0) {
        await call(patchRoute.PATCH, `/datasets/${DEMO_DATASET.id}/companies/${target.id}`, {
          method: "PATCH",
          body: { expected_version: current.version, changes: restore },
          session: ctx,
        }, { dataset_id: DEMO_DATASET.id, record_id: target.id });
      }
      if (current.archived_at) {
        await call(archiveRoute.POST, `/datasets/${DEMO_DATASET.id}/companies/${target.id}/archive`, {
          method: "POST", body: { archived: false, expected_version: (await prisma.company.findUniqueOrThrow({ where: { id: target.id } })).version },
          session: ctx,
        }, { dataset_id: DEMO_DATASET.id, record_id: target.id });
      }
    }
  }
  await prisma.$disconnect();
});

const path = (id: string) => `/datasets/${DEMO_DATASET.id}/companies/${id}`;
const params = (id: string) => ({ dataset_id: DEMO_DATASET.id, record_id: id });

describeIfDb("CRUD01 — PATCH tipado", () => {
  test("muda campos, incrementa versão/input_revision e devolve DTO atual", async () => {
    const res = await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: { expected_version: target.version, changes: { employees: target.employees === 777 ? 778 : 777, hr_structured: !target.hr_structured } },
      session: ctx,
    }, params(target.id));
    expect(res.status).toBe(200);
    const body = await ok<{ version: number; input_revision: number; employees: number; hr_structured: boolean }>(res);
    expect(body.data.version).toBe(target.version + 1);
    expect(body.data.input_revision).toBe(target.input_revision + 1);
    expect(body.data.employees).toBe(target.employees === 777 ? 778 : 777);
    expect(body.data.hr_structured).toBe(!target.hr_structured);
  });

  test("campos readonly/autoria no changes são 422 (AUD04/INV-3)", async () => {
    for (const bad of ["updated_by", "created_by", "id", "dataset_id", "version", "input_revision", "created_at"]) {
      const r = await err(await call(patchRoute.PATCH, path(target.id), {
        method: "PATCH",
        body: { expected_version: originalVersion + 1, changes: { [bad]: "x" } },
        session: ctx,
      }, params(target.id)));
      expect(r.status).toBe(422);
    }
  });

  test("valor inválido para campo tipado é 422 com field_errors", async () => {
    const r = await err(await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: { expected_version: originalVersion + 1, changes: { growth: "extreme" } },
      session: ctx,
    }, params(target.id)));
    expect(r.status).toBe(422);
    expect((r.error as { field_errors: unknown[] }).field_errors.length).toBeGreaterThan(0);
  });
});

describeIfDb("CRUD02 — concorrência de versão (INV-4)", () => {
  test("PATCH com expected_version antigo: 409 VERSION_CONFLICT, zero linhas alteradas", async () => {
    const stale = originalVersion; // já avançou 1 no CRUD01
    const r = await err(await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: { expected_version: stale, changes: { employees: 999 } },
      session: ctx,
    }, params(target.id)));
    expect(r.status).toBe(409);
    expect(r.code).toBe("VERSION_CONFLICT");
    expect((r.error as { details: { current_version: number } }).details.current_version).toBe(stale + 1);
    const db = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    expect(db.employees).toBe(target.employees === 777 ? 778 : 777);
  });

  test("DATA02 — company de outra base é 404, sem vazar", async () => {
    const r = await err(await call(patchRoute.PATCH, `/datasets/00000000-0000-0000-0000-000000000001/companies/${target.id}`, {
      method: "PATCH",
      body: { expected_version: 1, changes: { employees: 1 } },
      session: ctx,
    }, { dataset_id: "00000000-0000-0000-0000-000000000001", record_id: target.id }));
    expect(r.status).toBe(404);
    expect(r.code).toBe("NOT_FOUND");
  });
});

describeIfDb("CRUD03 — no-op não gera nada", () => {
  test("changes vazio é 422; mesmos valores retornam estado atual sem versão nova nem evento", async () => {
    const empty = await err(await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: { expected_version: originalVersion + 1, changes: {} },
      session: ctx,
    }, params(target.id)));
    expect(empty.status).toBe(422);

    const before = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    const eventsBefore = await prisma.auditEvent.count({ where: { entity_id: target.id } });
    const res = await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: { expected_version: before.version, changes: { employees: before.employees } },
      session: ctx,
    }, params(target.id));
    expect(res.status).toBe(200);
    const body = await ok<{ version: number }>(res);
    expect(body.data.version).toBe(before.version); // sem incremento fictício
    expect(await prisma.auditEvent.count({ where: { entity_id: target.id } })).toBe(eventsBefore);
  });
});

describeIfDb("AUD01/05 — trilha append-only", () => {
  test("editar 5 campos → UM evento com 5 changed_fields, autor da sessão, source=manual (INV-1)", async () => {
    const eventsBefore = await prisma.auditEvent.count({ where: { entity_id: target.id } });
    const cur = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    const res = await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH",
      body: {
        expected_version: cur.version,
        changes: { employees: cur.employees === 555 ? 556 : 555, hr_structured: !cur.hr_structured, growth: cur.growth === "high" ? "medium" : "high", segment: cur.segment === "Teste Auditoria" ? "Teste Auditoria 2" : "Teste Auditoria", domain: cur.domain === "teste.example" ? "teste2.example" : "teste.example" },
      },
      session: ctx,
    }, params(target.id));
    expect(res.status).toBe(200);

    const events = await prisma.auditEvent.findMany({
      where: { entity_id: target.id },
      orderBy: { occurred_at: "desc" },
      take: 1,
    });
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(await prisma.auditEvent.count({ where: { entity_id: target.id } })).toBe(eventsBefore + 1);
    const changed = (ev.changed_fields as string[]) ?? [];
    expect([...changed].sort()).toEqual(["domain", "employees", "growth", "hr_structured", "segment"]);
    expect(ev.actor_user_id).toBeTruthy(); // autor da sessão, nunca do payload (INV-3)
    expect(ev.source).toBe("manual");
    expect(ev.version_before).toBe(cur.version);
    expect(ev.version_after).toBe(cur.version + 1);
  });

  test("AUD05 — reversão consultável no histórico (before/after preservados)", async () => {
    const res = await call(historyRoute.GET, path(`${target.id}/history?field=employees`), { session: ctx }, params(target.id));
    expect(res.status).toBe(200);
    const body = await ok<Array<{ changed_fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }>>(res);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    const first = body.data[0]!;
    expect(first.changed_fields).toContain("employees");
    expect(first.before).toHaveProperty("employees");
    expect(first.after).toHaveProperty("employees");
  });

  test("histórico com filtro de campo pagina e não expõe outra entidade", async () => {
    const other = await prisma.company.findFirstOrThrow({ where: { dataset_id: DEMO_DATASET.id, id: { not: target.id } } });
    const res = await call(historyRoute.GET, path(`${target.id}/history?field=growth&page_size=2`), { session: ctx }, params(target.id));
    const body = await ok<unknown[]>(res);
    for (const ev of body.data as Array<{ entity_id: string }>) expect(ev.entity_id).not.toBe(other.id);
  });
});

describeIfDb("CRUD04 — arquivar/restaurar", () => {
  test("arquivar gera evento, preserva external_id/histórico; restaurar reabilita", async () => {
    const cur = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    const archive = await call(archiveRoute.POST, path(`${target.id}/archive`), {
      method: "POST", body: { archived: true, expected_version: cur.version }, session: ctx,
    }, params(target.id));
    expect(archive.status).toBe(200);
    const archived = await ok<{ archived_at: string; version: number; external_id: string }>(archive);
    expect(archived.data.archived_at).toBeTruthy();
    expect(archived.data.version).toBe(cur.version + 1);
    expect(archived.data.external_id).toBe(target.external_id);

    // Empresa arquivada não é editável (CRUD05 para o próprio registro).
    const blocked = await err(await call(patchRoute.PATCH, path(target.id), {
      method: "PATCH", body: { expected_version: archived.data.version, changes: { employees: 1 } }, session: ctx,
    }, params(target.id)));
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe("VERSION_CONFLICT");

    const restore = await call(archiveRoute.POST, path(`${target.id}/archive`), {
      method: "POST", body: { archived: false, expected_version: archived.data.version }, session: ctx,
    }, params(target.id));
    expect(restore.status).toBe(200);
    const restored = await ok<{ archived_at: string | null }>(restore);
    expect(restored.data.archived_at).toBeNull();

    const ops = await prisma.auditEvent.findMany({ where: { entity_id: target.id }, orderBy: { occurred_at: "asc" } });
    expect(ops.some((e) => e.operation === "update" && (e.changed_fields as string[])?.includes("archived_at"))).toBe(true);
  });
});

describeIfDb("CRUD02b — corrida paralela REAL (P1 do finder)", () => {
  test("dois PATCHs concorrentes com a mesma expected_version: um 200, um 409, versão +1, UM evento", async () => {
    const cur = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    const eventsBefore = await prisma.auditEvent.count({ where: { entity_id: target.id } });
    const [a, b] = await Promise.allSettled([
      call(patchRoute.PATCH, path(target.id), {
        method: "PATCH",
        body: { expected_version: cur.version, changes: { segment: `Corrida A ${crypto.randomUUID().slice(0, 6)}` } },
        session: ctx,
      }, params(target.id)),
      call(patchRoute.PATCH, path(target.id), {
        method: "PATCH",
        body: { expected_version: cur.version, changes: { segment: `Corrida B ${crypto.randomUUID().slice(0, 6)}` } },
        session: ctx,
      }, params(target.id)),
    ]);
    const statuses = [a, b].map((r) => (r.status === "fulfilled" ? r.value.status : `erro:${r.reason?.code ?? "INTERNAL"}`)).sort();
    expect(statuses).toEqual([200, 409]);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.version).toBe(cur.version + 1);
    expect(await prisma.auditEvent.count({ where: { entity_id: target.id } })).toBe(eventsBefore + 1);
  });
});

describeIfDb("Detalhe (2.3) — CompanyDetail + avaliação", () => {
  test("GET devolve cadastro completo, gate com L/U e prioridade com intervalo", async () => {
    const res = await call(detailRoute.GET, path(target.id), { session: ctx }, params(target.id));
    expect(res.status).toBe(200);
    const body = await ok<{
      id: string; version: number; archived_at: string | null;
      assessment: {
        gate: { state: string; score_min: number; score_max: number; threshold: number; criteria: Array<{ id: string; input_fields: string[] }> };
        priority: { score: number; score_min: number; score_max: number; criteria: Array<{ id: string }> } | null;
      };
      signals: unknown[]; contacts: unknown[]; opportunities: unknown[];
    }>(res);
    expect(body.data.id).toBe(target.id);
    expect(body.data.assessment.gate.threshold).toBe(60);
    expect(body.data.assessment.gate.criteria.length).toBeGreaterThan(0);
    if (body.data.assessment.gate.state === "in") {
      expect(body.data.assessment.priority).not.toBeNull();
      expect(body.data.assessment.priority!.criteria.map((c) => c.id)).toEqual(["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10"]);
    } else {
      expect(body.data.assessment.priority).toBeNull();
    }
    expect(Array.isArray(body.data.signals)).toBe(true);
    expect(Array.isArray(body.data.contacts)).toBe(true);
  });

  test("sem sessão é 401; base inexistente 404", async () => {
    expect((await err(await call(detailRoute.GET, path(target.id), {}, params(target.id)))).status).toBe(401);
    expect((await err(await call(detailRoute.GET, `/datasets/00000000-0000-0000-0000-000000000002/companies/${target.id}`, { session: ctx }, { dataset_id: "00000000-0000-0000-0000-000000000002", record_id: target.id }))).status).toBe(404);
  });
});
