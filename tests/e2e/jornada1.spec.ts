/**
 * Jornada 1 (doc 09 §4 passo 1): login → base de demonstração → ranking com
 * decomposição por critério e exportação do snapshot. Credenciais vêm de
 * SEED_USERS (.env) — nunca hardcoded.
 */
import "dotenv/config";
import { expect, test } from "@playwright/test";

function firstSeedUser(): { email: string; password: string } {
  const list = JSON.parse(process.env.SEED_USERS ?? "[]") as Array<{ email: string; password: string }>;
  if (!list.length) throw new Error("SEED_USERS ausente — e2e precisa de credenciais de dev.");
  return list[0]!;
}

test("login → base demo → ranking com decomposição e snapshot", async ({ page }) => {
  const user = firstSeedUser();
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Seleção de base: demo visível com badge de dados fictícios.
  await expect(page.getByRole("heading", { name: "Selecionar base" })).toBeVisible();
  const demoButton = page.getByRole("button", { name: /Allya — demonstração fictícia/ }).first();
  await demoButton.click();

  // Lista de empresas da demo.
  await expect(page.getByRole("heading", { name: "Contas da base" })).toBeVisible();
  await expect(page.getByText("120 registros")).toBeVisible();
  await expect(page.getByText("EMP-0001").first()).toBeVisible();

  // Ranking: somente as 56 dentro do ICP; posição 1 presente.
  await page.getByRole("link", { name: "Ranking" }).click();
  await expect(page.getByRole("heading", { name: /Ranking/ })).toBeVisible();
  await expect(page.getByText(/56 contas/)).toBeVisible();
  const firstRank = page.locator("tbody tr").first();
  await expect(firstRank).toContainText(/1/);

  // Decomposição da primeira linha: gate e prioridade lado a lado, nunca somados.
  await firstRank.getByRole("button", { name: /Decomposição de/ }).click();
  await expect(page.getByRole("region", { name: "Gate ICP" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Score de prioridade" })).toBeVisible();
  await expect(page.getByText("aderência", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/prioridade/i).first()).toBeVisible();

  // Export usa o snapshot exibido — o request sai com snapshot_id.
  const [csvRequest] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/ranking.csv?snapshot_id=")),
    page.getByRole("button", { name: /Exportar CSV/ }).click(),
  ]);
  expect(csvRequest.method()).toBe("GET");

  // Logout encerra a sessão.
  await page.getByRole("button", { name: "Sair" }).click();
  try {
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible({ timeout: 8000 });
  } catch (e) {
    console.log("CONSOLE DO BROWSER:\n" + consoleErrors.join("\n"));
    throw e;
  }
});

test("login inválido não enumera cadastro e não navega", async ({ page }) => {
  await page.goto("/login");
  // Email único por execução: o mesmo email fixo acumularia falhas e esbarraria
  // no rate limit (429) em reruns — teste de credencial, não de limite.
  await page.getByLabel("E-mail").fill(`ninguem-${crypto.randomUUID()}@invalid.test`);
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('div[role="alert"]').filter({ hasText: /inválid/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
