# 04 · Especificação do backend — Gabriel

## 1. Responsabilidade e stack

Entregar uma API funcional conforme [03_CONTRATO_API.md](03_CONTRATO_API.md) e `contracts/openapi.yaml`, com PostgreSQL, persistência das entradas, cálculo determinístico, revisão humana e auditoria.

Referência recomendada: Node.js + TypeScript, um único serviço HTTP modular e Prisma para acesso/migrations; worker durável no mesmo repositório e PostgreSQL. O framework HTTP é uma escolha interna de Gabriel, sem alterar rotas ou DTOs. Frontend TypeScript não obriga backend TypeScript: PHP/Laravel/Eloquent é uma implementação alternativa, desde que cumpra contratos e golden tests. Não acrescentar Node somente para executar Prisma em um backend PHP.

Não reutilizar automaticamente infraestrutura da Autarkeia, criar microserviços ou adicionar Redis para este volume. Provedor e modelo de IA são configurados por ambiente, não pelo frontend. Fixar versões exatas de dependências e runtime no repositório após escolher bibliotecas; este pacote não prescreve uma versão “mais recente”.

## 2. Módulos e interfaces internas

| Módulo | Responsabilidade | Dependência |
|---|---|---|
| auth | Usuários predefinidos, senha hash, sessão, CSRF, limite de tentativas | users/sessions |
| catalog | Schema fixo, enums, aliases de importação e modelos | contrato versionado |
| datasets | Bases compartilhadas e revisão de entradas | auth |
| companies / signals / contacts / opportunities | CRUD tipado, arquivamento, validação e concorrência | audit e transações |
| imports | Parse seguro, normalização, validação, prévia e commit atômico | catalog, domínio, regras |
| rules | Configuração tipada, rascunho completo, publicação e histórico | audit |
| scoring | Funções puras: fatores, gate, prioridade e explicações | dados normalizados + regras |
| assessments | Snapshot/reuso de resultados; paginação e CSV consistentes | scoring |
| ai-analysis | Job, adaptador de modelo, schema de saída, validação de evidências | sinais permitidos |
| review | Decisões humanas, verificação de obsolescência e aplicação transacional | domínio, audit |
| metrics | Sessões simples e exportação do experimento | auth/review |

Contratos internos recomendados: `normalizeImport`, `validateRuleConfig`, `evaluateCompany`, `createRankingSnapshot`, `extractSuggestions`, `decideSuggestion`, `appendAuditEventViaTrigger`. O motor recebe um snapshot em memória e não consulta rede ou banco durante o cálculo.

## 3. Persistência e constraints obrigatórias

Os DTOs públicos não são schema de banco automático. Mapear UUID → uuid, datas → date/timestamptz, flags → boolean, valores monetários → bigint em centavos e snapshots → jsonb. Para números usados no score, utilizar decimal com precisão explícita ou inteiros escalados; não depender de arredondamento binário em cortes.

