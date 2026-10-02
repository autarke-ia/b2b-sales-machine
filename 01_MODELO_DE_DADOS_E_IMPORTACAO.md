# 01 · Modelo de dados e importação

## 1. Identidade e regras comuns

Todos os IDs internos são UUIDs emitidos pelo backend. `external_id` preserva o identificador da planilha, é texto imutável, único por `(dataset_id, tipo de entidade, external_id)`, inclusive após arquivamento. Não usar nome ou domínio como identidade. `EMP-0001` de duas bases distintas representa registros distintos.

Tabelas operacionais têm `id`, `dataset_id`, `version`, `created_at`, `created_by`, `updated_at`, `updated_by`, `archived_at`. Datas/hora são UTC, serializadas ISO 8601 com `Z`. Uma edição efetiva incrementa `version`; uma requisição sem mudança efetiva não gera evento nem incremento.

Empresa tem também `input_revision`, incrementada quando um dado que compõe sua avaliação muda — inclusive sinal, contato ou oportunidade relacionada. `dataset.data_revision` muda uma vez por transação que altera o conjunto de entradas. Esses contadores técnicos não substituem versões de linha e não geram cópias redundantes dos dados no histórico.

`null` representa ausência de informação, nunca `false`, zero, texto vazio ou “baixo”. Uma resposta contém os campos nullable como `null`; um PATCH pode omitir um campo para preservá-lo e enviar `null` para apagá-lo, quando permitido. Chaves desconhecidas são rejeitadas.

## 2. Entidades de negócio

### 2.1 Empresa (`Company`)

Campos e validações formais: `contracts/openapi.yaml`, schema `Company`.

| Campo | Tipo / significado |
|---|---|
| `external_id`, `name` | Texto obrigatório ao criar; nome 1–240 caracteres |
| `domain`, `segment` | Texto ou null. Domínio sem protocolo/caminho, minúsculo; segmento padronizado por seleção/trim, sem fusão semântica automática |
| `employees` | Inteiro ≥ 0 ou null |
| `uf` | Uma das 27 UFs ou null; localização da operação brasileira informada |
| `operates_in_brazil` | Booleano ou null; usado em D02 |
| `hr_structured` | Booleano ou null |
| `has_benefits`, `seeks_benefit_differentiation` | Booleanos independentes ou null; compõem o critério de benefícios |
| `multi_region` | Booleano ou null; distribuição entre regiões/cidades ou trabalho distribuído explicitamente sustentado |
| `growth`, `employer_branding`, `retention_pain` | `low`, `medium`, `high` ou null |
| `renewal_window` | `m0_3`, `m4_6`, `m7_12`, `over_12` ou null |
| `renewed_24_plus` | Booleano ou null: contrato recém-renovado com duração ≥ 24 meses. `over_12` não comprova esse fato |
| `operating_status` | `active`, `inactive`, `unknown`; default `unknown` |
| `source_label` | Rótulo original de fonte; não equivale a uma evidência verificável |
| `is_synthetic` | Booleano; herdado da base/demo, controlado na criação e imutável por PATCH |

### 2.2 Sinal (`Signal`)

Pertence a uma empresa. Contém `external_id`, `company_id`, `signal_type`, `evidence_text`, `strength`, `observed_on`, `source_name`, `source_url`, `source_allowed`, `is_synthetic`. Texto de evidência: máximo 6.000 caracteres; URL: máximo 2.048. Datas ausentes permanecem null. Não construir URLs que a fonte não fornece.

`source_allowed=true` declara que o sinal pode ser usado no cenário. `false` o bloqueia; null significa que a situação não foi declarada. Somente `true` entra no agente e em S08. `observed_on` representa a data atribuída ao fato/publicação na origem; `created_at` é a ingestão no produto. Não substituí-las uma pela outra.

### 2.3 Contato/canal (`Contact`)

Pertence a uma empresa. `full_name` e `job_title` podem ser null. `channel_type` e `channel_value` são obrigatórios. Tipos: página institucional, e-mail corporativo genérico, perfil profissional, telefone corporativo, página de contato da empresa ou outro canal público.

