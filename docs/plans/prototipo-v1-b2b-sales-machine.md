# Plano de Implementação — Prototótipo v1 · B2B Sales Machine (ITA Challenge G2 · Allya)

> Gerado a partir de entrevista de discovery em 2026-10-02 (skill role-play); revisado por plan-review em 2026-10-02.
> Contrato de referência: pacote de especificação v1.0.0 na raiz deste repo
> (`00`–`10_*.md`, `contracts/openapi.yaml`, `contracts/rules-default-v1.json`).
> **Regra de ouro:** divergência entre código e especificação corrige o pacote antes de implementar — nunca resolve silenciosamente de um lado só.

## Contexto e Motivação

O pacote de especificação v1.0.0 está completo e verificado (52 testes do motor aprovados, OpenAPI conferido, seed íntegro), mas não existe aplicação. Este plano implementa o **protótipo v1**: a jornada navegável ponta a ponta para o Demo Day, provando a tese central do desafio —

> IA interpreta evidências · Humanos validam decisões ambíguas · Código aplica regras objetivas · O sistema preserva a rastreabilidade.

Por decisão do dono (P2), o "frontend mockado" evoluiu para um **backend v0 real**: route handlers TypeScript + Prisma + PostgreSQL (banco dedicado na instância RDS `mindville_db`). Isso coloca dentro do v1 as etapas 0–2 da spec (auth, CRUD versionado, auditoria append-only, motor determinístico, snapshots) mais importação CSV, regras versionadas e o fluxo de IA com adaptador configurável.

## Decisões Arquiteturais

| # | Decisão | Opção escolhida | Justificativa |
|---|---------|-----------------|---------------|
| 1 (P1) | Estratégia de avaliação | Motor de referência **real** rodando server-side nos route handlers (`src/domain/scoring`, puro, 52 testes) | Edição recalcula gate/score de verdade; o módulo é reusado pelo backend da fase B; respeita a regra "frontend não recalcula score" |
| 2 (P2) | Persistência | **PostgreSQL na RDS `mindville_db`**, banco dedicado `b2b_sales_machine_dev`, via Prisma | Sobrevive a reload; 409 autêntico entre duas abas; auditoria real no banco; credenciais só em `.env` gitignored |
| 3 (P3) | Escopo de telas | **Núcleo em ondas** — 4 fases demoáveis, roteiro do doc 09 §4 como aceite | O núcleo avaliado (ICP→ranking→explicabilidade→conflito→histórico) fica pronto primeiro |
| 4 (P4) | Importação | **Só os 7 CSVs de `templates/`** no v1 (pipeline prévia→commit completo); parser XLSX das 13 abas na onda seguinte | Mesma semântica de negócio por fração do esforço; XLSX é requisito do desafio que fica explicitamente para a próxima onda — a narrativa do Demo Day não deve prometer upload do XLSX original |
| 5 (P5) | IA | **Adaptador configurável da spec**: provedor LLM real (env `AI_PROVIDER`/`AI_MODEL`/`AI_API_KEY`, endpoint OpenAI-compatible) + provider fixture para dev sem rede | O adaptador é o desenho do doc 04 §7; as validações do doc 06 (trecho literal verificado, descarte de saída inválida) são obrigatórias em qualquer cenário |
| 6 (P6) | UI | **Tailwind v4 + design tokens Autarkeia + shadcn/ui temado** (Radix + lucide; TanStack Table) | Polimento de Demo Day com acessibilidade Radix; tokens portados do `autarkeia-method`; decisão F1 fixada sem alternativas |
| 7 (P7) | Testes | **Contrato + e2e Playwright nas 4 jornadas críticas** | Cada jornada é um critério de aceite da spec; a demo fica ensaiada; TDD em todas as fases |
| 8 | Demo | **Local** (notebook), deploy hospedado fora de escopo | O modelo de estado (RDS remoto + app local) não exige infra extra |
| 9 | Estrutura | **App único Next.js App Router** com domínio puro isolado em `src/domain/` | Sem monorepo no v1; o módulo de domínio é extraível para backend B sem reescrita |
| 10 | Stack | Espelhar `autarkeia-method`: Next 15.5, React 19, TypeScript strict/ESM, pnpm 9.15.9, Prisma 6, Tailwind v4, vitest, Playwright, lucide-react, zod | Versões já validadas no ecossistema; mesmo idioma de ferramentas |

## Visão Geral da Solução

