# Exemplos de comunicação

As respostas JSON deste diretório são fixtures fictícias compatíveis com o contrato. Elas não representam um servidor já em execução nem credenciais válidas.

`company-detail.json`, `company-detail-pending.json` e `company-detail-out.json` cobrem os três estados do gate. `ranking.json` e `ranking-empty.json` cobrem lista e vazio. `suggestions.json` contém confirmação a revisar; demais variantes ilustram preenchimento, contradição e inconclusão. `job-running.json` e `job-partial-failed.json` apoiam a tela de progresso. Erros de conflito/validação têm códigos para recuperação.

`scoring-input.json` é entrada do motor de referência, não corpo de um endpoint público. `_ids.json` reúne IDs usados nas fixtures. A única fonte normativa de request/response é `../contracts/openapi.yaml`.

Não enviar esses tokens/usuários ao ambiente real. No frontend, servir os exemplos por um mock explicitamente identificado e substituir a camada de transporte quando o backend estiver disponível. Não manter um fallback silencioso para fixtures em produção.
