import "dotenv/config";
import { expect, test } from "@playwright/test";

/**
 * Jornada 4 (doc 09 §4 passos 6–8): análise fixture → sugestões com trecho →
 * decisão humana muda o campo e recalcula → cronômetro → métricas.
 * Conta de teste criada via API autenticada (determinística); a demo é
 * resetada pelo globalSetup/Teardown.
 */
const DEMO = "b98e393e-c607-51da-8840-b52becd582b6";

test("analisar → decidir → recalcular → métricas (fixture provider)", async ({ page }) => {
  const user = (JSON.parse(process.env.SEED_USERS ?? "[]") as Array<{ email: string; password: string }>)[0]!;
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Allya — demonstração fictícia/ }).first().click();
  await expect(page.getByRole("heading", { name: "Contas da base" })).toBeVisible({ timeout: 15_000 });

  // 0) Conta pendente determinística: RH+porte ok, Brasil não informado (D02
  // pendente), com sinal permitido que gera preenchimento growth=high.
  const api = page.request;
  const session = ((await (await api.get(`/api/v1/auth/session`)).json()) as { data: { csrf_token: string } }).data;
  const mkCompany = await api.post(`/api/v1/datasets/${DEMO}/companies`, {
    data: { external_id: `EMP-J4`, name: `Jornada Quatro`, employees: 400, hr_structured: true },
    headers: { "x-csrf-token": session.csrf_token, "idempotency-key": `j4c-${Date.now()}` },
  });
  expect(mkCompany.status()).toBe(201);
  const mkSignal = await api.post(`/api/v1/datasets/${DEMO}/signals`, {
    data: {
      company_external_id: "EMP-J4",
      external_id: `SIG-J4-${Date.now().toString().slice(-6)}`,
      signal_type: "Notícia",
      evidence_text: "A empresa anuncia expansão do time de tecnologia e contratação acelerada.",
      strength: "high",
      observed_on: "2026-09-22",
      source_name: "Fixture",
      source_allowed: true,
    },
    headers: { "x-csrf-token": session.csrf_token, "idempotency-key": `j4s-${Date.now()}` },
  });
  expect(mkSignal.status()).toBe(201);

  // 1) Abrir a conta criada (pendente por D02).
  const search = page.getByPlaceholder("Buscar nome ou ID…");
  await search.fill("EMP-J4");
  await search.press("Enter");
  await page.getByRole("link", { name: /Jornada Quatro/ }).click();
  await expect(page.getByText(/· versão \d+ · as_of/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Pendente").first()).toBeVisible({ timeout: 15_000 });

  // 2) Cronômetro: iniciar validação assistida.
  await page.getByRole("button", { name: "Iniciar validação" }).click();
  await expect(page.getByText(/min \d+s · assisted · active/)).toBeVisible({ timeout: 15_000 });

  // 3) Analisar lacunas do ICP (fixture determinístico) — critério de rede.
  const [jobCreated] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/analysis-jobs$/.test(r.url())),
    page.getByRole("button", { name: "Analisar lacunas do ICP" }).click(),
  ]);
  expect(jobCreated.status()).toBe(202);
  const suggestionCard = page.locator("li:has(blockquote)").first();
  await expect(suggestionCard).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "IA e revisão" })).toContainText("completed", { timeout: 15_000 });

  // 4) Aceitar a primeira sugestão aceitável (fill growth=high) e ver recálculo.
  const accept = page.getByRole("button", { name: /^Aceitar / }).first();
  await expect(accept).toBeVisible({ timeout: 10_000 });
  const [decision] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/decision$/.test(r.url())),
    accept.click(),
  ]);
  expect(decision.status()).toBe(200);
  await expect(page.getByText("Aceite aplicado e recalculado.")).toBeVisible({ timeout: 15_000 });
  // O aceite incrementa input_revision; o complete exige a revisão VISTA —
  // esperar o detalhe recarregar antes de concluir.
  await expect(page.getByText(/· versão 2 · as_of/)).toBeVisible({ timeout: 15_000 });

  // 5) Concluir a sessão e conferir métricas.
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("button", { name: "Iniciar validação" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Métricas" }).click();
  await expect(page.getByRole("heading", { name: /Experimento de validação/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sessões completas válidas")).toBeVisible();
  const firstDd = await page.locator("dd").first().textContent();
  expect(Number((firstDd ?? "").match(/(\d+)/)?.[1] ?? 0)).toBeGreaterThanOrEqual(1);
});