| Tabela/grupo | Chaves e restrições essenciais |
|---|---|
| users | UUID; e-mail normalizado único; senha hash; active; nenhum segredo em audit de negócio |
| sessions | Hash de token único, user_id, expires_at, csrf secret/hash, revoked_at; nunca persistir token puro no log |
| datasets | UUID; nome; kind; version; data_revision; regra ativa; default_as_of; autoria |
| companies | UNIQUE(dataset_id, external_id), UNIQUE(id,dataset_id), version ≥ 1, input_revision ≥ 1 |
| signals / contacts / opportunities | UNIQUE(dataset_id,external_id); FK composta (company_id,dataset_id) → company; validar empresa não arquivada antes de escrever |
| rulesets | ID imutável do conteúdo; draft/published; config JSON validado; versão de linha; autor/publicação. Dataset aponta para uma publicada |
| import_batches | arquivo/hash/target/política; preview_revision; versão; status; expiração; contagens; resultado de commit |
| import_rows | import_id, aba, linha, conteúdo bruto limitado, normalizado, ação, erros; dados privados ao backend |
| source_files | ID, dataset, SHA-256, tamanho, nome original saneado, localização privada, recebido_em/por |
| analysis_jobs | estado, scope, counters, created_by, modelo, prompt_version, attempts/lease e limites |
| analysis_job_items | UNIQUE(job_id,company_id); estado por empresa; entrada congelada; tentativa; resultado/erro; lease |
| suggestions | tipo/campo/valor/proveniência; base_company_version; estado; versão; job_id; nunca guardar score produzido pelo modelo |
| review_decisions | append-only; sugestão, autor, decisão, versão, horário, nota opcional, chave idempotente |
| assessments | snapshots imutáveis; UNIQUE(company_id,input_revision,ruleset_id,as_of,dataset_revision,review_revision), ou hash equivalente completo |
| ranking_snapshots | dataset/revisão/regra/data, dados e posições congeladas; identificação única do conjunto de avaliação |
| review_sessions | user_id/company_id; estados e acumuladores; no máximo uma aberta por usuário/empresa |
| review_session_events | append-only; evento, versão esperada, servidor_timestamp, idempotência |
| audit_events | conforme documento 07; índice por entidade/versão e horário |
| idempotency_records | UNIQUE(user_id,method,route,key); hash do pedido, processamento/resultado, TTL |

Índices mínimos: `(dataset_id,archived_at)`, `(dataset_id,company_id)` nos relacionados, `(company_id,status)` em sugestões, `(entity_type,entity_id,version_after)` em auditoria, `(state,available_at)` na fila e índices nas chaves idempotentes. `changed_fields` pode ter índice GIN se a consulta de histórico por campo precisar; não é pré-condição da demo.

## 4. Limite transacional

Toda escrita de domínio executa na mesma transação:

```text
validar sessão, origem, CSRF e DTO
reservar/consultar idempotência quando aplicável
ler e bloquear o escopo necessário em ordem estável
injetar ator e origem no contexto LOCAL da transação
checar versões e restrições de negócio
alterar a linha e incrementar versão
trigger grava audit_event com before/after
atualizar revisões técnicas de entrada/base
salvar resultado idempotente
commit
```

Não segurar transação aberta durante chamada ao modelo ou leitura longa de arquivo. Parse/validação acontecem antes do commit; na confirmação revalidar revisão e constraints no banco.

Usar o objeto transacional do ORM para todas as consultas daquele bloco. Configuração de ator por `set_config(..., true)` deve ocorrer na **mesma conexão/transação** das escritas; nunca em uma conexão global que possa ser reutilizada pelo pool. Ver referência de transações [T3] em [10_FONTES_E_PREMISSAS.md](10_FONTES_E_PREMISSAS.md).

Manter ordem consistente de locks: dataset → empresas afetadas em ordem de ID → relacionados/sugestões. Um import altera vários registros e deve preservar essa ordem. Deadlocks/erros de serialização podem ter retry interno limitado, com a mesma identidade de operação, sem repetir efeitos externos.

## 5. Invalidação de avaliação

Edição da empresa altera sua versão e input_revision. Alteração/arquivamento de sinal ou contato altera sua versão e input_revision da empresa. Alteração de oportunidade histórica pode afetar S10 de outras empresas do segmento; por simplicidade, incrementar dataset.data_revision e reconstruir snapshots da base, sem tentar invalidação fina incompleta.

Publicar regras altera a revisão da base e o ponteiro ativo. Aceitar confirmação sem mudar valor gera decisão, mas não incremento fictício da versão de dados. Concluir uma sessão altera o estado de revisão associado à input_revision; caches que incluem o rótulo `reviewed` precisam considerar essa informação. Ver a chave completa em 07 e no contrato de ranking.

GET do ranking reúne dados em leitura consistente, calcula sem N+1 e materializa a fotografia. GET não chama modelo. Para as 120 contas do case, cálculo síncrono é a referência inicial; medir antes de adicionar processamento assíncrono do score. Snapshot velho continua explicável e marcado como antigo.

## 6. Importação e regra de verdade

