/**
 * Reset EXPLICITAMENTE acionado do dataset demo (`pnpm db:reset-demo`) — para e2e e
 * ensaio de demo. Nunca executado na inicialização do servidor (doc 01 §8). Remove o
 * dataset demo na ordem de FK e re-carrega o seed, com contexto de ator na trilha.
 * Usa a credencial OWNER (DATABASE_MIGRATION_URL): o reset destrutivo não pertence à
 * credencial da app, que não tem DELETE de negócio.
 */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { seedDemo, TECHNICAL_ACTOR_ID } from "./demo";

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL ausente — o reset-demo exige a credencial owner.");

const prisma = new PrismaClient({ datasourceUrl: migrationUrl });

async function deleteDemoDataset(datasetId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.actor_user_id', ${TECHNICAL_ACTOR_ID}, true), set_config('app.source', 'system', true)`;
    await tx.rankingSnapshot.deleteMany({ where: { dataset_id: datasetId } });
    await tx.assessment.deleteMany({ where: { dataset_id: datasetId } });
    await tx.reviewSessionEvent.deleteMany({ where: { session: { dataset_id: datasetId } } });
    await tx.reviewSession.deleteMany({ where: { dataset_id: datasetId } });
    await tx.reviewDecision.deleteMany({ where: { suggestion: { dataset_id: datasetId } } });
    await tx.suggestion.deleteMany({ where: { dataset_id: datasetId } });
    await tx.analysisJobItem.deleteMany({ where: { job: { dataset_id: datasetId } } });
    await tx.analysisJob.deleteMany({ where: { dataset_id: datasetId } });
    await tx.importRow.deleteMany({ where: { batch: { dataset_id: datasetId } } });
    await tx.importBatch.deleteMany({ where: { dataset_id: datasetId } });
    await tx.sourceFile.deleteMany({ where: { dataset_id: datasetId } });
    await tx.opportunity.deleteMany({ where: { dataset_id: datasetId } });
    await tx.contact.deleteMany({ where: { dataset_id: datasetId } });
    await tx.signal.deleteMany({ where: { dataset_id: datasetId } });
    await tx.company.deleteMany({ where: { dataset_id: datasetId } });
    await tx.ruleset.deleteMany({ where: { dataset_id: datasetId } });
    await tx.dataset.delete({ where: { id: datasetId } });
  });
}

try {
  const demo = await prisma.dataset.findFirst({ where: { kind: "demo" }, select: { id: true } });
  if (demo) {
    await deleteDemoDataset(demo.id);
    console.log("Dataset demo removido.");
  } else {
    console.log("Nenhum dataset demo existente — nada a remover.");
  }
  const result = await seedDemo(prisma);
  console.log(result.noop ? "Seed demo já consistente (inesperado após remoção)." : `Seed demo re-carregado: ${JSON.stringify(result.counts)}`);
} finally {
  await prisma.$disconnect();
}
