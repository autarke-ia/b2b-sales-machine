# 09 · Plano de entrega e handoff

## 1. Ordem de execução

As etapas abaixo são marcos de integração, não estimativas de horas ou promessas de calendário. A prioridade é fechar um fluxo real pequeno antes de expandir interfaces.

| Etapa | Gabriel | Marco | Demonstração de pronto |
|---|---|---|---|
| 0 · Congelar contrato | Escolher implementação interna, iniciar repo/configuração, ler schemas e defaults | Gerar/importar tipos; preparar mocks e rotas | Ambos conseguem identificar requests/responses do primeiro fluxo |
| 1 · Base e estado atual | Migrations, auth, seed, GETs, CRUD de empresa, controle de versão e audit | Login, seleção de base, lista/detalhe, edição e histórico | Dois usuários editam; conflito 409 e histórico funcionam |
| 2 · Motor e ranking | Portar motor, validar cases, snapshot e export | Gate separado de prioridade; filtros, explicações, pending/out | Ranking real sem IA, com decomposição e CSV consistente |
| 3 · Importação e regras | Parser, prévia/commit, CRUD relacionados, rascunho/publicação | Upload XLSX/CSV nas áreas certas; prévia e edição de regras | Novo arquivo altera dados; regras mudam só após publicação |
| 4 · IA e revisão | Job durável, adaptador, evidências e aceite transacional | Progresso, cards de sugestão, ações e recuperação de erros | Sugestão real aceita muda um campo e recalcula resultado |
| 5 · Experimento e fechamento | Sessões/exportação, testes reais de segurança e restart | Cronômetro fino, estados finais, roteiro de demo | Lote manual/assistido com dados de tempo e revisão de qualidade |

Não adiar auditoria/concorrência para a etapa 5: elas são fundação da etapa 1. Não começar geração de mensagens enquanto essas cinco etapas estiverem incompletas.

## 2. Backlog mínimo por responsável

### Gabriel

BE01 auth/sessão/CSRF; BE02 migrations e papéis do banco; BE03 seed/idempotência; BE04 CRUD e versionamento; BE05 trigger/auditoria; BE06 motor puro; BE07 snapshots/ranking/CSV; BE08 importação com prévia/commit; BE09 regras versionadas; BE10 worker/LLM; BE11 decisões humanas; BE12 métricas e testes de integração.

### Marco

FE01 login/seleção de base; FE02 lista/detalhe e formulários tipados; FE03 histórico/conflito; FE04 gate/ranking/decomposição; FE05 filtros/exportação; FE06 uploads/prévias; FE07 editor/publicação de regras; FE08 job/sugestões/evidências; FE09 cronômetro/resumo; FE10 jornada real e estados de rede.

## 3. Pontos de alinhamento rápidos

No início de cada etapa, combinar quais operações do OpenAPI serão implementadas e entregar fixtures correspondentes. Ao concluir, executar o mesmo roteiro no ambiente de ambos. Mudanças em campos/enums/códigos de erro exigem atualizar contrato no mesmo PR, não uma mensagem informal dizendo que “o back está um pouco diferente”.

URL local, origem permitida, porta e proxy são configuração do ambiente. Não alterar caminhos da API conforme a preferência do framework. Mock é substituído pelo endpoint real mantendo a mesma forma de dados.

Não depender do segredo de IA para trabalhar em importação, motor e frontend. O adaptador pode começar com fixture claramente identificada no desenvolvimento; a etapa 4 só está pronta com chamada real configurada e validada.

## 4. Roteiro da primeira demo integrada

1. Entrar como Marco, abrir a base fictícia e ver o ranking atual.
2. Abrir conta pending ou out e explicar a diferença entre informação ausente e impedimento.
3. Abrir uma conta in, mostrar o cálculo ICP e a prioridade sem somar as duas notas.
4. Editar um campo manualmente, observar recálculo e histórico antes/depois.
5. Com Gabriel em outra sessão, provocar uma edição concorrente e mostrar 409 sem perda silenciosa.
6. Importar CSV de sinal, gerar análise, revisar uma proposta com trecho de origem e aceitar/rejeitar.
7. Mostrar a nova posição ou saída do ICP, e o snapshot antigo preservado.
8. Exportar ranking e metadados da validação, identificando os dados fictícios e limites do experimento.

Passos 6–8 entram conforme as etapas correspondentes estiverem prontas. Não substituir resultado não implementado por animação que aparenta uma execução real.

## 5. Mensagem para compartilhar o pacote com Gabriel

```text
Gabriel, fechei as specs do MVP e o contrato entre front e back. Vou ficar com o frontend.

O pacote tem um README com a ordem de leitura, uma spec do backend, o contrato HTTP/OpenAPI, o schema de importação, as fórmulas das duas etapas e os testes de aceite.

O fluxo é: importar a base → decidir dentro/fora/pendente do ICP → tratar lacunas com os sinais da planilha → validar sugestões → priorizar só as contas dentro do ICP. A nota de ICP não é somada à nota final.

Mantive o feedback da Babi: nesta versão não haverá busca externa nem envio de mensagens. A IA sugere; a alteração depende do usuário; score é determinístico e mudanças têm histórico append-only.

Minha referência é TypeScript + Postgres/Prisma, mas o contrato é independente da linguagem. Se PHP for mais rápido pra você, podemos manter a API e usar a persistência correspondente.

Proponho começar pela etapa 1: login, seed, lista/detalhe, edição de empresa e auditoria. Consigo desenvolver o front com as fixtures enquanto você entrega essas rotas. Depois integramos ranking, importação e IA, nessa ordem.
```

## 6. Limite do pacote

Este material é especificação, dados de demonstração e apoio executável ao contrato. Não afirma que o backend foi implementado, que permissões/triggers já foram testadas no PostgreSQL ou que o protótipo alcançou as métricas. O relatório de verificação separa explicitamente o que foi executado do que ainda cabe aos repositórios de implementação.
