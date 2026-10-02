# 08 · Testes e critérios de aceite

## 1. Dois níveis de verificação

**Este pacote:** validação de schemas/exemplos, motor determinístico de referência, integridade do seed e consistência dos documentos. Ver [VERIFICACAO.md](VERIFICACAO.md).

**Aplicação a construir:** API real, banco, triggers, sessão, worker, telas e integração precisam passar pelos testes abaixo. Passar o motor de referência não demonstra que uma implementação HTTP/SQL está correta nem que o produto atingiu a meta de negócio.

## 2. Matriz de rastreabilidade

| Requisito | Spec principal | Testes de aceite |
|---|---|---|
| RF01 Login | 03, 07 | AUTH01–04 |
| RF02 Bases | 00, 01, 05 | DATA01–02 |
| RF03 Importação | 01, 03 | IMP01–10 |
| RF04 CRUD | 01, 04, 05 | CRUD01–05 |
| RF05 Regras | 02, 03 | RULE01–04 |
| RF06 IA | 06 | AI01–08 |
| RF07 Revisão | 06, 07 | REV01–07 |
| RF08 Avaliação | 02 | SCORE01–10; suíte executável |
| RF09 Ranking | 03, 05 | RANK01–05 |
| RF10 Decisores | 01, 02, 05 | CONTACT01–03 |
| RF11 Auditoria | 07 | AUD01–06 |
| RF12 Medição | 03, 05 | MET01–06 |

IDs de documento na tabela correspondem aos prefixos dos Markdown da raiz.

## 3. Autenticação e base

| ID | Cenário | Resultado exigido |
|---|---|---|
| AUTH01 | Usuário correto/incorreto | Login individual funciona; falha não revela cadastro de e-mail |
| AUTH02 | Sessão expirada/logout | Requisições seguintes retornam 401; não reutilizar sessão revogada |
| AUTH03 | CSRF ausente/incorreto ou Origin indevido | Nenhuma alteração de negócio |
| AUTH04 | Tentativas repetidas | Limite aplicado; Retry-After quando pertinente; sem lock permanente por erro único |
| DATA01 | Primeira inicialização e reinicialização | Demo carregada uma vez; mudanças não somem após restart |
| DATA02 | ID de empresa de outra base | Rejeição; relacionamento cruzado não é gravado |

## 4. Importações

| ID | Cenário | Resultado exigido |
|---|---|---|
| IMP01 | XLSX original incluído no pacote | Ler cabeçalho na linha 3; normalizar entidades e preservar referências; sem buscar URLs |
| IMP02 | CSV de empresas + CSVs de sinais/contatos | Resolver company_external_id e mostrar proveniência correta |
| IMP03 | Arquivo incompleto/com coluna inválida | Erros por aba/linha/campo; commit indisponível |
| IMP04 | Uma linha relacionada aponta empresa inexistente | Lote inteiro não é aplicado |
| IMP05 | Mesmo conteúdo reimportado | Sem duplicar registros nem criar audit de no-op |
| IMP06 | Blanks em fill_missing/overwrite | Não apagar valores atuais; __NULL__ somente quando permitido e confirmado |
| IMP07 | Outro usuário edita após prévia | 409 IMPORT_PREVIEW_STALE; nenhuma sobrescrita |
| IMP08 | Duplo clique/retry após timeout | Mesmo commit e contagens; nenhum efeito duplicado |
| IMP09 | Regras junto com arquivo | Criar rascunho; regra ativa só muda após publicação explícita |
| IMP10 | Fórmula, macro/tipo não suportado, expansão excessiva | Rejeitar sem executar ou fazer busca externa |

A igualdade de IDs internos entre implementações não é requisito: UUIDs do seed são referência. Igualdade das relações, valores e regras é requisito. Comparação por external_id evita depender de ordem de inserção.

## 5. CRUD e regras

| ID | Cenário | Resultado exigido |
|---|---|---|
| CRUD01 | Criar/editar empresa e relacionados | Tipos corretos; campos readonly rejeitados; dado persistido |
| CRUD02 | Dois usuários editam versão 3 | Primeiro salva 4; segundo recebe 409; nenhum dado perdido |
| CRUD03 | Patch vazio/no-op | Não fabricar nova versão/evento; changes vazio é inválido; mesmos valores efetivos retornam estado atual |
| CRUD04 | Arquivar/restaurar | Preservar histórico e external_id; ranking não usa arquivada |
| CRUD05 | Editar registro com pai arquivado | Bloquear até restaurar empresa |
| RULE01 | Soma de pesos ≠100 em qualquer etapa | 422; não publicar ajuste automático |
| RULE02 | Publicação concorrente | Ativa esperada divergente produz RULESET_CONFLICT |
| RULE03 | Alterar fator compartilhado | Gate e critérios correspondentes da prioridade refletem a mesma regra |
| RULE04 | Voltar a configuração antiga | Nova publicação auditada, sem editar registro histórico |