```
Navegador (pt-BR)
  └─ Next.js App Router — telas com tokens Autarkeia (sidebar ink, hairlines, radius-0)
       └─ fetch /api/v1/*  (mesmo domínio; cookie de sessão HttpOnly + CSRF)
            └─ Route Handlers = API contratada (contracts/openapi.yaml, 53 operações)
                 ├─ auth: Argon2id + sessão opaca + CSRF + rate limit
                 ├─ idempotência: middleware único para todo POST de negócio marcado no OpenAPI
                 ├─ datasets/companies/signals/contacts/opportunities: CRUD versionado + 409
                 ├─ audit: trigger PostgreSQL append-only na MESMA transação
                 ├─ scoring: src/domain/scoring (puro, 4 casas decimais, determinístico)
                 ├─ assessments: snapshots imutáveis, cache (dataset, data_rev, review_rev, ruleset, as_of)
                 ├─ imports: pipeline prévia→commit atômico (CSVs)
                 ├─ rules: rascunho→publicação versionada com linhagem
                 ├─ ai-analysis: job durável (fila em Postgres, lease) + adaptador provider|fixture
                 ├─ review: aceite transacional com staleness campo a campo
                 └─ metrics: review_sessions server-side + CSV do experimento
                      └─ PostgreSQL (RDS b2b_sales_machine_dev) — app role restrito; migrations com role próprio
```

Fontes normativas por camada: schema de dados e importação = doc 01; fórmulas = doc 02 + `rules-default-v1.json`; HTTP = `contracts/openapi.yaml` + doc 03; backend = doc 04; telas = doc 05; IA = doc 06; auditoria/segurança = doc 07; aceite = doc 08.

## Estrutura de diretórios (alvo)

```
b2b-sales-machine/
  app/                          # App Router: (auth)/login, (app)/[datasetId]/…, api/v1/…
  src/
    domain/                     # PURO, sem IO — extraível para a fase B
      scoring/                  # motor portado de tools/scoring-reference.mjs + validação de regras
      normalize/                # normalização de importação (doc 01 §5)
    server/
      db/                       # client Prisma, transações, set_config de ator
      audit/                    # leitura da trilha; escrita é trigger SQL
      auth/                     # sessão, CSRF, rate limit
      services/                 # datasets, companies, imports, rules, review, metrics
      ai/                       # adaptador: provider interface + openai-compatible + fixture
    components/                 # primitivos shadcn/ui temados + telas
    lib/                        # client da API no navegador, csrf, formatadores
  prisma/
    schema.prisma               # doc 04 §3 completo
    migrations/                 # inclui SQL: triggers de auditoria, grants, papéis
    seed/                       # carregador de seed/normalized-demo.json (idempotente)
  tests/
    contract/                   # rotas vs OpenAPI (vitest)
    e2e/                        # Playwright: 4 jornadas (dataset demo resetado entre suites)
  contracts/                    # EXISTENTE — espelho normativo (openapi, types, defaults)
  seed/ examples/ templates/    # EXISTENTES — insumos do pacote, imutáveis
  docs/
    plans/                      # este plano
    api/README.md               # aponta openapi.yaml como fonte normativa dos endpoints
    architecture.md             # decisões de arquitetura do protótipo
  AGENTS.md  CAPABILITIES.md    # governança do projeto
```

## Invariantes

Cada invariante é um predicado, vale em todo ponto quiescente e tem verificação que falha se (e somente se) ele for violado.

