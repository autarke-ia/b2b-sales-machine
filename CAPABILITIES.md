# CAPABILITIES.md — b2b-sales-machine

Registro de capacidades reutilizáveis do projeto. Classificar com evidência de call chain:
**produção** (usada por fluxo real), **parcial**, **experimental**, **scaffold** (pronto sem caller).

| Capacidade | Estado | Evidência | Desde |
|---|---|---|---|
| Motor de scoring determinístico (gate ICP L/U + prioridade S01–S10) | parcial — motor de referência do pacote (`tools/scoring-reference.mjs`), sem caller de produção | 52 testes em `tests/scoring.test.mjs` | v1.0.0 |
| Contrato HTTP OpenAPI (53 operações) | scaffold — especificado, sem implementação | `contracts/openapi.yaml` verificado | v1.0.0 |
| Seed normalizado do case (120/287/120/70) | parcial — fixture verificada, sem carregador de banco | `seed/normalized-demo.json` | v1.0.0 |
| App Next.js (auth, CRUD, ranking, imports, regras, IA, métricas) | ausente | — | — |