`decision_maker_identified=true` sozinho não basta para S09: também exigir nome, cargo, canal, `is_professional_public=true` e `source_allowed=true`. Um formulário de contato ou e-mail genérico sem pessoa identificada é útil como canal, mas não conta como decisor identificado.

A interface não oferece abertura/cópia como canal utilizável quando a origem estiver bloqueada ou não declarada. No case fictício, mostrar o conteúdo como texto de demonstração, sem executar o contato.

### 2.4 Oportunidade histórica (`Opportunity`)

Contém `external_id`, `company_id`, resultado `won|lost|negotiating`, `closed_on`, `segment_at_close`, `cycle_days`, `estimated_ticket_cents`, `reason`, `sponsor`, `origin`, `is_synthetic`.

O valor monetário canônico é inteiro em centavos. A planilha histórica não fornece data de fechamento nem segmento no momento do fechamento; esses campos ficam null. **Essas linhas não habilitam S10.** Não inferir data a partir do ciclo, ordem da linha ou número do ID.

### 2.5 Entidades auxiliares

| Entidade | Finalidade |
|---|---|
| `datasets` | Agrupar registros; base de demo ou base criada pelo usuário |
| `users`, `sessions` | Identidade e login; sem CRUD público de usuários |
| `rulesets` | Configurações completas, rascunhos e publicações |
| `source_files`, `import_batches`, `import_rows` | Arquivo privado, hash, prévia, linhas e proveniência |
| `analysis_jobs`, `analysis_job_items`, `suggestions` | Trabalho assíncrono, resultados e propostas sem alterar cadastro |
| `review_decisions` | Decisões append-only sobre sugestões, incluindo confirmações sem mudança de valor |
| `assessments`, `ranking_snapshots` | Resultados derivados imutáveis, com versões e entradas congeladas |
| `review_sessions`, `review_session_events` | Cronometragem simples e suas transições |
| `audit_events` | Antes/depois, autoria e origem das alterações de negócio |

`Clientes_Atuais`, `Portfolio`, `Ranking_Referencia`, `Casos_Validacao`, `Indicadores_Atuais` e `Dicionario_Dados` são preservados como **referências da importação**, sem virar módulos completos de CRUD. O usuário pode editar os dados operacionais que realmente alimentam o produto. Auditoria e resultados imutáveis não têm edição livre.

## 3. Mapeamento da planilha original

O XLSX original tem 13 abas. Cabeçalhos na linha 3; dados a partir da linha 4. O importador também aceita os mesmos cabeçalhos na linha 1. Procurar o cabeçalho nas três primeiras linhas; dois cabeçalhos candidatos ou nomes duplicados causam erro, não escolha silenciosa.

| Aba | Destino / política |
|---|---|
| `Prospects` | `Company`; obrigatória para upload XLSX de base completa |
| `Sinais_Publicos` | `Signal`; referência por `ID Empresa` |
| `Decisores_Canais` | `Contact`; referência por `ID Empresa` |
| `Oportunidades_Historico` | `Opportunity`; mantém campos temporais ausentes |
| `ICP_Criterios` | Pesos de ICP; rascunho, não publicação silenciosa |
| `Regras_Score_Exemplo` | Pesos S01…S10; rascunho, não publicação silenciosa |
| `Desqualificadores` | Parâmetros conhecidos D01…D05; D03 não desabilitável |
| `Clientes_Atuais` | Contexto somente; sinaliza cliente atual no detalhe. Não desqualifica automaticamente |
| `Ranking_Referencia`, `Casos_Validacao` | Referência de avaliação separada; proibidos como entradas do motor/IA |
| Demais abas | Contexto e documentação; preservar arquivo/linhas, sem novas telas obrigatórias |

### Prospects → Company

| Coluna original | Campo |
|---|---|
| ID Empresa / Empresa / Domínio fictício / Segmento | external_id / name / domain / segment |
| Colaboradores / UF / RH estruturado / Multi-região | employees / uf / hr_structured / multi_region |
| Sinal crescimento / Employer branding / Dor retenção | growth / employer_branding / retention_pain |
| Renovação provável / Fonte permitida / Status | renewal_window / source_label / operating_status |

