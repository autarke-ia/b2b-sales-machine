# CAPABILITIES.md — b2b-sales-machine

Registro de capacidades reutilizáveis do projeto. Classificar com evidência de call chain:
**produção** (usada por fluxo real), **parcial**, **experimental**, **scaffold** (pronto sem caller).

| Capacidade | Estado | Evidência | Desde |
|---|---|---|---|
| Motor de scoring determinístico (`src/domain/scoring`) | produção — chamado por `src/server/services/{companies,assessments}` nas rotas `/companies` (filtro icp_state) e `/ranking` | `tests/domain/scoring.test.ts` 52/52 + golden 56/37/27 no endpoint | Fase 0→1 |
| Auth/sessão/CSRF/rate-limit (`src/server/auth`, `/api/v1/auth/*`) | produção — login/logout/session consumidos pela UI (`src/lib/api.ts`, shell) | `tests/contract/auth.test.ts` AUTH01–04; e2e jornada 1 | Fase 1 |
| Middleware de idempotência (`src/server/http/idempotency`) | produção — todo POST de negócio marcado (atual: `POST /datasets`) | `tests/contract/api.test.ts` (replay/409) | Fase 1 |
| Envelope HTTP + guards (`src/server/http`) | produção — todos os handlers passam por `route()`/`requireSession`/`requireMutationContext` | 84 testes de contrato | Fase 1 |
| Ranking com snapshots imutáveis (`src/server/services/assessments`) | produção — `GET /datasets/{id}/ranking` e `/ranking.csv`; cache key completa; `is_stale` | `tests/contract/api.test.ts` INV-5/6/7/8; e2e export | Fase 1 |
| UI login/shell/lista/ranking (tokens Autarkeia) | produção — `/login`, `/app`, `/app/:id/companies`, `/app/:id/ranking` | e2e jornada 1 (Playwright 2/2) | Fase 1 |
| CSV de ranking (BOM, fórmula-neutralizado) | produção — botão Exportar usa o snapshot exibido | contrato CSV + e2e waitForRequest snapshot_id | Fase 1 |
| CI (pr-gate + db-tests efêmero, release-please, ECR) | produção — branch `main` verde; ECR aguarda var AWS_ROLE_TO_ASSUME | runs na main pós-#2/#3 | Fase 0/CI |
| CRUD de entidades + edição versionada 409 | ausente — Fase 2 | — | — |
| Importação CSV/XLSX com prévia→commit | ausente — Fase 3 (recorte D2: CSVs) | — | — |
| Regras versionadas (rascunho→publicação) | ausente — Fase 3 | — | — |
| IA: jobs duráveis + adaptador + revisão transacional | ausente — Fase 4 | — | — |
| Métricas/cronômetro do experimento | ausente — Fase 4 | — | — |
