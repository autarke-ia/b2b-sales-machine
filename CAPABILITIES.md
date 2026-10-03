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
| CI (pr-gate + db-tests efêmero, release-please, ECR) | produção — branch `main` verde; `app-ecr` publicando (var `AWS_ROLE_TO_ASSUME` setada, role OIDC própria) | runs na main; imagem no ECR | Fase 0/CI |
| Deploy ECR→EC2 por digest (`deploy/`, `scripts/deploy-ec2.sh`) | produção — compose + nginx + TLS na caixa `i-0f1ec133bb46a870d`; pin por digest, igual aos irmãos | `deploy/README.md` + `docs/runbooks/deploy.md` (estado real 2026-10-03) | Deploy |
| Segredos via AWS Secrets Manager no boot (`instrumentation.ts`, `src/server/config/secrets.ts`) | produção — loader fail-closed, SM autoritativo, Edge-safe (import dinâmico sob `NEXT_RUNTIME==='nodejs'`); no-op em dev sem `AWS_SECRET_NAME` | verificado ao vivo (`pnpm dev`: `/instrumentation` compila, health 200) + `pnpm build` verde | Deploy |
| CRUD company: PATCH versionado + 409 + no-op + archive/restore | produção — rotas PATCH/archive em /datasets/{id}/companies/{record_id}; UI de edição consumindo | tests/contract/crud.test.ts 12/12 (CRUD01-05, AUD01/05, DATA02) | Fase 2 |
| Detalhe com avaliação individual + sinais/contatos | produção — GET {record_id} (assessment pela cache key ou computa); UI /app/:id/companies/:id | crud.test.ts (detalhe) + e2e jornada 2 | Fase 2 |
| Histórico append-only por campo (before/after) | produção — GET {record_id}/history?field= ; UI com filtro | AUD05 (reversões consultáveis) | Fase 2 |
| Importação CSV com prévia→commit atômico (7 targets) | produção — POST /imports + commit + GET; UI ImportPanel | tests/contract/imports.test.ts (IMP02-10+overwrite+concorrência) | Fase 3-A |
| Normalização de importação pura (doc 01 §5) | produção — usada pelo pipeline de imports | tests/domain/normalize.test.ts | Fase 3-A |
| Regras versionadas (rascunho→publicação c/ linhagem) | produção — /ruleset, /rulesets/drafts, /publish (RULESET_CONFLICT), /history; UI /rules | tests/contract/related-rules.test.ts (RULE01-04) | Fase 3-B |
| CRUD relacionados versionados (signals/contacts/opportunities) | produção — coleção+item+archive+history por entidade; bloqueio c/ pai arquivado | tests/contract/related-rules.test.ts (CRUD análogos + CRUD05) | Fase 3-B |
| Jobs de análise duráveis (fila SKIP LOCKED, scopes, retry) | produção — POST/GET /analysis-jobs + /retry; contadores reconciliados dos estados persistidos | tests/contract/ai-review-metrics.test.ts (AI06-08) | Fase 4 |
| Adaptador de IA (fixture determinístico + validações doc 06) | produção — heurísticas com quote literal, relação recalculada server-side, provider openai stub explícito sem chave | AI01-05; INV-10 | Fase 4 |
| Revisão transacional c/ staleness campo-a-campo | produção — /suggestions/{id}/decision; accept aplica c/ source=ai_acceptance; stale persistido em tx própria | REV01-07 | Fase 4 |
| Cronômetro server-side + métricas + CSV | produção — /review-sessions(+events), /metrics(.csv); amostra válida exclui interrupted/abandoned | MET01-06 | Fase 4 |
| UI IA: analisar/sugestões/cronômetro + métricas | produção — painel no detalhe com can_accept honesto e trecho citado; tela /metrics | e2e jornada 4 | Fase 4 |