O parser não inventa `has_benefits`, `seeks_benefit_differentiation` ou `renewed_24_plus`: ficam null. Na demo, interpretar a UF fornecida como localização da operação permite derivar `operates_in_brazil=true`; registrar essa derivação com origem e aviso. Para CSV canônico, respeitar o campo explícito; se houver UF e o campo estiver ausente, mostrar a mesma proposta de derivação na prévia. Nunca inferir operação no Brasil somente de domínio `.br`.

Sinais: `Tipo sinal → signal_type`, `Evidência fictícia → evidence_text`, `Força → strength`, `Data → observed_on`, `Fonte → source_name`, `URL fictícia → source_url`.

Contatos: `Cargo provável → job_title`, `Contato fictício → full_name`, `Tipo canal → channel_type`, `Canal/contato fictício → channel_value`, `Origem → origin`, `Decisor identificado? → decision_maker_identified`.

Oportunidades: `ID Oportunidade → external_id`, `Resultado → result`, `Ciclo (dias) → cycle_days`, `Ticket estimado → estimated_ticket_cents`, `Motivo/Status → reason`, `Sponsor/Decisor → sponsor`, `Origem → origin`.

## 4. CSVs contextualizados

Na área de empresas, sinais, contatos, oportunidades e nas seções de regras, disponibilizar upload do CSV correspondente. Os modelos estão em `templates/`; o frontend pode oferecê-los como arquivos estáticos versionados. O catálogo `/schema` ajuda a explicar o preenchimento; não permite criar novas colunas arbitrárias.

Nos CSVs relacionados, usar `company_external_id`, resolvido para `company_id` pelo backend. Os UUIDs internos não precisam ser conhecidos pelo usuário. O CSV exportado do ranking é um relatório e não um arquivo de reimportação de cadastros.

CSVs canônicos usam cabeçalhos snake_case dos modelos. Também são aceitos os cabeçalhos originais da aba correspondente, usando apenas os aliases documentados. ICP canônico usa `criterion_id,weight,required`; prioridade usa `criterion_id,weight`; desqualificadores usam `rule_id,enabled,min_employees,penalty_points`. Valores iniciais vêm preenchidos nesses três modelos. Parâmetros adicionais, como janela de recência, são alterados pela tela de regras.

Na aba legada de ICP, mapear os nomes conhecidos `Porte`, `Estrutura de RH`, `Benefícios`, `Crescimento`, `Employer Branding`, `Distribuição geográfica`, `Região`, `Dor de retenção`, `Momento de compra` para as nove chaves de `RuleConfig`. Textos legados de condição diferentes dos modelos conhecidos geram `UNSUPPORTED_RULE_EXPRESSION`; não executar texto livre. Alterar faixas pelo formulário tipado.

## 5. Normalização

- UTF-8 com ou sem BOM; separador vírgula ou ponto e vírgula. Detecção automática somente se um separador produzir o cabeçalho esperado; ambiguidade exige escolha.
- Trim e Unicode NFC. Cabeçalhos aceitam diferenças de caixa/acentuação; colisões após normalização são erro. IDs preservam caixa e zeros à esquerda; exigir células de texto para IDs.
- Booleanos: `true/false`, `Sim/Não`, `1/0`; vazio e `Não identificado` → null. Não aceitar outros textos como true.
- Níveis: Baixo/Médio/Alto → low/medium/high. `Não identificado` → null. `Status`: Ativa → active; Inativa/Encerrada → inactive; ausente → unknown.
- Renovação: 0–3 meses → m0_3; 4–6 → m4_6; 7–12 → m7_12; >12 → over_12; desconhecida → null.
- Datas: ISO `YYYY-MM-DD`, `DD/MM/YYYY` ou célula de data Excel com seu sistema 1900/1904. Data inválida é erro. Data futura é preservada com aviso e não pontua recência até a data de referência alcançá-la.
- Inteiros: não aceitar frações ou negativos para colaboradores. Números formatados devem ser interpretados de maneira inequívoca pelo formato declarado; não adivinhar entre `1.234` decimal e milhar.
- Células de fórmula XLSX em campos mapeados são rejeitadas. Não executar macros, fórmulas ou conexões externas. CSV é texto; ao exportar, neutralizar valores que uma planilha interpretaria como fórmula.