| ID | Invariante | Verificação |
|----|------------|-------------|
| INV-1 | Toda linha de negócio alterada por transação commitada tem **exatamente um** `audit_event` com `version_after` igual à versão atual da linha, `changed_fields` correto e `actor_user_id` **nunca** nulo (seed usa ator técnico, nunca null). | SQL de conferência trilha↔tabelas; teste AUD01 |
| INV-2 | Nenhum principal da aplicação executa UPDATE, DELETE ou TRUNCATE sobre `audit_events`, e nenhum INSERT direto arbitrário existe nela (escrita só pela função de auditoria). | AUD03 + consulta de grants (`has_table_privilege`) |
| INV-3 | Nenhuma rota de escrita aceita do cliente `id`, `dataset_id`, `created_by`, `updated_by` ou timestamps; a autoria gravada vem **sempre** da sessão. | AUD04 |
| INV-4 | Um PATCH com `expected_version` diferente da versão atual do registro altera **zero** linhas e responde 409. | CRUD02 |
| INV-5 | Nenhuma resposta de avaliação representa campo `null` como fator 0/false/zero; empresa `pending` **nunca** tem `in_icp=false`; empresa `out` ou `pending` **nunca** tem `priority` não nulo. | SCORE02 + query sobre snapshot |
| INV-6 | Toda posição de todo `ranking_snapshot` pertence a empresa com `gate.state=in` sob as regras do próprio snapshot. | Query sobre ranking_snapshots |
| INV-7 | Duas avaliações com a mesma cache key `(dataset_id, data_revision, review_revision, ruleset_id, as_of)` produzem a mesma decomposição e as mesmas posições, byte a byte. | Teste de reprocessamento + hash |
| INV-8 | O conteúdo de um `ranking_snapshot` criado **nunca** muda após a criação. | Hash antes/depois de novas avaliações (RANK02/AUD06) |
| INV-9 | Um commit de importação contendo qualquer erro deixa o banco exatamente como estava (zero efeitos parciais). | IMP04 |
| INV-10 | Nenhuma sugestão publicada cita trecho que não ocorra **literalmente** no `evidence_text` de um sinal ativo com `source_allowed=true` da mesma empresa. | AI05 + query sobre suggestions |
| INV-11 | Nenhuma mutação de cadastro tem `source=ai_acceptance` sem `review_decisions` correspondente de usuário autenticado; nenhuma sugestão terminal é resolvida duas vezes. | REV03/REV04 + query |
| INV-12 | Nenhuma mutação de negócio é aceita sem sessão válida, token CSRF e origem permitida. | AUTH03 |
| INV-13 | Nenhum segredo (senha, chave de API, `DATABASE_URL`) está versionado no repo, logado ou retornado por qualquer resposta. | Grep + testes de sanitização de DTO/log |
| INV-14 | Nenhum cálculo de avaliação usa rascunho de ruleset ou abas de referência (`Ranking_Referencia`, `Casos_Validacao`) como entrada. | RULE01–03 + teste do motor com fixture proibida |

Cobertura: CRUD (INV-1/3/4), trilha (INV-1/2), ranking/avaliação (INV-5/6/7/8), importação (INV-9), IA (INV-10/11), autenticação (INV-12), segredos (INV-13), regras (INV-14). Máquinas de estado cobertas pelos testes de aceite: gate (in/out/pending), sugestão (pending/deferred→accepted/rejected/stale), job (queued/running/completed/partial_failed/failed), ruleset (draft/published), sessão de revisão (active/paused/completed/abandoned).

## Fases de Implementação

### Fase 0: Fundação e infraestrutura
> Objetivo: repo governado, app de pé, banco provisionado, seed carregável, motor verde no novo lar.
> Entregável: `pnpm dev` sobe a app com health 200, banco migrado no RDS dev, seed idempotente carregado, 52 testes do motor verdes, CAPABILITIES.md iniciada.

#### 0.1 Governança do repo
- **O quê:** `git init` (branch `main`, sem commit direto — commits via PR), `AGENTS.md` do projeto (herdando convenções do workspace: pnpm, ESM, pt-BR, never-push-to-main), `CAPABILITIES.md` scaffold, `.gitignore` (`.env`, `node_modules`), `.env.example` (nomes de variáveis, sem valores).
- **Onde:** raiz do repo.
- **Como:** seguir `issue-e-plano-primeiro` — criar issue no Linear referenciando este plano como primeiro ato de execução; repo remoto em `autarke-ia/b2b-sales-machine`.
- **Critério de done:** repo inicializado (local + remoto), `.env` real presente localmente e jamais versionado.

#### 0.2 Scaffold da aplicação
- **O quê:** Next.js 15.5 + React 19 + TS strict + ESM + Tailwind v4 + PostCSS; scripts `dev/build/typecheck/test/lint`; ESLint básico.
- **Onde:** raiz; `app/`, `src/`.
- **Como:** pinar versões no `package.json` (`packageManager: pnpm@9.15.9`), espelhando `autarkeia-method`.
- **Testes:** `pnpm typecheck && pnpm lint` verdes; `/api/v1/health` responde 200.
- **Critério de done:** build limpo do scaffold.

#### 0.3 Design tokens Autarkeia
- **O quê:** portar o sistema de tokens como fonte única de cor — bloco `@theme`, base e utilitários (`interactive`, `interactive-ink`, `eyebrow`, `on-ink`, `num`, `mono`, tints, durações de motion, densidades de linha, foco).
- **Onde:** `src/app/globals.css` (adaptado de `projects/autarkeia-method/src/app/globals.css` — FE-1/AUT-124); Poppins via `next/font` com a variável `--font-poppins` como nos irmãos.
- **Como:** nenhum hex fora do `globals.css`; primitivos **shadcn/ui** (decisão F1, fixada) configurados para consumir as variáveis: radius-0, hairlines sem sombra, sidebar ink como peça-clímax, hover por shift de superfície (R1).
- **Testes:** smoke visual da página placeholder; contraste AA dos pares usados.
- **Critério de done:** tela placeholder com sidebar ink, eyebrow com filete magenta e tabela com hairlines — cara de produto Autarkeia.

