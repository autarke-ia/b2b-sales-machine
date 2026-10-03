import { defineConfig } from "@playwright/test";

/**
 * E2E contra o app + RDS dev reais (doc 05 §12). O dev server sobe pelo webServer
 * e é encerrado pelo próprio Playwright ao final (regra do workspace: registrar e
 * liberar a porta — aqui o runner é o dono do processo).
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  globalTeardown: "tests/e2e/global-teardown.ts",
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1, // suítes mutam a mesma demo: ordem j1→j2→j3 com reset no globalSetup
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/api/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  reporter: [["list"]],
});
