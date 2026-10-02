# 02 · Regras determinísticas: gate ICP e prioridade

## 1. Princípios

1. Todo cálculo ocorre no backend com dados persistidos vigentes; sugestões ainda não aceitas não entram.
2. ICP e prioridade são avaliações distintas. As duas reaproveitam fatores, mas a nota inteira de ICP não é componente da prioridade.
3. Desconhecido é `null`. Preservar incerteza e evidência; não inventar informação para destravar ranking.
4. Fixar `ruleset_id`, `as_of`, revisão de entradas e snapshots permite explicar resultados antigos.
5. `Ranking_Referencia`, `Casos_Validacao` e `Fit interno` dos clientes nunca alimentam o score nem o prompt do agente.

Fonte dos pesos: abas `ICP_Criterios` e `Regras_Score_Exemplo` do case. Operacionalizações adicionais abaixo são defaults da especificação, não fórmulas oficiais entregues pela Allya.

## 2. Fatores compartilhados

Um fator é um número de 0 a 1 ou null. Configuração inicial em `contracts/rules-default-v1.json`.

| Fator | Regra operacional inicial | Peso no gate |
|---|---|---:|
| size | 1 se 200 ≤ employees ≤ 5.000; 0 fora; null se ausente | 20 |
| hr | 1 se RH estruturado; 0 se não; null se desconhecido | 14 |
| benefits | 1 se possui benefícios **e** busca diferenciação; 0 se qualquer uma das duas condições é explicitamente falsa; null nos demais casos | 12 |
| growth | Alto = 1; médio = 0,5; baixo = 0; desconhecido = null | 10 |
| employer_branding | Mesmo mapeamento de níveis | 10 |
| geography | Multi-região/distribuição: true = 1; false = 0; null = null | 10 |
| region | UF em SP/RJ/MG/ES/PR/SC/RS = 1; outra UF brasileira = 0,5; ausente = null | 8 |
| retention | Mesmo mapeamento de níveis | 8 |
| renewal | m0_3 ou m4_6 = 1; m7_12 ou over_12 = 0; null = null | 8 |
| **Total** | | **100** |

A faixa de porte do ICP não é um desqualificador automático. Por exemplo, uma empresa com 140 colaboradores tem fator size=0, mas não dispara D01; ainda pode atingir o corte pelos demais critérios. Essa diferença é intencional e vem da separação entre faixa ideal e impedimento.

Campos booleanos adicionais, benefícios e duração do contrato não podem ser inferidos apenas porque parecem prováveis. No case original, os campos de benefícios estão ausentes; preservar essa lacuna.

Pesos, limites de porte, UFs prioritárias, fator de nível médio, fator de região não prioritária e categorias aceitas de renovação são configuráveis. Pesos e fatores aceitam até duas casas decimais. Os dois grupos de pesos precisam totalizar exatamente 100, independentemente. Peso zero desliga a contribuição; não renormalizar silenciosamente.

## 3. Desqualificadores

| ID | Condição | Efeito |
|---|---|---|
| D01 | employees < 80 | Fora do ICP. Quantidade ausente: requisito ainda desconhecido |
| D02 | operates_in_brazil = false | Fora do ICP. null: requisito ainda desconhecido |
| D03 | Contato sem vínculo profissional/público permitido | Não utilizar o contato; **não** desqualificar a empresa |
| D04 | operating_status = inactive | Fora do ICP. unknown: requisito ainda desconhecido |
| D05 | renewed_24_plus = true | Deduzir 20 pontos na prioridade; não excluir a empresa |

D01, D02, D04 e D05 podem ser ativados/desativados pelos parâmetros conhecidos; D03 é uma barreira de uso dos canais e não pode ser desativado. D05 não pode ser deduzido de renovação `over_12`: essa categoria não informa contrato recém-renovado por 24 meses ou mais.

Além dos desqualificadores, o formulário pode marcar fatores de ICP como obrigatórios. Default: nenhum. Um fator obrigatório deve ser 1; 0 ou parcial implica fora, null implica requisito desconhecido.

