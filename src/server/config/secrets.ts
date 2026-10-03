import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/**
 * Carregamento de segredos a partir do AWS Secrets Manager.
 *
 * Política do dono (secrets-config): segredo vem do SM, nunca de `.env` de host.
 * O SM é AUTORITATIVO — sobrescreve o que estiver no `process.env`. O boot
 * FALHA FECHADO: se a busca no SM falhar ou faltar uma chave obrigatória, o
 * servidor NÃO sobe "saudável" sem segredo (fail-fast, par de fail-fast-no-fallbacks).
 *
 * Bootstrap NÃO-secreto (fica como env comum no compose):
 *   - AWS_SECRET_NAME  → nome/ARN do secret (ex.: "b2b-sales-machine/prod")
 *   - AWS_REGION       → região (default sa-east-1)
 *
 * Em DEV local, `AWS_SECRET_NAME` fica ausente → a função no-opa e o `.env`
 * local continua valendo (o fluxo local do dono não muda).
 */
const REQUIRED_KEYS = ["DATABASE_URL", "SESSION_SECRET"] as const;

export async function loadSecretsFromManager(): Promise<void> {
  const secretName = process.env.AWS_SECRET_NAME;
  if (!secretName) {
    // Sem bootstrap de SM: dev local via `.env`. No-op consciente.
    return;
  }

  const region = process.env.AWS_REGION ?? "sa-east-1";
  const client = new SecretsManagerClient({ region });

  let secretString: string | undefined;
  try {
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    secretString = res.SecretString;
  } catch (err) {
    throw new Error(
      `Secrets Manager: falha ao buscar '${secretName}' em ${region} — ${(err as Error).message}. ` +
        "Boot abortado (fail-closed): confira a role da instância e o nome do secret.",
    );
  }

  if (!secretString) {
    throw new Error(`Secrets Manager: '${secretName}' não tem SecretString (binário não é suportado).`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(secretString) as Record<string, unknown>;
  } catch {
    throw new Error(`Secrets Manager: '${secretName}' não contém JSON válido.`);
  }

  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    const value = parsed[key];
    if (typeof value !== "string" || value.length === 0) {
      missing.push(key);
      continue;
    }
    // SM autoritativo: sobrescreve qualquer valor pré-existente no ambiente.
    process.env[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(
      `Secrets Manager: '${secretName}' sem as chaves obrigatórias: ${missing.join(", ")}. Boot abortado (fail-closed).`,
    );
  }
}
