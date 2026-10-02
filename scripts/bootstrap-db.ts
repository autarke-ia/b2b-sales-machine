/**
 * Bootstrap de papéis do banco (doc 04 §9, doc 07 §3). Roda com a credencial OWNER
 * (DATABASE_MIGRATION_URL) ANTES de `pnpm db:migrate`, pois a migration concede
 * privilégios ao papel da aplicação. A senha do papel da app vem de env — nunca
 * entra em SQL versionado, log ou repositório (INV-13).
 */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const role = (process.env.APP_DB_ROLE ?? "b2bsm_app").replace(/[^a-z0-9_]/g, "");
const password = process.env.APP_DB_PASSWORD;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!password) throw new Error("APP_DB_PASSWORD ausente — configure o .env local (nunca versionado).");
if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL ausente — configure o .env local.");

const client = new PrismaClient({ datasourceUrl: migrationUrl });
const safePassword = password.replace(/'/g, "''");

try {
  await client.$executeRawUnsafe(
    `DO $$ BEGIN ` +
      `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN ` +
      `CREATE ROLE ${role} LOGIN PASSWORD '${safePassword}'; ` +
      `ELSE ALTER ROLE ${role} LOGIN PASSWORD '${safePassword}'; ` +
      `END IF; END $$;`,
  );
  console.log(`Papel ${role} garantido no banco de destino.`);
} finally {
  await client.$disconnect();
}
