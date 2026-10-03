/**
 * Orquestrador de setup do banco: impõe a ordem bootstrap → migrate deploy → seed.
 * Bootstrap e migration usam a credencial OWNER (DATABASE_MIGRATION_URL); o seed usa
 * a credencial da aplicação (DATABASE_URL). Credenciais vêm do .env local (INV-13).
 */
import { spawnSync } from "node:child_process";
import "dotenv/config";

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL ausente — configure o .env local.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente — configure o .env local.");

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) throw new Error(`Etapa falhou: ${cmd} ${args.join(" ")}`);
};

run("pnpm", ["exec", "tsx", "scripts/bootstrap-db.ts"], process.env);
run("pnpm", ["exec", "prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: migrationUrl });
run("pnpm", ["exec", "tsx", "prisma/seed/seed.ts"], process.env);
console.log("Setup completo: papéis, schema e seed demo aplicados.");
