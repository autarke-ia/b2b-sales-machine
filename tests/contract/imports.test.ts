/**
 * Fase 3.1/3.2 — pipeline de importação CSV (IMP02–IMP10 do doc 08 §4).
 * Cria registros em base de teste própria e a remove no fim (owner).
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { describeIfDb } from "../helpers/db";
import * as loginRoute from "../../app/api/v1/auth/login/route";
import * as datasetsRoute from "../../app/api/v1/datasets/route";
import * as importsRoute from "../../app/api/v1/datasets/[dataset_id]/imports/route";
import * as commitRoute from "../../app/api/v1/datasets/[dataset_id]/imports/[import_id]/commit/route";
import * as companiesRoute from "../../app/api/v1/datasets/[dataset_id]/companies/route";
import { call, err, login, ok, prisma, type SessionCtx } from "../helpers/routes";

let ctx: SessionCtx;
let datasetId: string;

beforeAll(async () => {
  ctx = await login(loginRoute.POST);
  const created = await call(datasetsRoute.POST, "/datasets", {
    method: "POST",
    body: { name: `Base imports ${crypto.randomUUID().slice(0, 8)}` },
    session: ctx,
    headers: { "idempotency-key": `imp-${crypto.randomUUID()}` },
  });
  datasetId = (await ok<{ id: string }>(created)).data.id;
});

afterAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATION_URL });
  try {
    for (const id of [datasetId].filter(Boolean)) {
      await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.actor_user_id', '3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9', true), set_config('app.source', 'system', true)`,
        );
        await tx.rankingSnapshot.deleteMany({ where: { dataset_id: id } });
        await tx.assessment.deleteMany({ where: { dataset_id: id } });
        await tx.importRow.deleteMany({ where: { batch: { dataset_id: id } } });
        await tx.importBatch.deleteMany({ where: { dataset_id: id } });
        await tx.sourceFile.deleteMany({ where: { dataset_id: id } });
        await tx.opportunity.deleteMany({ where: { dataset_id: id } });
        await tx.contact.deleteMany({ where: { dataset_id: id } });
        await tx.signal.deleteMany({ where: { dataset_id: id } });
        await tx.company.deleteMany({ where: { dataset_id: id } });
        await tx.ruleset.deleteMany({ where: { dataset_id: id } });
        await tx.dataset.delete({ where: { id } });
      });
    }
  } finally {
    await owner.$disconnect();
    await prisma.$disconnect();
  }
});

const base = () => `/datasets/${datasetId}`;
const params = () => ({ dataset_id: datasetId });

function multipart(fileBody: string, target: string, policy = "fill_missing"): FormData {
  const fd = new FormData();
  fd.append("file", new File([fileBody], "upload.csv", { type: "text/csv" }));
  fd.append("target", target);
  fd.append("merge_policy", policy);
  return fd;
}

async function preview(fileBody: string, target: string, policy = "fill_missing") {
  const fd = multipart(fileBody, target, policy);
  const req = new Request(`http://localhost:3000/api/v1${base()}/imports`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie: ctx.cookie, "x-csrf-token": ctx.csrf },
    body: fd as unknown as BodyInit,
  });
  return importsRoute.POST(req, { params: Promise.resolve(params()) });
}

const COMPANIES_CSV = `external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-001,Importada Um,imp1.com.br,Tecnologia,300,SP,true,Alto
IMP-002,Importada Dois,imp2.com.br,Indústria,90,MG,false,Médio
`;

describeIfDb("IMP02 — CSV de sinais resolve company_external_id", () => {
  test("empresas importadas; sinais vinculam com proveniência source=import", async () => {
    const p1 = await preview(COMPANIES_CSV, "companies");
    expect(p1.status).toBe(201);
    const pv1 = await ok<{ import_id: string; status: string; counts: { create: number }; dataset_revision: number }>(p1);
    expect(pv1.data.status).toBe("previewed");
    expect(pv1.data.counts.create).toBe(2);

    const commit = await call(commitRoute.POST, `${base()}/imports/${pv1.data.import_id}/commit`, {
      method: "POST",
      body: { expected_dataset_revision: pv1.data.dataset_revision },
      session: ctx,
      headers: { "idempotency-key": `c1-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv1.data.import_id });
    expect(commit.status).toBe(200);

    const signalsCsv = `external_id,company_external_id,signal_type,evidence_text,strength,observed_on,source_name,source_allowed
SIG-IMP-1,IMP-001,Contratação,Vagas abertas em RH,Alta,2026-09-20,LinkedIn,true
`;
    const p2 = await preview(signalsCsv, "signals");
    const pv2 = await ok<{ import_id: string; counts: { create: number }; dataset_revision: number }>(p2);
    expect(pv2.data.counts.create).toBe(1);
    const commit2 = await call(commitRoute.POST, `${base()}/imports/${pv2.data.import_id}/commit`, {
      method: "POST",
      body: { expected_dataset_revision: pv2.data.dataset_revision },
      session: ctx,
      headers: { "idempotency-key": `c2-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv2.data.import_id });
    expect(commit2.status).toBe(200);

    const company = await prisma.company.findUniqueOrThrow({ where: { dataset_id_external_id: { dataset_id: datasetId, external_id: "IMP-001" } } });
    const signal = await prisma.signal.findFirstOrThrow({ where: { dataset_id: datasetId, external_id: "SIG-IMP-1" } });
    expect(signal.company_id).toBe(company.id);
    const events = await prisma.auditEvent.findMany({ where: { import_id: pv2.data.import_id } });
    expect(events.length).toBe(1);
    expect(events[0]!.source).toBe("import");
  });
});

describeIfDb("IMP03/IMP10 — estrutura inválida e fórmulas bloqueiam o commit", () => {
  test("coluna desconhecida → prévia invalid, commit 422", async () => {
    const bad = `external_id,nome_x\nIMP-X,Um\n`;
    const p = await preview(bad, "companies");
    const pv = await ok<{ import_id: string; status: string; errors: unknown[] }>(p);
    expect(pv.data.status).toBe("invalid");
    expect(pv.data.errors.length).toBeGreaterThan(0);
    const commit = await err(await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST",
      body: { expected_dataset_revision: 1 },
      session: ctx,
      headers: { "idempotency-key": `c3-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv.data.import_id }));
    expect(commit.status).toBe(422);
  });

  test("IMP10 — célula de fórmula é rejeitada na prévia", async () => {
    const formula = `external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-F,=cmd(),x,Seg,10,SP,true,Alto\n`;
    const p = await preview(formula, "companies");
    const pv = await ok<{ status: string; errors: Array<{ message: string }> }>(p);
    expect(pv.data.status).toBe("invalid");
    expect(pv.data.errors.some((e) => e.message.includes("fórmula"))).toBe(true);
  });
});

describeIfDb("IMP04 — referência quebrada invalida o lote", () => {
  test("sinal apontando empresa inexistente: contagem error, commit recusado", async () => {
    const orphan = `external_id,company_external_id,signal_type,evidence_text,strength\nSIG-ORF,FANTASMA,Evento,Texto,Alta\n`;
    const p = await preview(orphan, "signals");
    const pv = await ok<{ status: string; counts: { error: number }; errors: Array<{ message: string }>; warnings: Array<{ message: string }> }>(p);
    expect(pv.data.status).toBe("invalid");
    expect(pv.data.counts.error).toBe(1);
    expect(pv.data.errors.some((e) => e.message.includes("FANTASMA"))).toBe(true);
  });
});

describeIfDb("IMP05/IMP08 — reimport e idempotência de commit", () => {
  test("mesmo conteúdo reimportado em fill_missing: tudo ignore/no-op", async () => {
    const p = await preview(COMPANIES_CSV, "companies");
    const pv = await ok<{ import_id: string; counts: { create: number; update: number }; dataset_revision: number }>(p);
    expect(pv.data.counts.create).toBe(0);
    const commit = await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST",
      body: { expected_dataset_revision: pv.data.dataset_revision },
      session: ctx,
      headers: { "idempotency-key": `c4-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv.data.import_id });
    const body = await ok<{ applied: { create: number; ignore: number } }>(commit);
    expect(body.data.applied.create).toBe(0);
  });

  test("IMP08 — duplo commit com a MESMA chave reproduz o resultado; nada duplica", async () => {
    const p = await preview(`external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-DUP,Duplicada,d.com,Seg,50,SP,true,Baixo\n`, "companies");
    const pv = await ok<{ import_id: string; dataset_revision: number }>(p);
    const key = `dup-${crypto.randomUUID()}`;
    const payload = { expected_dataset_revision: pv.data.dataset_revision };
    const first = await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST", body: payload, session: ctx, headers: { "idempotency-key": key },
    }, { ...params(), import_id: pv.data.import_id });
    expect(first.status).toBe(200);
    const replay = await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST", body: payload, session: ctx, headers: { "idempotency-key": key },
    }, { ...params(), import_id: pv.data.import_id });
    expect(replay.status).toBe(200);
    expect(await prisma.company.count({ where: { dataset_id: datasetId, external_id: "IMP-DUP" } })).toBe(1);
  });
});

describeIfDb("IMP06 — política de atualização", () => {
  test("fill_missing preserva valor existente; blanks nunca apagam", async () => {
    const p = await preview(`external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-001,Importada Um ALTERADA,,,,,,\n`, "companies");
    const pv = await ok<{ import_id: string; dataset_revision: number }>(p);
    const commit = await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST", body: { expected_dataset_revision: pv.data.dataset_revision },
      session: ctx, headers: { "idempotency-key": `c6-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv.data.import_id });
    expect(commit.status).toBe(200);
    const row = await prisma.company.findUniqueOrThrow({ where: { dataset_id_external_id: { dataset_id: datasetId, external_id: "IMP-001" } } });
    expect(row.employees).toBe(300); // preservado
    expect(row.domain).toBe("imp1.com.br");
    expect(row.name).toBe("Importada Um"); // mesmo nome = no-op no campo
  });
});

describeIfDb("IMP07 — obsolescência da prévia", () => {
  test("edição após a prévia → commit 409 IMPORT_PREVIEW_STALE", async () => {
    const fresh = await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    const p = await preview(`external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-ST,Stale,s.com,Seg,10,SP,true,Alto\n`, "companies");
    const pv = await ok<{ import_id: string; dataset_revision: number }>(p);
    expect(pv.data.dataset_revision).toBe(fresh.data_revision);

    // outra escrita sobe a revisão da base
    await call(companiesRoute.POST, `${base()}/companies`, {
      method: "POST",
      body: { external_id: "IMP-CONCORRE", name: "Concorrente" },
      session: ctx,
      headers: { "idempotency-key": `cc-${crypto.randomUUID()}` },
    }, params());

    const commit = await err(await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST", body: { expected_dataset_revision: pv.data.dataset_revision },
      session: ctx, headers: { "idempotency-key": `c7-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv.data.import_id }));
    expect(commit.status).toBe(409);
    expect(commit.code).toBe("IMPORT_PREVIEW_STALE");
    expect(await prisma.company.count({ where: { dataset_id: datasetId, external_id: "IMP-ST" } })).toBe(0);
  });
});

describeIfDb("IMP06b — overwrite_non_null e __NULL__ (finder)", () => {
  test("sobrescreve SOMENTE com confirm_overwrite; __NULL__ apaga nullable", async () => {
    const pvA = await ok<{ import_id: string; dataset_revision: number }>(
      await preview("external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-002,Importada Dois RENOMEADA,novo.com.br,Agro,500,SP,true,Alto\n", "companies", "overwrite_non_null"),
    );
    const refused = await err(await call(commitRoute.POST, `${base()}/imports/${pvA.data.import_id}/commit`, {
      method: "POST", body: { expected_dataset_revision: pvA.data.dataset_revision },
      session: ctx, headers: { "idempotency-key": `ow1-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pvA.data.import_id }));
    expect(refused.status).toBe(422);
    const untouched = await prisma.company.findUniqueOrThrow({ where: { dataset_id_external_id: { dataset_id: datasetId, external_id: "IMP-002" } } });
    expect(untouched.employees).toBe(90);

    const pvB = await ok<{ import_id: string; dataset_revision: number }>(
      await preview("external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-002,Importada Dois RENOMEADA,__NULL__,Agro,500,SP,true,Alto\n", "companies", "overwrite_non_null"),
    );
    const applied = await call(commitRoute.POST, `${base()}/imports/${pvB.data.import_id}/commit`, {
      method: "POST", body: { expected_dataset_revision: pvB.data.dataset_revision, confirm_overwrite: true },
      session: ctx, headers: { "idempotency-key": `ow2-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pvB.data.import_id });
    expect(applied.status).toBe(200);
    const changed = await prisma.company.findUniqueOrThrow({ where: { dataset_id_external_id: { dataset_id: datasetId, external_id: "IMP-002" } } });
    expect(changed.name).toBe("Importada Dois RENOMEADA");
    expect(changed.employees).toBe(500);
    expect(changed.domain).toBeNull();
  });
});

describeIfDb("IMP08b — commits concorrentes do mesmo lote (chaves distintas)", () => {
  test("exatamente UM aplica; o outro recebe ACTION_ALREADY_RESOLVED", async () => {
    const pv = await ok<{ import_id: string; dataset_revision: number }>(
      await preview("external_id,name,domain,segment,employees,uf,hr_structured,growth\nIMP-CONC,Concorrente,c.com,Seg,42,SP,true,Alto\n", "companies"),
    );
    const payload = { expected_dataset_revision: pv.data.dataset_revision };
    const [a, b] = await Promise.allSettled([
      call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
        method: "POST", body: payload, session: ctx, headers: { "idempotency-key": `k1-${crypto.randomUUID()}` },
      }, { ...params(), import_id: pv.data.import_id }),
      call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
        method: "POST", body: payload, session: ctx, headers: { "idempotency-key": `k2-${crypto.randomUUID()}` },
      }, { ...params(), import_id: pv.data.import_id }),
    ]);
    const codes = [a, b].map((r) => {
      if (r.status === "fulfilled") return r.value.status;
      return (r.reason as { code?: string }).code === "ACTION_ALREADY_RESOLVED" ? 409 : 500;
    }).sort();
    expect(codes).toEqual([200, 409]);
    expect(await prisma.company.count({ where: { dataset_id: datasetId, external_id: "IMP-CONC" } })).toBe(1);
  });
});

describeIfDb("IMP09 — regras importadas viram RASCUNHO, nunca publicação", () => {
  test("CSV de ICP cria ruleset draft; ranking continua com a ativa", async () => {
    const csv = `criterion_id,weight,required\nsize,15,false\nhr,14,false\nbenefits,12,false\ngrowth,10,false\nemployer_branding,10,false\ngeography,10,false\nregion,8,false\nretention,11,false\nrenewal,10,false\n`;
    const p = await preview(csv, "icp_rules");
    const pv = await ok<{ import_id: string; dataset_revision: number }>(p);
    const commit = await call(commitRoute.POST, `${base()}/imports/${pv.data.import_id}/commit`, {
      method: "POST", body: { expected_dataset_revision: pv.data.dataset_revision },
      session: ctx, headers: { "idempotency-key": `c9-${crypto.randomUUID()}` },
    }, { ...params(), import_id: pv.data.import_id });
    expect(commit.status).toBe(200);
    const body = await ok<{ rules_draft_id: string | null }>(commit);
    expect(body.data.rules_draft_id).toBeTruthy();
    const draft = await prisma.ruleset.findUniqueOrThrow({ where: { id: body.data.rules_draft_id! } });
    expect(draft.status).toBe("draft");
    const active = await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    expect(active.active_ruleset_id).not.toBe(draft.id);
  });

  test("soma de pesos ≠ 100 reprova na prévia (RULE01)", async () => {
    const bad = `criterion_id,weight,required\nsize,19,false\nhr,14,false\nbenefits,12,false\ngrowth,10,false\nemployer_branding,10,false\ngeography,10,false\nregion,8,false\nretention,8,false\nrenewal,8,false\n`;
    const p = await preview(bad, "icp_rules");
    const pv = await ok<{ status: string; errors: Array<{ message: string }> }>(p);
    expect(pv.data.status).toBe("invalid");
    expect(pv.data.errors.some((e) => e.message.includes("100"))).toBe(true);
  });
});
