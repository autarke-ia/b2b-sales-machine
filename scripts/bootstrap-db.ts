/**
 * Garante o papel da aplicação ANTES de `pnpm db:migrate` (a migration concede
 * privilégios a ele). Roda com a credencial OWNER (DATABASE_MIGRATION_URL).
 *
 * O owner é LEAST-PRIVILEGE (sem CREATEROLE), então a criação/rotação de papel é
 * feita UMA VEZ por um superusuário no provisionamento, não aqui. Este passo:
 *   - se o papel existe e o owner não pode gerenciá-lo → no-op (estado já correto);
 *   - se o owner TEM CREATEROLE/superuser → cria/atualiza o papel a partir do env
 *     (compat com setups onde a credencial de migração é privilegiada);
 *   - se o papel está ausente e o owner não pode criá-lo → FALHA com a causa
 *     (par de fail-fast-no-fallbacks), pois `migrate deploy` falharia no GRANT.
 * A senha do papel vem de env — nunca entra em SQL versionado, log ou repo (INV-13).
 */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const role = (process.env.APP_DB_ROLE ?? "b2bsm_app").replace(/[^a-z0-9_]/g, "");
const password = process.env.APP_DB_PASSWORD;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL ausente — configure o .env local (nunca versionado).");

const client = new PrismaClient({ datasourceUrl: migrationUrl });
const safePassword = (password ?? "").replace(/'/g, "''");

try {
  const manage = await client.$queryRawUnsafe<{ canmanage: boolean }[]>(
    `SELECT COALESCE(rolcreaterole, false) OR COALESCE(rolsuper, false) AS canmanage
     FROM pg_roles WHERE rolname = current_user`,
  );
  const canManage = manage[0]?.canmanage === true;
  const existing = await client.$queryRawUnsafe<{ one: number }[]>(
    `SELECT 1 AS one FROM pg_roles WHERE rolname = '${role}'`,
  );
  const roleExists = existing.length > 0;

  if (canManage) {
    if (!password) throw new Error("APP_DB_PASSWORD ausente — necessário para criar/rotacionar o papel da aplicação.");
    await client.$executeRawUnsafe(
      `DO $$ BEGIN ` +
        `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN ` +
        `CREATE ROLE ${role} LOGIN PASSWORD '${safePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE; ` +
        `ELSE ALTER ROLE ${role} LOGIN PASSWORD '${safePassword}'; ` +
        `END IF; END $$;`,
    );
    console.log(`Papel ${role} garantido (credencial de migração com CREATEROLE/superuser).`);
  } else if (roleExists) {
    console.log(`Papel ${role} já existe; credencial de migração least-privilege (sem CREATEROLE) — nada a fazer. Gerência de papel/senha é do provisionamento com superusuário.`);
  } else {
    throw new Error(
      `Papel "${role}" ausente e a credencial de migração não tem CREATEROLE/superuser. ` +
        `Provisione os papéis e o banco UMA VEZ com um superusuário antes do db:setup — ` +
        `ex.: CREATE ROLE ${role} LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE; ` +
        `CREATE DATABASE <db> OWNER <owner>; REVOKE CONNECT ON DATABASE <db> FROM PUBLIC; ` +
        `GRANT CONNECT ON DATABASE <db> TO <owner>, ${role}.`,
    );
  }
} finally {
  await client.$disconnect();
}
