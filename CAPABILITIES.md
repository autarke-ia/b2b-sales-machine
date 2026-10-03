# CAPABILITIES.md — b2b-sales-machine

Registro de capacidades reutilizáveis do projeto. Classificar com evidência de call chain:
**produção** (usada por fluxo real), **parcial**, **experimental**, **scaffold** (pronto sem caller).

| Capacidade | Estado | Evidência | Desde |
|---|---|---|---|
| Motor de scoring determinístico (gate ICP L/U + prioridade S01–S10, `src/domain/scoring`) | parcial — portado e com suíte 52/52 verde em vitest; sem caller HTTP ainda | `tests/domain/scoring.test.ts` (52 pass), golden do seed reproduzido | Fase 0 |
| Contrato HTTP OpenAPI (53 operações) | scaffold — especificado; só `/api/v1/health` implementado | `contracts/openapi.yaml`; `app/api/v1/health/route.ts` | v1.0.0 |
| Seed normalizado do case (120/287/120/70) | scaffold — carregador escrito (`prisma/seed/`), não executado (aguarda banco) | `prisma/seed/demo.ts` | Fase 0 |
| Schema Prisma + migration com auditoria append-only | scaffold — schema e SQL de triggers/grants escritos; `migrate deploy` pendente de RDS | `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql` (738 linhas) | Fase 0 |
| App Next.js (auth, CRUD, ranking, imports, regras, IA, métricas) | parcial — scaffold de pé: health 200, design tokens Autarkeia, build limpo; sem fluxo de negócio | smoke `/api/v1/health` 200; `pnpm build` verde | Fase 0 |