Implementar integralmente [01_MODELO_DE_DADOS_E_IMPORTACAO.md](01_MODELO_DE_DADOS_E_IMPORTACAO.md). Não substituir a normalização por envio do XLSX inteiro ao LLM. Persistir arquivo de forma privada; tamanho, extensão e MIME não são validação suficiente isoladamente.

Cada campo alterado por importação tem origem `import`, usuário que confirmou, import_id e localização original. Não carregar valores de `Ranking_Referencia` em colunas do score. A importação é fonte de fatos candidatos persistidos, identificados como importados, ainda não certificados por revisão humana.

Blanks de atualizações não apagam campos. CSV com IDs relacionados inválidos falha por inteiro. Regras importadas geram rascunho completo; publicação explícita. O seed é idempotente e nunca roda como reset destrutivo do banco.

## 7. Fila e falhas da IA

Requisição 202 significa job gravado. Worker pode usar fila em PostgreSQL com lease por item e bloqueio de linhas para distribuir trabalho, sem depender de uma Promise solta no processo HTTP. Ao reiniciar, itens com lease expirado são retomáveis.

Defaults operacionais: até 100 empresas por job; duas empresas em análise simultânea por worker; timeout por chamada de 90 segundos; no máximo uma nova tentativa para falha transitória. Todas as tentativas e consumo retornado pelo provedor são registrados. Limites são configuráveis no ambiente.

Não prometer exactly-once para uma chamada externa em caso de queda após resposta do provedor. Deduplicar a **publicação local de sugestões** por job/item/fingerprint; registrar tentativa potencialmente duplicada. Falha de uma empresa não descarta resultados já persistidos das demais. Contadores devem satisfazer `processed+failed+skipped=requested` em estado terminal.

Scope `icp_gaps` processa somente empresas pending no momento do snapshot; `eligible_enrichment` somente in. Out e empresas cujo estado não corresponde ao scope são skipped com motivo. Uma alteração durante a chamada não é sobrescrita: propostas ainda precisam passar pela validação de obsolescência ao serem publicadas/aceitas.

## 8. Exportação e medição

CSV de ranking é derivado do snapshot solicitado, não de uma nova consulta com dados atuais. CSV de métricas contém sessões/eventos/decisões tipados; não incluir senhas, e-mails de contatos pessoais não permitidos ou prompts inteiros.

Média e mediana são calculadas no servidor sobre sessões completas válidas. Retornar null quando não há observação, jamais zero como “tempo ótimo”. Taxa de aceitação não mede acurácia da IA. Mostrar denominadores e avisos de amostra pequena.

## 9. Configuração e entrega operacional

Variáveis mínimas: `DATABASE_URL`, credencial separada de migrations, `APP_ORIGIN`, segredo de sessão/CSRF, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, limites de job e credenciais individuais de seed fornecidas fora do repositório. `.env.example` lista nomes e placeholders, nunca chaves verdadeiras.

Setup documentado: instalar dependências → configurar ambiente → migrations (incluindo SQL de auditoria) → seed dos usuários e da demo → iniciar API/worker → executar smoke test. Informar para Marco a URL local da API e a configuração de proxy.

Adicionar healthcheck que não revela conexão/segredos. Logs estruturados com request_id/job_id, mensagens saneadas e duração; não logar cookie, senha ou cabeçalho Authorization. Falha de permissão para gravar auditoria deve impedir alteração de negócio.

## 10. Definição de pronto do backend

Todos os endpoints P0 respondem conforme schema, login é real, CRUD e importação persistem, scores reproduzem os testes, sugestões não escrevem sem aceite, conflitos retornam 409, histórico não é alterável pela credencial da aplicação e uma reinicialização não perde jobs confirmados. O processo é instalável a partir de um checkout limpo com instruções e sem dependência do notebook deste pacote.

### Linhagem das regras

Persistir `rulesets.base_ruleset_id` como FK opcional para a versão publicada que originou o rascunho. Impedir ciclos e referências a outra base. A versão inicial é a única com valor null. O endpoint de histórico de regras percorre essa cadeia e não mistura rascunhos irmãos.