#### 0.4T — Testes de banco e auditoria (primeiro, vermelho)
- **O quê:** scripts de verificação que falham antes das migrations existirem: credencial da app negada em UPDATE/DELETE/TRUNCATE de `audit_events` (AUD03), rollback atômico dado+trilha em falha deliberada (AUD02), sem `actor_user_id` nulo (INV-1), grants conforme INV-2.
- **Onde:** `tests/contract/db-audit.test.ts` (executa contra o banco dev real).
- **Critério de done:** suíte existe e está **vermelha**.

#### 0.4I — Prisma + RDS + triggers de auditoria
- **O quê:** schema completo do doc 04 §3 (users, sessions, datasets, companies, signals, contacts, opportunities, rulesets, source_files, import_batches/rows, analysis_jobs(+items), suggestions, review_decisions, assessments, ranking_snapshots, review_sessions(+events), audit_events, idempotency_records, login_attempts) com constraints e índices mínimos.
- **Onde:** `prisma/schema.prisma`, `prisma/migrations/` (SQL manual para triggers e grants).
- **Como:** banco **novo** `b2b_sales_machine_dev` dentro da instância RDS `mindville_db` (nada da Mindville é tocado). Duas credenciais: `DATABASE_URL` (app: sem UPDATE/DELETE/TRUNCATE em `audit_events`, sem DDL) e `DATABASE_MIGRATION_URL` (owner: migrations + grants). Triggers de auditoria gravam before/after na mesma transação; função de escrita da trilha com `SECURITY DEFINER` owner ≠ app, `search_path` fixo. **Nenhuma migration toca outros bancos da instância; rollback = forward-fix + `db:reset-demo`.** `DATABASE_URL` só em `.env` local (gitignored).
- **Critério de done:** `prisma migrate deploy` aplicado; **0.4T verde**.

#### 0.5T — Testes de seed e usuários (primeiro, vermelho)
- **O quê:** testes: seed rodado duas vezes = zero duplicados e zero audit de no-op (IMP05/DATA01); counts 120/287/120/70; dataset demo com `default_as_of=2026-09-30` e ruleset publicado v1; **usuários pré-cadastrados de dev existem** (≥2, para o conflito 409) com credenciais vindas de env fora do git; nenhum segredo no seed.
- **Onde:** `tests/contract/seed.test.ts`.
- **Critério de done:** suíte vermelha.

#### 0.5I — Seed idempotente, reset de demo e usuários
- **O quê:** carregador de `seed/normalized-demo.json` (120 empresas, 287 sinais, 120 contatos, 70 oportunidades) + `rules-default-v1.json` como ruleset publicado inicial; dataset demo `kind=demo`, `is_synthetic=true`; ator técnico sem login (UUID `3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9`) antes das FKs de autoria; usuários de dev via `SEED_USERS`/env com Argon2id.
- **Onde:** `prisma/seed/`, scripts `db:seed` e `db:reset-demo` (recria o dataset demo sob demanda explícita — nunca reset destrutivo no boot, doc 01 §8).
- **Critério de done:** **0.5T verde**; hash do XLSX original registrado em `source_files`.

#### 0.6T — Porta da suíte do motor (primeiro, vermelho)
- **O quê:** portar os **52 testes** de `tests/scoring.test.mjs` para vitest apontando para `src/domain/scoring` (ainda inexistente) — inclui o perfil do seed → 56 in / 37 out / 27 pending.
- **Onde:** `tests/domain/scoring.test.ts`.
- **Critério de done:** suíte vermelha.

#### 0.6I — Motor de domínio
- **O quê:** portar `tools/scoring-reference.mjs` → `src/domain/scoring` (funções puras: fatores, gate L/U, prioridade S01–S10, decomposição, desempate, precisão de 4 casas) + `validateRuleConfig` (somas 100 por grupo, D03 indesativável, bandas válidas). **JSDoc obrigatória** nas invariantes do cálculo (L/U, clamp, desempate lexical, S08/S10).
- **Onde:** `src/domain/scoring/`.
- **Critério de done:** **0.6T verde**; motor importável pelo server sem arrastar IO.