## 6. Motor determinístico

SCORE01–10 cobrem, respectivamente: separação entre as duas notas; limites de porte 79/80/199/200/5000/5001; null vs false; L/U/corte e igualdade; required e blockers; D03 e canais; S08 com 90/91 dias, futuro e ausência de data; S10 temporal e sem usar próprio resultado; D05 conhecido/desconhecido e clamp; precisão/desempates.

A suíte `tests/scoring.test.mjs` contém exemplos específicos e testes de propriedades. O backend deve portar ou executar a mesma suíte contra sua própria função de domínio. Os resultados do motor de referência não dispensam essa comparação.

`seed/expected-assessments-v1.json` é um golden gerado pelo motor especificado. Não é evidência independente de acerto comercial. Manter também casos manuais com respostas calculadas separadamente, especialmente nas fronteiras. Não ajustar fórmula para copiar `Ranking_Referencia` nem usar seus rótulos na IA.

## 7. IA e revisão humana

| ID | Cenário | Resultado exigido |
|---|---|---|
| AI01 | Sinais suficientes, confirmação/contradição | Propostas tipadas com trecho literal e origem |
| AI02 | Texto insuficiente | Inconclusão; não inventar número ou pessoa |
| AI03 | Fonte bloqueada/não declarada | Fora do prompt e de S08; mostrar motivo |
| AI04 | Texto com instrução para ignorar regras | Nenhuma ação externa ou alteração de regra/score |
| AI05 | Quote inexistente ou ID de outra empresa | Proposta rejeitada pelo backend antes da revisão |
| AI06 | Falha em parte do lote | Resultados válidos preservados; retry só das falhas |
| AI07 | Worker cai após job confirmado | Job não some; reexecução não duplica sugestões publicadas |
| AI08 | Referências fictícias/sem data | Não navegar; preservar lacuna temporal e não pontuar S08 sem data |
| REV01 | Aceitar alteração válida | Mudar campo, auditar autor, recalcular gate/score e devolver versões atuais |
| REV02 | Rejeitar/adiar | Preservar cadastro e score de dados |
| REV03 | Confirmar valor igual | Registrar decisão sem update fictício da empresa |
| REV04 | Campo-alvo mudou depois da sugestão | 409 SUGGESTION_STALE; sem botão de forçar |
| REV05 | Campo não relacionado mudou | Após recarregar a versão atual, outra sugestão independente continua utilizável |
| REV06 | Evidência mudou/foi arquivada | Aceite bloqueado; snapshot anterior permanece explicável |
| REV07 | Aceite tira conta do ICP | Prioridade atual null; conta sai do ranking, mas continua no cadastro |

## 8. Ranking, contatos e auditoria

| ID | Cenário | Resultado exigido |
|---|---|---|
| RANK01 | Nenhuma empresa in | Lista vazia, não lista de empresas com score zero |
| RANK02 | Mudança entre página 1 e 2 | Mesmo snapshot mantém posições; is_stale informa mudança |
| RANK03 | CSV após aplicar filtros | Mesmo conjunto/score do snapshot, não apenas página corrente |
| RANK04 | Sugestão sem aceite | Não altera score de dados; muda apenas estado/contagem de revisão |
| RANK05 | Valores empatados/mesmo arredondamento | Desempate bruto e lexical reprodutível |
| CONTACT01 | Canal genérico sem pessoa | Canal disponível, S09=0 |
| CONTACT02 | Profissional identificado permitido | S09=1 e exibição de origem |
| CONTACT03 | Contato pessoal/não permitido | Sem utilização; empresa não é desqualificada por isso |
| AUD01 | Editar cinco campos | Evento antes/depois com cinco changed_fields e autor correto |
| AUD02 | Falha deliberada na gravação do audit | Alteração de negócio também sofre rollback |
| AUD03 | Credencial app tenta UPDATE/DELETE/TRUNCATE audit | Permissão negada |
| AUD04 | Payload tenta enviar updated_by | Campo rejeitado; autoria vem da sessão |
| AUD05 | Duas alterações do mesmo campo e uma reversão | Todas as versões continuam consultáveis |
| AUD06 | Mudança de pesos depois de avaliar | Score histórico explicável com regras e dados antigos |