## 4. Gate ICP com limites de incerteza

Para cada critério `i`, peso `w_i` e fator `f_i`:

```text
L = soma(w_i × f_i) dos fatores conhecidos
U = L + soma(w_i) dos fatores desconhecidos
C = corte configurável; inicialmente 60
```

Não dividir pela soma dos pesos conhecidos. Isso premiaria uma conta com pouca informação e poderia transformar um único atributo positivo em 100% de fit.

Aplicar nesta ordem:

```text
registro arquivado                                      → out
qualquer impedimento/obrigatório conhecido não atendido   → out
U < C                                                   → out
algum impedimento/obrigatório ainda desconhecido          → pending
L < C ≤ U                                               → pending
L ≥ C e nenhum impedimento/obrigatório pendente           → in
```

Se `U < C`, a conta pode ser excluída mesmo com outro campo desconhecido: preencher lacunas dentro dos limites atuais não alcançaria o corte. Uma correção posterior de dado conhecido pode mudar a decisão e exige nova avaliação.

Saídas: `state=in`, `in_icp=true`; `state=out`, `in_icp=false`; `state=pending`, `in_icp=null`. Nunca coagir pending para false. O booleano é usado somente após concluir a avaliação.

Exemplos:

| Situação | Resultado |
|---|---|
| L=68, U=80, sem impedimento desconhecido | in; falta informação, mas ela não altera a aprovação pelo corte |
| L=50, U=70, sem impedimento conhecido | pending; preenchimento pode alterar a decisão |
| L=40, U=55 | out; teto abaixo de 60 |
| L=90, U=100, operação no Brasil desconhecida | pending por D02 |
| 65 colaboradores com vários sinais positivos | out por D01 |

## 5. Enriquecimento por etapa

Contas `pending`: agente pode examinar sinais permitidos para esclarecer campos do gate. Contas `in`: pode examinar campos necessários à priorização e confirmar/contradizer informações. Contas `out`: não recebem exploração automática; continuam em uma lista separada para correção manual e reavaliação determinística.

Uma conta `in` pode voltar a `pending` ou `out` após aceitar uma correção; deve sair do ranking atual. Não preservar a classificação antiga por conveniência.

## 6. Score de prioridade

Somente calcular/publicar `priority` quando `gate.state=in`. Caso contrário, retornar `priority=null`, não score zero.

| ID | Fator | Peso |
|---|---|---:|
| S01 | size | 20 |
| S02 | hr | 14 |
| S03 | geography | 10 |
| S04 | growth | 10 |
| S05 | employer_branding | 10 |
| S06 | retention | 8 |
| S07 | renewal | 8 |
| S08 | Sinal forte recente disponível, conforme abaixo | 10 |
| S09 | Decisor identificado em canal utilizável, conforme abaixo | 5 |
| S10 | Histórico de ganho no segmento com validade temporal | 5 |
| **Total** | | **100** |

S04/S05/S06 admitem o fator parcial de 0,5 para nível médio. É uma operacionalização autorizada do peso máximo do exemplo, não uma interpretação de que “médio” seja “alto”. A interface mostra o fator aplicado.

**S08:** fator 1 se existe ao menos um sinal ativo da empresa com `source_allowed=true`, `strength=high`, data conhecida e `0 ≤ as_of − observed_on ≤ 90 dias`. Fator 0 caso não exista um sinal assim **na base disponível**. Sem somar múltiplos sinais nem pontos por quantidade. Data futura e data ausente não qualificam. Usar datas UTC sem horário. O zero indica falta de evidência qualificadora na base; não declara inexistência de sinais no mundo real.

**S09:** fator 1 se existe contato ativo da empresa com nome, cargo, canal, `decision_maker_identified=true`, `source_allowed=true` e `is_professional_public=true`. Caso contrário, 0 para a base disponível. D03 bloqueia somente o contato inadequado. A empresa continua elegível por outros critérios.