#### 0.7 Documentação viva
- **O quê:** `docs/api/README.md` estabelecendo `contracts/openapi.yaml` como fonte normativa dos endpoints (toda rota nova/change atualiza o contrato no mesmo PR); `docs/architecture.md` com as decisões da tabela acima; `CAPABILITIES.md` com capacidades reais marcadas (produção/parcial/scaffold) — **atualizada ao fim de cada fase** (obrigação keep-capabilities-current).
- **Onde:** `docs/`, raiz.
- **Critério de done:** três arquivos existem e refletem o estado real.

### Fase 1: Auth, base, lista e ranking
> Objetivo: jornada login → base demo → lista → ranking determinístico com snapshot.
> Entregável: passos 1–2 do roteiro de demo (doc 09 §4), com CSV exportável igual à tela.

#### 1.1 TDD — contratos de auth/schema/datasets/idempotência
- **O quê:** testes de contrato (vitest, banco dev) para `/health`, `/auth/login|session|logout`, `/schema`, `GET /datasets`, `GET /datasets/{id}/companies` — envelopes `{data,meta}`, paginação, erros tipados, AUTH01–04, DATA01, e **idempotência**: repetição de POST com mesma `Idempotency-Key` + payload retorna o resultado original; chave + payload divergente → 409 (doc 03 §4).
- **Onde:** `tests/contract/`.
- **Critério de done:** suíte vermelha.

#### 1.2 Implementação — auth, sessão e idempotência
- **O quê:** login Argon2id, sessão opaca (hash server-side, expiração 8h, revogação no logout), cookie `allya_session` HttpOnly/SameSite=Lax/Path=/api/v1, token CSRF em memória no cliente + header `X-CSRF-Token`, checagem de Origin, rate limit 5 tentativas/15min por usuário+IP (tabela `login_attempts`, sem Redis), `401/403` conforme doc 03 §2–3; **middleware de idempotência reutilizável** (chave 16–100 chars, escopo usuário+método+rota, TTL 24h, hash canônico do payload) usado por todo POST de negócio.
- **Onde:** `src/server/auth/`, `src/server/services/idempotency`, `app/api/v1/auth/`.
- **Critério de done:** 1.1 verde; INV-3/12 e INV-13 cobertos.

#### 1.3 Implementação — datasets e listagem
- **O quê:** `GET /schema` (do `contracts/field-catalog.json`), datasets, listagem de companies com filtros `icp_state/segment/uf/q` (AND, substring case-insensitive), ordenação `external_id ASC, id ASC`, paginação 25/100, arquivadas fora do padrão.
- **Onde:** `src/server/services/`, `app/api/v1/datasets/`.
- **Critério de done:** contratos de 1.1 verdes.

#### 1.4 Implementação — avaliação e ranking
- **O quê:** `GET /ranking`: avalia o dataset inteiro com o motor (`evaluateCompany`), materializa `ranking_snapshots` imutável (posições congeladas), reuso por cache key `(dataset_id, data_revision, review_revision, ruleset_id, as_of)`, `is_stale` + `current_dataset_revision`, filtros preservando posição original, `ranking.csv` (BOM, cabeçalho fixo, neutralização de fórmula, ponto decimal). **Nota:** `priority.status=preliminary` é o comportamento esperado nesta fase (nenhuma revisão humana concluída ainda — a revisão chega na Fase 4).
- **Onde:** `src/server/services/assessments`, `app/api/v1/datasets/[id]/ranking`.
- **Testes:** RANK01–05 + SCORE01–10 já cobertos pelo motor; contrato do CSV; INV-5/6/7/8.
- **Critério de done:** ranking do seed sob defaults = 56 posições; snapshot reusado entre chamadas; CSV idêntico à tela; **CAPABILITIES.md atualizada**.

#### 1.5 UI — login, shell, lista, ranking
- **O quê:** tela de login; shell com sidebar ink + seleção de base + badge "Dados fictícios"; lista com filtros e visão de arquivadas; ranking com decomposição expansível por linha (fator/peso/pontos/campo de origem), faixas, `preliminary/reviewed`, pendências, disponibilidade de decisor; estados loading/vazio/erro em tudo; export usa o snapshot exibido.
- **Onde:** `app/(auth)/login`, `app/(app)/[datasetId]/companies|ranking`, `src/components/`.
- **Testes:** e2e jornada 1 (login→ranking) em `tests/e2e/`, com `db:reset-demo` antes da suite.
- **Critério de done:** **Jornada 1 e2e verde.**

