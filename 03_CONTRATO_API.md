# 03 · Contrato de comunicação frontend ↔ backend

## 1. Referências normativas

Formato executável: [contracts/openapi.yaml](contracts/openapi.yaml). Espelho JSON: [contracts/openapi.json](contracts/openapi.json). Payloads: [examples/](examples/). Tipos TypeScript gerados são auxiliares; não substituem a validação no backend.

Base: `/api/v1`. JSON UTF-8. Interface em português; nomes técnicos e enums em inglês. Transportar booleanos como booleanos, não strings. IDs UUID e timestamps ISO UTC. Campos desconhecidos em corpos de escrita: `422 VALIDATION_ERROR`.

Este contrato independe de framework/ORM. Não expor modelos Prisma/Eloquent automaticamente: mapear DTOs explícitos. O frontend nunca recebe senha, hash de senha, cookie de sessão, chave de modelo ou string de conexão.

## 2. Sessão e segurança do navegador

`POST /auth/login` recebe e-mail e senha e define cookie `allya_session`, opaco, HttpOnly, Secure em HTTPS, SameSite=Lax, Path=/api/v1. Retorna usuário, expiração e token CSRF. `GET /auth/session` permite recuperar usuário e CSRF após reload. Token CSRF fica em memória; o cookie não fica em localStorage.

Todo método de escrita autenticado exige `X-CSRF-Token` e origem permitida. Login não tem token prévio, mas exige JSON e checagem de Origin. Front e API são servidos no mesmo domínio; em desenvolvimento, preferir proxy local. Sem CORS curinga com credenciais.

`401` encerra o estado local de sessão e pede login; `403 CSRF_INVALID` permite recuperar `/auth/session` uma vez e solicitar repetição consciente da ação, sem loop infinito. Não repetir automaticamente uma mutação sem chave idempotente.

## 3. Envelopes e erros

```json
{"data": {"...": "DTO tipado"}, "meta": {"request_id": "UUID"}}
```

Listas adicionam `meta.pagination={page,page_size,total,total_pages}`. Página inicial 1; page_size padrão 25 e máximo 100. Lista vazia: `data=[]`, total 0, total_pages 0. Página além do final: array vazio, preservando os totais. Campos nullable sempre explícitos nas respostas.