**S10:** procurar oportunidades encerradas `won|lost`, com `closed_on ≤ as_of` e `segment_at_close` igual ao segmento normalizado da empresa. Excluir oportunidades da própria empresa avaliada para não usar seu resultado como prova de seu próprio potencial. Havendo ao menos um ganho, fator 1; havendo oportunidades válidas e nenhum ganho, fator 0; sem histórico válido, null. Datas/segmento no fechamento ausentes não são imputados. Não usar oportunidades em negociação. No seed original, S10 permanece desconhecido porque faltam os campos temporais.

```text
K = soma(peso × fator conhecido) dos critérios S01…S10
M = soma dos pesos dos critérios desconhecidos
P = penalidade D05 conhecida; inicialmente 20 se verdadeiro, senão 0
Q = penalidade D05 possível se sua condição ainda é desconhecida; senão 0
score     = clamp(K − P, 0, 100)
score_min = clamp(K − P − Q, 0, 100)
score_max = clamp(K + M − P, 0, 100)
```

A pontuação exibida não aplica uma penalidade sem evidência; o intervalo revela essa incerteza. Os pesos não são redistribuídos quando falta histórico. `known_weight=100−M` mede cobertura dos fatores, não confiança probabilística.

Exemplo da fixture: nota ICP 95, prioridade 95. Não é 190 e não é média das duas. Os valores iguais são coincidência desse conjunto sintético.

## 7. Ordenação, faixas e precisão

Calcular produtos em precisão decimal exata de quatro casas (pesos/fatores com até duas). Não tomar decisões de corte sobre valores já arredondados para exibição. Exibir scores com duas casas, arredondamento half-up para números não negativos.

Ranking: score bruto decrescente → peso conhecido decrescente → `external_id` em ordem lexical binária crescente. Não usar ordem de chegada, nome com collation regional ou desempate aleatório. A posição é a do universo completo do snapshot; filtros preservam a posição original, em vez de renumerar os sobreviventes.

Faixas iniciais: high ≥ 70; medium ≥ 40 e <70; low <40. Faixa não é probabilidade de fechar negócio. A regra de faixa usa score bruto, antes do arredondamento visual.

## 8. Preliminar, revisado e obsoleto

`priority.status=preliminary` se houver fator de prioridade desconhecido com peso positivo, penalidade possível, sugestão acionável pendente/adiada ou nenhuma validação humana concluída para a `input_revision` atual. Caso contrário, `reviewed`.

“Revisado” significa que o usuário concluiu aquele ciclo, não que dados externos foram certificados ou que a IA está correta. Mudança em entrada relevante invalida a conclusão anterior para fins desse rótulo.

Um snapshot antigo permanece consultável e tem `is_stale=true` quando a revisão da base ou regras ativas mudou. Ele conserva seus dados, fatores e evidências. O frontend não o apresenta como ranking atual após uma edição.

## 9. Snapshots e reprodutibilidade

Guardar, no mínimo: entradas normalizadas da empresa, sinais/contatos efetivamente considerados, oportunidades históricas usadas/excluídas e motivo, snapshot completo da configuração, `ruleset_id`, `as_of`, versões/revisões e decomposição por critério. IDs sozinhos não bastam se o conteúdo das linhas puder mudar.

Cache por `(dataset_id, data_revision, review_revision, ruleset_id, as_of)`. A revisão interna de revisão humana muda em decisões/conclusões e mantém rótulos/pendências consistentes. GET de ranking pode criar/reusar um snapshot derivado; não chamar IA. Novas páginas e CSV usam `snapshot_id` para não misturar posições de momentos diferentes. Snapshots imutáveis não recebem edições nem precisam replicar seu JSON em outro log de auditoria.

O seed, sob os defaults deste pacote, resulta em 56 contas dentro, 37 fora e 27 pendentes. Esse é um teste de consistência do motor e dos dados normalizados, **não validação da qualidade comercial do recorte**. Alterar parâmetros ou fatos altera essas contagens legitimamente.