AUD02/AUD03 dependem de banco real com as credenciais de aplicação, não do usuário administrador de migrations. Relatar a execução separadamente.

## 9. Medição mínima e semântica

| ID | Cenário | Resultado exigido |
|---|---|---|
| MET01 | Iniciar/pausar/retomar/concluir | Acumular apenas intervalos ativos medidos pelo servidor |
| MET02 | Repetir evento por falha de rede | Não dobrar tempo nem decisões |
| MET03 | Interromper/abandonar | Preservar sessão; não incluí-la como medida válida de conclusão |
| MET04 | Sem sessões ou sem decisões | Valores agregados null, denominadores explícitos |
| MET05 | Completar sobre revisão antiga | 409; não declarar concluídas entradas que o usuário não viu |
| MET06 | Aceite sem sessão / comparação por modo | Decisão fica unassigned para modo; não atribuir automaticamente a manual/assisted |

**Relógio:** timestamps e acumulação vêm do servidor. Ao pausar/concluir uma sessão ativa, somar a diferença entre now e last_resumed_at; ao retomar, reiniciar esse marcador; pausas não contam em active_seconds. wall_seconds é finished_at−started_at. Contar segundos inteiros por intervalo, sem confiar em duração enviada pelo navegador.

`complete` pode declarar `interrupted=true` quando perda de rede, saída de tela sem pausa ou outra interrupção comprometeu a medida; registrar timing_quality=interrupted. `abandon` também não entra na amostra válida. Não excluir automaticamente sessões lentas: isso enviesaria o resultado. Sessão completa e não marcada como interrompida é a observação válida, independentemente de ser longa.

Para vincular decisão a modo, o backend associa a sessão aberta do mesmo usuário/empresa no momento da ação, se houver, guardando review_session_id. Sem sessão, modo é unassigned na exportação. Filtros manual/assisted excluem unassigned; modo all inclui decisões não atribuídas, com aviso.

Taxa de aceitação = sugestões acionáveis accepted / (accepted + rejected). Excluir inconclusive e stale desse denominador; pending/deferred são reportadas à parte. Usar estado final distinto por sugestão, não número de cliques. `pending_suggestions` dos DTOs e da fórmula conta propostas acionáveis ainda pending/deferred; inconclusões continuam visíveis, mas não viram pendência de aceite.

Média/mediana de tempo usam sessões completed com timing_quality=complete. “Melhora de tempo” só pode ser calculada comparando modos e tarefas equivalentes. Tempo de espera da IA pode ser medido separadamente pela duração do job; não confundir isso com redução de tempo humano.

CSV de métricas: `row_type,dataset_id,company_id,user_id,session_id,suggestion_id,mode,state,relation,decision,started_at,finished_at,active_seconds,wall_seconds,timing_quality,occurred_at,input_revision`. row_type é session ou decision; colunas não aplicáveis ficam vazias. Período from inclusivo e to exclusivo, aplicado ao started_at das sessões e occurred_at das decisões. Taxas são proporções de 0 a 1 na API.

## 10. Experimento do grupo

Selecionar um lote pequeno de contas com dados completos, lacunas e contradições. Definir quais campos a pessoa deve validar e quando a tarefa termina. Comparar validação manual da planilha com o fluxo assistido sobre contas de dificuldade semelhante; alternar pessoas/ordem para reduzir efeito de memória.

Medir média, mediana, número de sessões, interrupções e qualidade de uma amostra revisada separadamente pelo grupo. Meta a testar: menos de oito minutos por conta. Os 22 minutos da planilha são uma referência fictícia de pesquisa manual, não o baseline da validação deste protótipo.

Aceitação é um indicador de uso, não gabarito de correção. Registrar exatidão da amostra em planilha externa e analisar discordâncias. Não alegar impacto em receita, conversão ou contato com decisor sem medir essas etapas posteriores.

## 11. Aceite final do MVP

Para considerar entrega concluída: testes funcionais P0 acima aprovados, roteiro ponta a ponta com dois usuários, documentação de setup reproduzível, nenhum placeholder de IA se passando por execução real, nenhuma busca externa e nenhuma alteração de dado sem autoria. O piloto medirá valor; não condicionar a conclusão técnica a obter artificialmente a meta de oito minutos.