Erro:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "O registro mudou. Atualize os dados antes de salvar.",
    "field_errors": [],
    "details": {"expected_version": 1, "current_version": 2}
  },
  "request_id": "61fe9842-5c77-4d3d-815a-e352a73651a0"
}
```

`message` é para pessoas; a lógica do frontend usa `code`. `details` é metadado extensível de erro, não um canal para retornar stack trace. O servidor gera `request_id` e o devolve também em `X-Request-Id`.

| HTTP | Códigos principais | Tratamento esperado |
|---|---|---|
| 400 | MALFORMED_REQUEST, INVALID_FILE | Explicar formato e permitir correção |
| 401 | UNAUTHENTICATED, SESSION_EXPIRED, INVALID_CREDENTIALS | Pedir login; não revelar se e-mail existe |
| 403 | CSRF_INVALID, ORIGIN_NOT_ALLOWED, SOURCE_BLOCKED | Não continuar a mutação |
| 404 | NOT_FOUND | Registro/base/ID não encontrado; impedir referência cruzada |
| 409 | VERSION_CONFLICT, IMPORT_PREVIEW_STALE, RULESET_CONFLICT, SUGGESTION_STALE, IDEMPOTENCY_CONFLICT, ACTION_ALREADY_RESOLVED, REVIEW_SESSION_ACTIVE | Recarregar estado e apresentar o conflito; nunca sobrescrever cegamente |
| 413/415 | FILE_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | Trocar arquivo ou reduzir tamanho |
| 422 | VALIDATION_ERROR, RULE_WEIGHTS_MUST_SUM_100, UNSUPPORTED_RULE_EXPRESSION, INSUFFICIENT_EVIDENCE, INVALID_STATE_TRANSITION | Erros junto aos campos ou ação |
| 429 | RATE_LIMITED, AI_QUEUE_LIMIT | Respeitar `Retry-After`; não criar outra chave para furar o limite |
| 500 | INTERNAL_ERROR | Mostrar request_id; permitir repetição segura da mesma ação |

## 4. Idempotência e concorrência

Toda ação POST de negócio marcada no OpenAPI exige `Idempotency-Key`, 16–100 caracteres. A chave identifica `(usuário, método, rota concreta, ação)`, dura 24h e está associada ao hash canônico do payload. Para uploads, considerar SHA-256 do arquivo + campos, não o boundary multipart.

Repetir a mesma chave e payload retorna status e corpo do resultado original, sem repetir efeitos ou cobrança de IA. Mesma chave e payload diferente retorna 409. Duas chamadas simultâneas com a mesma chave não executam duas vezes: a segunda espera brevemente ou recebe conflito “em processamento”, podendo consultar/repetir a mesma chave. Registrar a conclusão na mesma transação do efeito local; chamadas externas usam job durável.

PATCH de registro recebe `expected_version` e objeto `changes`. Atualizar somente onde `version=expected_version`; em conflito retornar 409 com versão atual. Não aceitar `updated_by`, `created_by`, `id`, `dataset_id` ou timestamps enviados pelo cliente. Campos imutáveis não aparecem em `changes`.

Arquivar/restaurar usa POST `/{record_id}/archive` com `archived=true|false` e versão. Não há DELETE físico no MVP. Relacionados mantêm a empresa original; trocar company_id exige criar registro correto e arquivar o incorreto, mantendo a história.

## 5. Inventário de operações

| Método e rota | Uso | Sucesso |
|---|---|---:|
| `GET /api/v1/health` | Verificar serviço | 200 |
| `POST /api/v1/auth/login` | Entrar com usuário pré-cadastrado | 200 |
| `GET /api/v1/auth/session` | Recuperar sessão e token CSRF | 200 |
| `POST /api/v1/auth/logout` | Encerrar sessão | 204 |
| `GET /api/v1/schema` | Consultar campos e formatos aceitos | 200 |
| `GET /api/v1/datasets` | Listar bases compartilhadas | 200 |
| `POST /api/v1/datasets` | Criar base vazia com regras iniciais | 201 |
| `GET /api/v1/datasets/{dataset_id}` | Consultar base e revisão | 200 |
| `GET /api/v1/datasets/{dataset_id}/companies` | Listar companies | 200 |
| `POST /api/v1/datasets/{dataset_id}/companies` | Criar Company | 201 |
| `GET /api/v1/datasets/{dataset_id}/companies/{record_id}` | Consultar Company | 200 |
| `PATCH /api/v1/datasets/{dataset_id}/companies/{record_id}` | Editar Company | 200 |
| `POST /api/v1/datasets/{dataset_id}/companies/{record_id}/archive` | Arquivar ou restaurar Company | 200 |
| `GET /api/v1/datasets/{dataset_id}/companies/{record_id}/history` | Consultar histórico de Company | 200 |
| `GET /api/v1/datasets/{dataset_id}/signals` | Listar signals | 200 |
| `POST /api/v1/datasets/{dataset_id}/signals` | Criar Signal | 201 |
| `GET /api/v1/datasets/{dataset_id}/signals/{record_id}` | Consultar Signal | 200 |
| `PATCH /api/v1/datasets/{dataset_id}/signals/{record_id}` | Editar Signal | 200 |
| `POST /api/v1/datasets/{dataset_id}/signals/{record_id}/archive` | Arquivar ou restaurar Signal | 200 |
| `GET /api/v1/datasets/{dataset_id}/signals/{record_id}/history` | Consultar histórico de Signal | 200 |
| `GET /api/v1/datasets/{dataset_id}/contacts` | Listar contacts | 200 |
| `POST /api/v1/datasets/{dataset_id}/contacts` | Criar Contact | 201 |
| `GET /api/v1/datasets/{dataset_id}/contacts/{record_id}` | Consultar Contact | 200 |
| `PATCH /api/v1/datasets/{dataset_id}/contacts/{record_id}` | Editar Contact | 200 |
| `POST /api/v1/datasets/{dataset_id}/contacts/{record_id}/archive` | Arquivar ou restaurar Contact | 200 |
| `GET /api/v1/datasets/{dataset_id}/contacts/{record_id}/history` | Consultar histórico de Contact | 200 |
| `GET /api/v1/datasets/{dataset_id}/opportunities` | Listar opportunities | 200 |
| `POST /api/v1/datasets/{dataset_id}/opportunities` | Criar Opportunity | 201 |
| `GET /api/v1/datasets/{dataset_id}/opportunities/{record_id}` | Consultar Opportunity | 200 |
| `PATCH /api/v1/datasets/{dataset_id}/opportunities/{record_id}` | Editar Opportunity | 200 |
| `POST /api/v1/datasets/{dataset_id}/opportunities/{record_id}/archive` | Arquivar ou restaurar Opportunity | 200 |
| `GET /api/v1/datasets/{dataset_id}/opportunities/{record_id}/history` | Consultar histórico de Opportunity | 200 |
| `GET /api/v1/datasets/{dataset_id}/ruleset` | Consultar regras publicadas | 200 |
| `POST /api/v1/datasets/{dataset_id}/rulesets/drafts` | Criar rascunho completo de regras | 201 |
| `GET /api/v1/datasets/{dataset_id}/rulesets/{ruleset_id}` | Consultar versão de regras | 200 |
| `POST /api/v1/datasets/{dataset_id}/rulesets/{ruleset_id}/publish` | Publicar regras e invalidar avaliações atuais | 200 |
| `GET /api/v1/datasets/{dataset_id}/rulesets/{ruleset_id}/history` | Consultar histórico das regras | 200 |
| `GET /api/v1/datasets/{dataset_id}/ranking` | Consultar ranking somente das empresas dentro do ICP | 200 |
| `GET /api/v1/datasets/{dataset_id}/ranking.csv` | Exportar ranking congelado em CSV | 200 |
| `POST /api/v1/datasets/{dataset_id}/imports` | Validar arquivo e gerar prévia; ainda não altera dados | 201 |
| `GET /api/v1/datasets/{dataset_id}/imports/{import_id}` | Consultar prévia ou importação | 200 |
| `GET /api/v1/datasets/{dataset_id}/imports/{import_id}/issues` | Paginar todos os erros e avisos | 200 |
| `POST /api/v1/datasets/{dataset_id}/imports/{import_id}/commit` | Confirmar importação atomicamente | 200 |
| `POST /api/v1/datasets/{dataset_id}/analysis-jobs` | Solicitar interpretação de sinais da planilha | 202 |
| `GET /api/v1/datasets/{dataset_id}/analysis-jobs/{job_id}` | Consultar progresso da análise | 200 |
| `POST /api/v1/datasets/{dataset_id}/analysis-jobs/{job_id}/retry` | Reprocessar somente contas que falharam | 202 |
| `GET /api/v1/datasets/{dataset_id}/suggestions` | Consultar sugestões e evidências | 200 |
| `POST /api/v1/datasets/{dataset_id}/suggestions/{suggestion_id}/decision` | Aceitar, rejeitar ou adiar sugestão | 200 |
| `POST /api/v1/datasets/{dataset_id}/review-sessions` | Iniciar cronometragem de validação | 201 |
| `GET /api/v1/datasets/{dataset_id}/review-sessions` | Consultar sessões de validação | 200 |
| `POST /api/v1/datasets/{dataset_id}/review-sessions/{session_id}/events` | Pausar, retomar, concluir ou abandonar validação | 200 |
| `GET /api/v1/datasets/{dataset_id}/metrics` | Consultar medidas simples de validação | 200 |
| `GET /api/v1/datasets/{dataset_id}/metrics.csv` | Exportar sessões e decisões para experimento | 200 |

Rotas `history` aceitam filtro opcional `field` e paginação. `GET companies/{id}` retorna `CompanyDetail`; listas retornam `Company`. A avaliação está no detalhe e em cada linha do ranking.

As listas de entidades são ordenadas por `external_id ASC, id ASC`, salvo histórico (data decrescente, ID como desempate) e sugestões (pendentes/adiadas primeiro, created_at crescente, ID). Filtros são AND entre parâmetros; busca `q` é substring case-insensitive em nome ou external_id. `uf` é comparação exata. Não aceitar nomes de coluna livres para ORDER BY.

## 6. Sequências completas

### Login e base

1. Login → guardar usuário e token CSRF em memória.
2. Listar bases → escolher demo ou criar base vazia.
3. GET `/schema` → carregar descritores e explicar formatos.
4. GET `/datasets/{dataset_id}/companies` e `/ranking`.

### Edição manual

1. Ler detalhe com `company.version`.
2. PATCH com `expected_version` e somente campos alterados.
3. Backend grava registro, evento de auditoria e invalidação de avaliações atomicamente.
4. Frontend recebe Company atualizado, invalida detalhe/listas/ranking e busca nova avaliação. Não recalcula score localmente.

```json
{"expected_version":1,"changes":{"employees":650,"hr_structured":true}}
```

### Importação

1. POST multipart para prévia; não definir manualmente Content-Type/boundary no navegador.
2. Mostrar erros, avisos, registros afetados, derivação e política de atualização.
3. POST `/imports/{id}/commit` com versão e revisão de base da prévia.
4. Se a resposta trouxer `rules_draft_id`, abrir comparação/publicação de regras. Não ativar rascunho automaticamente.

### IA e revisão

1. POST `/analysis-jobs` com até 100 IDs explícitos e `scope`.
2. Backend cria job durável e devolve 202 imediatamente após persistência; não espera o modelo terminar.
3. Polling GET a cada 2 segundos; aumentar até 10 segundos se longo; suspender com a aba oculta. Não usar WebSocket/SSE nesta versão.
4. Consultar sugestões por job/empresa. Aceitar/rejeitar/adiar com versões atuais e chave idempotente.
5. `accept` valida origem, evidências, tipo do valor, mudanças no campo desde a base da sugestão e versões dos sinais. Retorna sugestão, empresa e nova avaliação.
6. Se aceitar uma correção retirar a conta do ICP, removê-la do ranking atual e explicar o novo motivo.

### Regras

Ler ativa → editar cópia completa → criar rascunho referenciando a ativa → revisar diferença → publicar com versão do rascunho e ID da regra ativa esperada. Um rascunho não é executado no ranking. Uma edição posterior cria novo rascunho; versões publicadas permanecem imutáveis. Publicação concorrente retorna RULESET_CONFLICT. Cada Ruleset retorna base_ruleset_id; a versão inicial retorna null. A rota history retorna eventos dessa versão e dos ancestrais encadeados por base_ruleset_id, em ordem cronológica decrescente; o event.entity_id identifica a versão alterada. Eventos de rascunhos irmãos não publicados não entram nessa cadeia.

## 7. Ranking consistente

Primeira consulta sem `snapshot_id` usa regras ativas, revisão atual da base e `as_of` fornecido ou default da base. Retorna snapshot_id, revisão, regra e data. Consultas seguintes usam esse ID para paginação e exportação. Dados e posições do snapshot são imutáveis.

Com snapshot_id, `as_of` não pode contradizer a data do snapshot. Todos os filtros são aplicados sobre a mesma fotografia completa. Mudanças posteriores aparecem em `is_stale` e `current_dataset_revision`; para atualizar, pedir novamente sem snapshot_id. `current_dataset_revision` compara também alterações de regras que incrementam a revisão da base. Mudanças somente de revisão humana incrementam uma review_revision interna; podem tornar is_stale=true sem alterar current_dataset_revision.

O CSV exige snapshot_id, aceita os mesmos filtros e exporta todos os resultados filtrados, sem limite de página, com teto de 2.000 empresas por base. Cabeçalho fixo: `rank,external_id,name,segment,uf,employees,priority_score,priority_min,priority_max,priority_band,review_status,ruleset_id,as_of`. Usar ponto como separador decimal e UTF-8 com BOM; proteger células contra injeção de fórmula. URLs fictícias não disparam busca nem abertura automática.

## 8. Casos sem dado, sem IA e parcialmente concluídos

- Sem empresas: estado vazio com importação e modelo de arquivo.
- Sem sinais elegíveis: job registra conta como processada sem sugestões, com aviso; não inventa texto nem chama IA sem necessidade.
- Provedor falhou em algumas contas: `partial_failed`; sucessos permanecem consultáveis. Retry cria novo job apenas para os IDs que falharam e referencia o anterior internamente.
- Chave do modelo não configurada: `failed` com código explícito. Não simular “IA real”. Mocks ficam identificados no ambiente de desenvolvimento.
- Nenhuma conta dentro do ICP: ranking vazio, com acesso à lista de pendentes e fora; não alterar o corte automaticamente.
- Rede caiu após uma ação: repetir a mesma chave idempotente ou consultar o recurso; nunca criar uma nova ação no escuro.

## 9. Contrato do cronômetro

Criar sessão ao usuário clicar “Iniciar validação”. Modos manual e assisted são registrados explicitamente. Pausar/retomar/concluir/abandonar usa a rota de eventos, controle de versão e idempotência. Para `complete`, `expected_input_revision` é obrigatório; concluir sobre entradas desatualizadas retorna 409. Em complete, interrupted=true marca uma interrupção declarada e exclui a medida de tempo das agregações de sessões válidas; não altera timestamps. Esse parâmetro em outras ações é 422.

Só o autor controla sua sessão; todos podem consultar resultados agregados no ambiente compartilhado. Não permitir duas sessões ativas/pausadas do mesmo usuário para a mesma empresa; responder REVIEW_SESSION_ACTIVE com ID da sessão existente. Não concluir o registro automaticamente quando terminar um job.

## 10. Entrega das duas implementações

Gabriel entrega respostas compatíveis, erros recuperáveis e documentação de URL/variáveis. Marco entrega telas compatíveis, sem depender de banco ou provedor de IA. Cada PR que muda uma forma HTTP também atualiza OpenAPI, exemplos, tipos gerados e testes. Um endpoint “parecido” ou uma resposta sem os campos de estado não satisfaz este contrato.