### Fase 2: Detalhe, edição, 409, auditoria, decomposição
> Objetivo: passos 3–5 do roteiro — recálculo por edição, conflito real, histórico append-only.
> Entregável: dois usuários (duas abas) editam; 409 honesto; antes/depois consultável.

#### 2.1 TDD — CRUD versionado e auditoria
- **O quê:** testes CRUD01–05, AUD01–06, DATA02 (ID de outra base rejeitado), no-op sem evento (CRUD03), payload com `updated_by` rejeitado (AUD04), reversões consultáveis (AUD05), score histórico explicável (AUD06).
- **Onde:** `tests/contract/`.
- **Critério de done:** suíte vermelha.

#### 2.2 Implementação — escrita transacional
- **O quê:** PATCH `company` com `expected_version` + `changes` (campos imutáveis/autoria rejeitados), `UPDATE … WHERE version=?` atômico, incremento de versão + `input_revision` + `dataset.data_revision`, evento de auditoria via trigger (before/after, `changed_fields`, actor do contexto de transação via `set_config(..., true)`, origem `manual`), archive/restore (POST `/{id}/archive`), `GET …/history` com filtro por campo. **JSDoc obrigatória** na invariante transacional (ordem de locks, contexto LOCAL de transação).
- **Onde:** `src/server/services/companies`, `src/server/audit/`, `app/api/v1/datasets/[id]/companies/`.
- **Critério de done:** 2.1 verde; INV-1/3/4 confirmados por teste.

#### 2.3 Implementação — detalhe
- **O quê:** `GET /companies/{id}` → `CompanyDetail` + avaliação (gate L/U com motivo, prioridade com `score/score_min/score_max`, decomposição por critério com campos e evidências ligadas, motivo de S10 ausente e D05 desconhecido).
- **Onde:** `app/api/v1/datasets/[id]/companies/[recordId]/`.
- **Critério de done:** contrato + snapshot de avaliação consistentes com o motor.

#### 2.4 UI — detalhe e edição
- **O quê:** cabeçalho com estado do gate (in/out/pending — `in_icp=null` nunca vira falso booleano); editor tipado (três opções para booleanos/níveis; nunca inicializar desconhecido no primeiro item); seções "ICP" e "Prioridade" **separadas** (a nota de ICP nunca é exibida como score); histórico com antes/depois, autor, origem, filtro por campo e cópia de valor antigo para nova edição; 409 → conflito explicado com recarregamento preservando rascunho local.
- **Onde:** `app/(app)/[datasetId]/companies/[companyId]`.
- **Testes:** e2e jornada 2 (editar → recálculo → 409 entre abas → histórico).
- **Critério de done:** **Jornada 2 e2e verde; CAPABILITIES.md atualizada.**

### Fase 3: Importação CSV, CRUD relacionados e regras
> Objetivo: passo 6 parcial (CSV) + RF04/RF05 completos.
> Entregável: novo CSV muda dados com proveniência; regras mudam só após publicação; ranking recomputa.

#### 3.1 TDD — pipeline de importação
- **O quê:** IMP02–IMP10 no recorte CSV: resolução `company_external_id`, erros por linha, lote atômico (IMP04), reimport no-op (IMP05), blanks não apagam e `__NULL__` só em overwrite confirmado (IMP06), `IMPORT_PREVIEW_STALE` (IMP07), idempotência de duplo commit (IMP08), regras→rascunho sem publicar (IMP09), fórmula textual/limites rejeitados (IMP10).
- **Critério de done:** suíte vermelha.

#### 3.2 Implementação — imports
- **O quê:** `POST /imports` (multipart, target, merge_policy, hash SHA-256), prévia (contagens, até 100 linhas, erros/avisos paginados em `/issues`, expiração 24h), `/commit` com `expected_version`/`expected_dataset_revision`/Idempotency-Key, `fill_missing`/`overwrite_non_null`, identidade estável por conteúdo para sinais/contatos sem ID legado, regras importadas → rascunho completo.
- **Onde:** `src/domain/normalize/`, `src/server/services/imports`, rotas `/imports`.
- **Critério de done:** 3.1 verde; proveniência `import` com import_id na trilha (INV-9).

#### 3.3 Implementação — CRUD relacionados
- **O quê:** CRUD de signals/contacts/opportunities (mesma mecânica de versão/audit/archive; FK composta `(company_id, dataset_id)`; bloqueio de escrita com pai arquivado — CRUD05; trocar company_id exige criar+arquivar).
- **Critério de done:** contratos verdes; D03/S09 reconhecem os campos `is_professional_public`/`source_allowed`.

