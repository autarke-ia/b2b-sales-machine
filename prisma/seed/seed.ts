/** Entrada do seed: `pnpm db:seed`. Idempotente — rodar duas vezes é no-op (IMP05/DATA01). */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { seedDemo, seedUsers } from "./demo";

const prisma = new PrismaClient();
try {
  const result = await seedDemo(prisma);
  const users = await seedUsers(prisma);
  if (result.noop) {
    console.log("Seed demo já carregado — no-op (nenhum registro alterado).");
  } else {
    console.log(`Seed demo carregado: ${JSON.stringify(result.counts)}`);
  }
  console.log(users.length ? `Usuários pré-cadastrados: ${users.join(", ")}` : "SEED_USERS ausente — nenhum usuário humano criado.");
} finally {
  await prisma.$disconnect();
}
