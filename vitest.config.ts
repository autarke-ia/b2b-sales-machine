import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Bancos/rotas reais precisam do .env carregado; vitest não lê .env por padrão aqui.
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
  },
});