## 6. Prévia e confirmação

`POST /datasets/{id}/imports` recebe `multipart/form-data`: arquivo, `target`, `merge_policy`, separador opcional. Limites iniciais: 10 MiB comprimidos, 100 MiB após expansão, 10.000 linhas de dados por arquivo, 2.000 empresas e 20.000 registros por tipo relacionado por base. Estes são limites de produto, não medidas de desempenho verificadas.

A resposta traz contagens, hash SHA-256, revisão da base observada, erros, avisos e até 100 linhas de prévia. Erros/avisos completos são paginados em `/issues`. Arquivo inválido recebe uma prévia `invalid` quando foi possível ler sua estrutura; arquivo ilegível, tipo inválido ou limite excedido retorna erro HTTP. Prévia expira após 24 horas.

Sem confirmação não alterar cadastro, regras ativas ou ranking. A confirmação usa `expected_version` da prévia, `expected_dataset_revision` e chave de idempotência. Se a base mudou, `409 IMPORT_PREVIEW_STALE`: gerar nova prévia.

Toda importação confirmada é atômica: empresas primeiro, relacionados depois, referências e eventual rascunho de regras no mesmo commit. Havendo qualquer erro, nada é importado. Não oferecer “pular erros” nesta versão.

## 7. Atualizações, conflitos e duplicatas

`fill_missing` é o padrão: preencher somente campos atualmente null/unknown e criar registros ausentes. `overwrite_non_null` permite substituir valores existentes por valores não vazios do arquivo, com prévia e `confirm_overwrite=true` obrigatório. Valores em branco nunca apagam um cadastro existente. Para apagar via CSV, usar `__NULL__` em campo nullable e modo overwrite, com aviso explícito.

A revisão de base comparada no commit impede que a prévia sobrescreva uma edição humana feita depois. Não mesclar silenciosamente mudanças concorrentes.

Empresas e oportunidades têm IDs legados. Sinais e contatos do XLSX original não têm: gerar um identificador estável do conteúdo da linha normalizada, com tipo + empresa + campos da origem; arquivo e número da linha ficam na proveniência, não determinam a identidade. Mesmo conteúdo reimportado é no-op. Mudança no conteúdo legado sem ID explícito pode criar novo registro; mostrar aviso e orientar uso do CSV canônico com `external_id` para atualizar. Nunca adivinhar que dois sinais distintos são o mesmo.

Duplicatas idênticas no mesmo arquivo são ignoradas com aviso; um mesmo ID com valores divergentes invalida a prévia. Relação com empresa inexistente e não criada no lote é erro. Um ID arquivado não é recriado nem restaurado implicitamente: informar conflito; restauração é explícita.

Regras importadas criam **um rascunho completo** baseado na configuração ativa, substituindo os grupos presentes no arquivo. Cada grupo presente precisa ter todos os IDs conhecidos uma única vez. Exigir 100 pontos em cada grupo de pesos. Publicar é uma ação separada; até lá o ranking mantém as regras vigentes.

## 8. Seed e integridade

O seed normalizado contém 120 empresas, 287 sinais, 120 contatos/canais e 70 oportunidades. Cada entrada mantém localização da origem em `source_locations`. O XLSX original e sua leitura tabular estão incluídos para comparação. Nenhum arquivo de seed contém senha. O created_by fixo das fixtures é um ator técnico de carga: criar esse ator sem login (UUID 3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9) antes das FKs de autoria, ou remapear todas as autorias para um ator técnico local de maneira consistente. Ele não é um usuário humano autenticável.

No seed real, preencher timestamps com o instante real da carga. Os timestamps fixos dos exemplos estabilizam testes. Os registros têm `is_synthetic=true`. Permissões positivas da fixture são declarações do cenário fictício, não uma avaliação de licenciamento de sites reais.

Não carregar duas vezes: seed usa identidades estáveis e transação. Não executar reset destrutivo na inicialização do servidor. Criar nova base para testes do usuário; conservar a demo.
