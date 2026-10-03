/**
 * Reset do dataset demo antes da suíte e2e (plano 1.5): determinismo das contagens
 * exatas (120 contas / 56 no ranking) independente de estado residual de runs
 * anteriores. Usa a credencial owner — reset destrutivo não pertence à app.
 */
import { spawnSync } from "node:child_process";

export default function globalSetup(): void {
  const r = spawnSync("pnpm", ["db:reset-demo"], { shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("db:reset-demo falhou no globalSetup do e2e.");
}
