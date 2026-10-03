import "dotenv/config";
import { expect, test } from "@playwright/test";

/**
 * Jornada 3 (doc 09 §4 passo 6 parcial + regras): importar CSV de sinal →
 * prévia → commit → publicar regra do rascunho → ranking reage.
 * A demo é resetada no globalSetup; o sinal extra não altera o gate (só prioridade).
 */
test("importar CSV → commit → publicar regra → ranking atualiza", async ({ page }) => {
  const user = (JSON.parse(process.env.SEED_USERS ?? "[]") as Array<{ email: string; password: string }>)[0]!;
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Allya — demonstração fictícia/ }).first().click();
  await expect(page.getByRole("heading", { name: "Contas da base" })).toBeVisible({ timeout: 15_000 });

  // 1) Importar CSV de sinais (novo sinal forte recente para EMP-0001).
  const csv = "external_id,company_external_id,signal_type,evidence_text,strength,observed_on,source_name,source_allowed\n"
    + `SIG-E2E-${Date.now()},EMP-0001,Contratação,"Plano de expansão do time de RH publicado",Alta,2026-09-25,Imprensa,true\n`;
  await page.setInputFiles('input[type="file"]', {
    name: "sinais-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });
  await page.getByLabel("Destino da importação").selectOption("signals");
  await page.getByRole("button", { name: /Validar e pré-visualizar/ }).click();
  await expect(page.getByText(/criar 1/)).toBeVisible({ timeout: 15_000 });
  // Critério de rede: o botão some também no 'Confirmando…' (busy) — só a
  // resposta 200 do commit prova a conclusão.
  const [committed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/imports\/.+\/commit/.test(r.url())),
    page.getByRole("button", { name: "Confirmar importação" }).click(),
  ]);
  expect(committed.status()).toBe(200);
  await expect(page.getByRole("region", { name: "Importar CSV" })).toBeVisible();

  // 2) Detalhe da EMP-0001 mostra o sinal importado.
  const search = page.getByPlaceholder("Buscar nome ou ID…");
  await search.fill("EMP-0001");
  await search.press("Enter");
  await page.getByRole("link", { name: /Empresa A001/ }).first().click();
  await expect(page.getByRole("heading", { name: /Empresa A001/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: /^Sinais \((\d+)\)$/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Plano de expansão do time de RH/)).toBeVisible({ timeout: 15_000 });

  // 3) Regras: rascunho com corte 40 (mais contas entram) → publicar → ranking muda.
  await page.getByRole("link", { name: "Regras" }).click();
  await expect(page.getByRole("heading", { name: /Gate ICP/ })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Corte do ICP").fill("40");
  await expect(page.getByText(/Σ 100/).first()).toBeVisible(); // pesos intactos
  await page.getByRole("button", { name: /Criar rascunho e publicar/ }).click();
  await expect(page.getByText("Regra publicada — o ranking foi invalidado.")).toBeVisible({ timeout: 15_000 });

  // 4) Ranking: snapshot antigo marcado obsoleto; atualizar recomputa com corte 40.
  await page.getByRole("link", { name: "Ranking" }).click();
  await expect(page.getByRole("heading", { name: /Ranking/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Atualizar ranking" }).click();
  await expect(page.getByText(/contas/)).toBeVisible({ timeout: 20_000 });
  // expect.poll: o header pode ainda exibir o snapshot antigo no instante do clique.
  await expect
    .poll(async () => {
      const t = (await page.getByText(/contas/).first().textContent()) ?? "";
      return Number(t.match(/(\d+) contas/)?.[1] ?? 0);
    }, { timeout: 20_000 })
    .toBeGreaterThan(56); // corte 40 admite mais contas que 60
});
