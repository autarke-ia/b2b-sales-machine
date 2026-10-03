/** Teardown do e2e: a suíte MUTA a demo de propósito (import, publicação) — o
 * reset final devolve o estado pristine para qualquer suíte subsequente
 * (vitest local/CI confia nas contagens golden do seed). Credencial owner. */
import { spawnSync } from "node:child_process";

export default function globalTeardown(): void {
  const r = spawnSync("pnpm", ["db:reset-demo"], { shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("db:reset-demo falhou no globalTeardown do e2e.");
}
