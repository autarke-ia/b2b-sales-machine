/**
 * Hook de boot do Next.js (roda uma vez, antes de servir requests).
 *
 * Só no runtime `nodejs` (nunca Edge): o import do AWS SDK — que puxa builtins
 * `node:*` — é DINÂMICO e guardado pela checagem de runtime, para não vazar
 * para o bundle Edge (par de dev-server-verification-lifecycle). O loader
 * hidrata `process.env` a partir do Secrets Manager antes de qualquer
 * import de Prisma/sessão (fail-closed se o SM falhar).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadSecretsFromManager } = await import("./src/server/config/secrets");
    await loadSecretsFromManager();
  }
}
