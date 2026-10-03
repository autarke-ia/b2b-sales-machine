import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)) + "src",
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Bancos/rotas reais precisam do .env carregado; vitest não lê .env por padrão aqui.
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
    // Suítes compartilham o mesmo banco dev: paralelismo de ARQUIVOS causaria corridas
    // entre criações de uma suíte e contagens de outra (precedente: autarkeia-method).
    fileParallelism: false,
  },
});