#### 3.4 Implementação — regras versionadas
- **O quê:** rascunho completo a partir da ativa, publicação com expected active ruleset (`RULESET_CONFLICT`), imutabilidade de publicadas, `base_ruleset_id` (linhagem), history encadeado, soma 100 por grupo (`RULE_WEIGHTS_MUST_SUM_100`), D03 sem toggle.
- **Testes:** RULE01–04; INV-14.
- **Critério de done:** publicação altera data_revision e invalida snapshots com `is_stale=true`.

#### 3.5 UI — uploads e regras
- **O quê:** ação "Importar CSV" por entidade/grupo de regras com modelo e descrição; prévia com contagens criar/alterar/ignorar, erros, avisos, derivações (ex.: UF → `operates_in_brazil`) e difs de overwrite; confirmação desabilitada para `invalid/expired`; tela de regras (Gate ICP, Priorização, Desqualificadores) com totais, rascunho, resumo pré-publicação e versões publicadas somente-leitura.
- **Testes:** e2e jornada 3 (import CSV → prévia → commit → regra publicada → ranking muda).
- **Critério de done:** **Jornada 3 e2e verde; CAPABILITIES.md atualizada.**

### Fase 4: IA, revisão humana e métricas
> Objetivo: passos 6–8 do roteiro — interpretação de evidências com controle humano e a hipótese operacional instrumentada.
> Entregável: sugestão real aceita muda um campo e recalcula gate/score; conta pode sair do ICP; tempo de validação medido.

#### 4.1 TDD — IA, revisão e métricas
- **O quê:** AI01–08 (trecho literal obrigatório, quote inexistente/ID alheio rejeitados, prompt injection inerte, fonte bloqueada fora do prompt, `partial_failed` com retry das falhas, worker restart não duplica, fictício sem data não pontua S08), REV01–07 (aceite transacional, confirmação sem update fictício, stale por campo-alvo, campo independente continua utilizável, aceite tira do ICP), MET01–06 (cronômetro server-side, idempotência de eventos, `interrupted` fora da amostra, denominadores explícitos, `unassigned`).
- **Critério de done:** suíte vermelha.

#### 4.2 Implementação — jobs duráveis
- **O quê:** `analysis_jobs(+items)` com estado por empresa, fila em PostgreSQL com lease e retomada de lease expirado, contadores `processed+failed+skipped=requested`, scopes `icp_gaps` (pending) e `eligible_enrichment` (in), out = skipped com motivo, seleção de sinais (≤50 por empresa, `source_allowed=true`, data desc, `coverage_truncated` registrado), 202 + polling.
- **Onde:** `src/server/services/ai-analysis`, worker in-process durável (sem Redis).
- **Critério de done:** AI06/AI07 verdes.

