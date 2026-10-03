import "dotenv/config";
import { expect, test } from "@playwright/test";

/**
 * Jornada 2 (doc 09 §4 passos 3–5): editar → recálculo → conflito REAL entre
 * duas sessões → histórico before/after. Usa as duas contas de SEED_USERS.
 */
function seedUser(i: number): { email: string; password: string } {
  const list = JSON.parse(process.env.SEED_USERS ?? "[]") as Array<{ email: string; password: string }>;
  return list[i] ?? list[0]!;
}

async function login(page: import("@playwright/test").Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(creds.email);
  await page.getByLabel("Senha").fill(creds.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Selecionar base" })).toBeVisible();
}

async function openEmp0001(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Allya — demonstração fictícia/ }).first().click();
  await expect(page.getByRole("heading", { name: "Contas da base" })).toBeVisible({ timeout: 15_000 });
  const search = page.getByPlaceholder("Buscar nome ou ID…");
  await search.fill("EMP-0001");
  await search.press("Enter");
  const link = page.getByRole("link", { name: /Empresa A001/ }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page.getByRole("heading", { name: /Empresa A001/ })).toBeVisible({ timeout: 15_000 });
}

test("edição recalcula e conflito entre duas sessões é honesto", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await login(pageA, seedUser(0));
  await login(pageB, seedUser(1));
  await openEmp0001(pageA);
  await openEmp0001(pageB);

  // B salva primeiro (RH estruturado vira o oposto do atual).
  const rhSelect = pageB.getByLabel("RH estruturado");
  const currentB = await rhSelect.inputValue();
  await rhSelect.selectOption(currentB === "true" ? "false" : "true");
  // Critério de rede: o PATCH precisa SAIR e voltar 200 — se o clique for
  // engolido no cliente, o timeout nomeia a causa (flake j1→j2, ver PROGRESS).
  const [saved] = await Promise.all([
    pageB.waitForResponse((r) => r.request().method() === "PATCH" && /\/companies\//.test(r.url())),
    pageB.getByRole("button", { name: "Salvar alterações" }).click(),
  ]);
  expect(saved.status()).toBe(200);
  await expect(pageB.getByText("Alteração salva e recalculada.")).toBeVisible({ timeout: 20_000 });

  // A tenta salvar em cima da versão antiga → 409 com rascunho preservado.
  const nameA = pageA.getByLabel("Nome");
  await nameA.fill("Empresa A001 S.A. (rascunho A)");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(pageA.locator('div[role="alert"]').filter({ hasText: /registro mudou/i }).first()).toBeVisible();
  await expect(pageA.getByLabel("Nome")).toHaveValue("Empresa A001 S.A. (rascunho A)");

  // Recarregar restaura o estado atual (nome do servidor volta).
  await pageA.getByRole("button", { name: /Recarregar dados atuais/ }).click();
  await expect(pageA.getByLabel("Nome")).toHaveValue(/Empresa A001/);

  // Histórico mostra o before/after do campo hr_structured editado por B.
  await pageA.getByLabel("Filtrar histórico por campo").selectOption("hr_structured");
  await expect(pageA.getByRole("region", { name: "Histórico" })).toContainText("hr_structured");

  // Devolve o estado (banco dev compartilhado): B reverte o flip do RH.
  await rhSelect.selectOption(currentB);
  await pageB.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(pageB.getByText("Alteração salva e recalculada.")).toBeVisible({ timeout: 20_000 });

  await ctxA.close();
  await ctxB.close();
});