#### 4.3 Implementação — adaptador de IA
- **O quê:** interface `AiProvider`; implementação OpenAI-compatible configurável por env (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`) + `fixture` provider para dev sem rede (rotulado); prompt-base do doc 06 §9 versionado; validações do doc 06 no backend: recalcular `confirmation|contradiction|fill|inconclusive` comparando valores normalizados, verificar trecho literal no `evidence_text` e vínculo com a empresa, descartar saída inválida como falha registrada, nunca aceitar metadados do modelo, `proposed_value=null` só em inconclusão. **JSDoc obrigatória** nas validações (INV-10) e na política de staleness (INV-11).
- **Onde:** `src/server/ai/`.
- **Critério de done:** AI01–05 verdes com provedor fixture e com provedor real (contra chave de teste); job registra modelo/prompt_version/uso.

#### 4.4 Implementação — revisão
- **O quê:** decisão `accept|reject|defer` transacional (decisão append-only → alteração de campo se houver → trigger audita com `source=ai_acceptance` e suggestion_id → `input_revision`/`review_revision` → status da sugestão → idempotência), staleness campo a campo (409 `SUGGESTION_STALE` sem "forçar"), `ACTION_ALREADY_RESOLVED`, duplicadas deduplicadas por campo+valor+evidências, aceites que retiram conta do ICP removem do ranking atual.
- **Critério de done:** REV01–07 verdes; INV-11 confirmado.

#### 4.5 Implementação — sessões de revisão e métricas
- **O quê:** `review_sessions(+events)` com acumulação server-side (pausa/retomada/conclusão/abandono, `interrupted` com `timing_quality`), vínculo decisão↔sessão aberta do mesmo usuário/empresa (`unassigned` senão), `GET /metrics` (média/mediana de sessões completas, aceites/rejeitados/pendentes por relação, taxa de aceitação com denominador explícito) e `metrics.csv` com o schema do doc 08 §9.
- **Critério de done:** MET01–06 verdes.

#### 4.6 UI — sugestões, cronômetro e métricas
- **O quê:** botões "Analisar lacunas do ICP"/"Analisar sinais" por estado (lote = IDs explícitos); progresso do job com polling + `AbortController` na troca de tela; cards de sugestão separando fato importado de interpretação IA (campo, valor atual/proposto, relação, confiança, justificativa, trecho exato, origem/linha); Aceitar/Rejeitar/Manter pendente com `can_accept`/`blocked_reason` honestos; cronômetro como projeção do servidor; tela de métricas com "Sem observações" para null.
- **Testes:** e2e jornada 4 (gerar análise → revisar → aceite muda campo → recálculo/saída do ICP → métricas).
- **Critério de done:** **Jornada 4 e2e verde; roteiro do doc 09 §4 completo; CAPABILITIES.md atualizada.**

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| RDS inacessível do ambiente de execução (security group/`publicly accessible`) | Média | Alto | Validar conectividade na Fase 0 antes de qualquer código; fallback: tunnel/SG restrito por IP; credenciais nunca no repo |
| Migrations em instância RDS **compartilhada** com outros projetos | Baixa | Alto | Banco dedicado `b2b_sales_machine_dev`; nenhuma migration referencia outros bancos; rollback = forward-fix + `db:reset-demo`; role de migrations separado da credencial da app |
| Latência/instabilidade do RDS no dia da demo | Média | Alto | Volume minúsculo (120 empresas); demo local com retry de conexão; snapshot do ranking reduz leituras |
| Divergência código ↔ especificação | Média | Médio | Os docs do pacote são normativos por área; suíte de contrato contra o OpenAPI; regra do README: corrigir o pacote primeiro |
| Chave/provedor de LLM indisponível | Média | Médio | Provider `fixture` rotulado como modo dev/demo sem rede; validações do doc 06 são independentes de provedor |
| Scope creep no normalizador de importação | Alta | Médio | Recorte D2 (só CSVs); doc 01 §3–5 como checklist fechado; erros não-previstos viram erro tipado, não exceção silenciosa |
| Narrativa do Demo Day prometer upload de XLSX | Média | Médio | XLSX está fora do v1 por decisão D2 — roteiro demonstra importação por CSV e registra a onda seguinte |
| Concorrência de edits com cache de snapshot | Baixa | Médio | `review_revision` na cache key desde a Fase 2; testes RANK04/AUD06 |
| Agenda do Demo Day desconhecida | Média | Médio | Fases demoáveis independentes — o que estiver pronto é demonstrável |

## Critérios de Sucesso

1. Roteiro do doc 09 §4 executado inteiro (com importação via CSV, conforme D2), incluindo conflito real entre duas abas e 409 sem perda silenciosa.
2. Os 52 testes do motor verdes; perfil do seed sob defaults = 56 in / 37 out / 27 pending.
3. AUD01–06 passando contra o PostgreSQL dev (credencial da app negada na trilha; rollback atômico dado+auditoria).
4. Sugestão de IA real aceita muda um campo, audita com `source=ai_acceptance` e recalcula gate/score — inclusive saindo do ICP (REV07).
5. Ranking determinístico com snapshot imutável, `is_stale` correto e CSV idêntico à tela.
6. Meta operacional mensurável: sessões de validação manual vs. assistido com tempo server-side e exportação — instrumento pronto para o experimento (a meta <8min é para medir, não pré-condição de entrega).
7. Invariantes INV-1…INV-14 verificáveis e verdes no banco dev.

## Fora de Escopo

- Parser XLSX das 13 abas (onda seguinte; D2).
- Deploy hospedado (Vercel/contêiner) e domínio próprio.
- Multitenancy comercial, RBAC, billing, cadastro público de usuários, SSO.
- Busca externa, scraping, LinkedIn, CNPJ real, descoberta de leads, envio de mensagens (recorte da mentora de 30/09).
- Geração de abordagens/campanhas; CRM completo.
- Monorepo e backend independente (avaliar na fase B); backend PHP.
- `Ranking_Referencia`/`Casos_Validacao` como entrada de motor ou IA.
- Frontend recalculando score (o servidor é a única fonte de avaliação).
