# 05 · Especificação do frontend — Marco

## 1. Objetivo e fronteira

Construir uma interface TypeScript que consome somente a API contratada. Usar a stack de frontend familiar, como Next.js/React; componentes, estilo e biblioteca de dados ficam a critério de Marco. Nenhuma dependência direta de Prisma, banco, prompts secretos ou chave do modelo no navegador.

Tela principal: lista/ranking de contas e painel de detalhe. A primeira versão deve ser utilizável em desktop; em telas menores, painel lateral vira página/seção empilhada. Preservar legibilidade de tabelas, navegação por teclado e labels de formulário. Não depender apenas de cor para estado.

## 2. Rotas de interface

As rotas abaixo são do frontend; não alteram a API:

| Rota sugerida | Finalidade |
|---|---|
| `/login` | Login individual |
| `/app` | Selecionar demo/base; redirecionar à base atual |
| `/app/:datasetId/companies` | Lista de contas, incluindo pending/out |
| `/app/:datasetId/ranking` | Empresas in, score e posições |
| `/app/:datasetId/companies/:companyId` | Detalhe, revisão, sinais, contatos e histórico |
| `/app/:datasetId/imports/:importId` | Prévia, erros e confirmação |
| `/app/:datasetId/rules` | ICP, prioridade, desqualificadores e publicação |
| `/app/:datasetId/metrics` | Resumo mínimo e download do experimento |

Modal/drawer pode substituir rotas secundárias, desde que URLs e retorno à lista preservem base e filtros.

## 3. Tela de acesso e seleção de base

E-mail e senha, mensagens genéricas de falha, submit bloqueado enquanto o pedido está em curso. Recuperar sessão por `/auth/session` no carregamento. Sem cadastro público ou login compartilhado “demo”. Todos os usuários pré-cadastrados acessam a base de demonstração.

Mostrar nome da base e badge “Dados fictícios” quando demo. Ação “Nova base” cria somente um agrupamento vazio com defaults; não cria organização/assinatura. Base selecionada e filtros podem ficar na URL/localStorage; token de sessão e segredos não.

## 4. Lista de empresas e ranking

Lista de empresas contém todas as contas não arquivadas por padrão, com busca e filtros `icp_state`, segmento e UF. Oferecer visão de arquivadas para restauração. Não esconder definitivamente empresas excluídas do ICP.

Ranking exibe: posição, empresa, segmento, colaboradores, UF, score de prioridade, faixa, preliminar/revisado, pendências e disponibilidade de decisor/canal. A avaliação de cada linha permite expandir a decomposição. **Não mostrar a nota de ICP como score de prioridade.**

Filtros de ranking: busca, segmento, UF, faixa, decisor identificado e faixa de colaboradores. A ordenação de negócio é fixa pelo backend. Pode ordenar uma tabela apenas quando houver opção correspondente no contrato; não reordenar só a página atual e chamar isso de ranking global.

A posição original é preservada após filtros: ver itens 4 e 12 não é um erro. Paginar usando o mesmo snapshot_id. Exibir a data de referência, regra usada e aviso quando o snapshot envelhecer. “Atualizar ranking” refaz a consulta sem snapshot_id.

Exportar aplica exatamente o snapshot e filtros visíveis; não exportar apenas a página atual. Desabilitar o botão enquanto não houver snapshot válido. CSV é relatório, não botão de envio de mensagens.

## 5. Detalhe da empresa

### Cabeçalho

Nome, external_id, dataset, versão e origem. Estado do gate: Dentro do ICP / Fora do ICP / Pendente. Mostrar motivo de exclusão ou campos que impedem decisão. Uma conta pendente tem `in_icp=null`, não um falso booleano.

### Seção “Cadastro”

Editor tipado para campos conhecidos. Booleanos usam três opções: Sim / Não / Não informado. Níveis mostram Baixo / Médio / Alto / Não informado. Não inicializar desconhecidos com o primeiro item do select.

Exibir fonte/última autoria de mudança quando disponível. Salvar manualmente não exige justificativa nem URL. PATCH envia apenas campos alterados, com expected_version. Ao limpar campo nullable, enviar null explicitamente. Nome e outros não-null não podem ser limpos.

### Seção “ICP e prioridade”

Apresentar separadamente: intervalo/nota de aderência, corte e desqualificadores; depois score de prioridade, intervalo possível, faixa e contribuições. Prioridade null é “Não participa do ranking”, nunca “0 pontos”. Mostrar os motivos de ausência de S10 e D05 desconhecido quando aplicável.

Cada critério mostra fator, peso, pontos, campo de origem e evidência ligada. Score inteiro é retornado pelo backend; frontend só formata. Evidências/contatos têm links para o registro na interface, não acesso direto ao banco.

### Seção “Sinais e sugestões”

Listar sinais importados e sugestões do agente. Card de sugestão mostra campo, valor atual, valor sugerido, relação, confiança qualitativa, justificativa, trecho exato, origem/linha e data. Separar fato importado de interpretação da IA.

Botões: Aceitar / Rejeitar / Manter pendente. Aceitar depende de `can_accept=true`. Um bloqueio apresenta `blocked_reason`; não expor um atalho para forçar aceite. Confirmação aceita registra validação, sem fabricar uma alteração de valor.

Uma sugestão inconclusiva não oferece Aceitar. Uma sugestão stale mostra “O dado ou a evidência mudou; reanalise”. O usuário pode editar manualmente pelo editor, mantendo autoria própria; não converter isso em “aceite com evidência”.

### Seções “Contatos”, “Oportunidades” e “Histórico”

Contatos/canais permitem CRUD e CSV correspondente. Exibir vínculo profissional e fonte permitida como estados, sem chamar todo canal de decisor. Um contato proibido/não declarado é exibido como bloqueado para utilização. URLs sintéticas ficam como texto; links reais aprovados só abrem por clique explícito com protocolos permitidos.

Oportunidades permitem CRUD/importação com indicação de que dados sem data/segmento de fechamento não pontuam S10. Clientes atuais/portfolio do case aparecem apenas como contexto, sem módulo comercial adicional.

Histórico mostra horário, autor, origem, campos e valores antes/depois. Filtro por campo e paginação. Permitir copiar valores antigos para uma nova edição manual; não editar evento nem criar botão de rollback automático na primeira versão.

## 6. Importação

Ação geral “Importar XLSX” na base. Ações CSV em Empresas, Sinais, Contatos, Oportunidades e grupos de regras. Cada ação oferece o modelo correto e descrição dos campos.

Fluxo: escolher arquivo → selecionar política/separador quando necessário → validar → prévia → confirmar. Prévia mostra contagens criar/alterar/ignorar, erros, avisos, overwrite e campos derivados. Upload aceito não significa importação concluída.

Desabilitar confirmação para status invalid/expired. Reimportação obsoleta abre nova prévia, preservando o arquivo selecionado quando seguro. Para overwrite, mostrar confirmação explícita e diferenças antes/depois. Nada de esconder o total de registros afetados.

Após commit, atualizar listas/ranking e abrir rascunho de regras caso exista. Não mostrar regras como ativas antes da resposta de publicação.

## 7. Tela de regras

Três áreas: Gate ICP, Priorização e Desqualificadores. Carregar a configuração ativa. Pesos de ICP e prioridade somam 100 **separadamente**; mostrar total e campos inválidos. Não fazer ajuste proporcional silencioso.

Editar somente critérios e parâmetros conhecidos. Fatores compartilhados precisam indicar onde também afetam a prioridade. D03 aparece como regra de uso de contatos sem opção de desligar. Alteração de pesos/faixas gera um rascunho completo.

Resumo antes de publicar: pesos/limites anteriores e novos, corte do ICP, grupos afetados e aviso de recálculo. Em RULESET_CONFLICT, recuperar ativa atual e exigir revisão; não publicar sobre alteração do colega sem aviso. Versões publicadas têm visualização somente-leitura.

## 8. Ações assíncronas e rede

Botão “Analisar lacunas do ICP” para contas pendentes; “Analisar sinais” para elegíveis. Em lote, enviar IDs explicitamente selecionados; nunca presumir que seleção de uma página representa toda a base.

Persistir job_id para sobreviver a reload. Mostrar progresso, contas processadas/falhas/puladas e sugestões disponíveis. Em partial_failed, permitir retry apenas das falhas. Polling com AbortController na troca de tela; impedir resposta antiga de sobrescrever estado de uma base diferente.

Guardar uma Idempotency-Key por intenção do usuário até obter resultado conclusivo. Retry de rede reusa a chave; novo clique intencional, após conclusão, cria chave nova. Não repetir automaticamente um PATCH após 409.

## 9. Cronometragem e métricas finas

Ação explícita “Iniciar validação” registra modo manual/assistido. Mostrar cronômetro com Pausar / Retomar / Concluir / Abandonar. O relógio visual é projeção dos dados do servidor, não fonte de verdade para duração.

Ao sair da tela, oferecer pausa; a interface pode solicitar pausa quando ficar oculta, mas não afirmar que o evento foi salvo se a rede falhar. Recuperar sessões abertas no retorno, avisando que uma interrupção pode comprometer a medida. Completar exige input_revision atual; se houve alteração concorrente, recarregar antes.

Tela de métricas: sessões completas, média/mediana de tempo, sugestões aceitas/rejeitadas/pendentes e taxa de aceitação. Valores null mostram “Sem observações”. Explicar que a medida é tempo de validação, não pesquisa web; 22 minutos do case são referência fictícia, não baseline medido.

## 10. Estados de interface obrigatórios

Cada consulta importante possui loading, vazio, erro e dados. Cada mutação possui idle, submitting, sucesso e falha recuperável. Empty state do ranking orienta ver pendentes/fora; não promete que “todas as empresas foram eliminadas” sem consultar o gate.

401 → login preservando rota de retorno; 409 → explicar conflito e oferecer recarregamento; 422 → apontar campo; 429 → espera informada; 500 → request_id e retry seguro. Não usar toast como única forma de expor erro de formulário ou conflito.

Após aceite/CRUD/publicação, invalidar caches de detalhe, lista, ranking, histórico e métricas pertinentes. Nunca marcar alteração como salva antes da confirmação do backend. Edição otimista do score fica fora desta versão.

## 11. Desenvolvimento antes do backend

Usar `examples/` para respostas representativas e interceptação local de HTTP. O modo mock deve ter aviso visível e não ser ligado por acidente no deploy final. Exemplos cobrem sucesso, pending/out, conflito, dados ausentes e falha de job; ampliar mocks sem mudar schemas.

Não inventar campos temporários no DTO para facilitar UI. Estados exclusivos do frontend, como card expandido, ficam fora da API. Tipos gerados de OpenAPI ajudam a detectar divergências; snapshots de interface não substituem testes das requisições.

## 12. Definição de pronto do frontend

Percorrer a jornada com backend real, demonstrar conflito entre dois usuários, importar XLSX/CSV, publicar regras, aceitar e rejeitar sugestões, ver mudança de gate/ranking, consultar valores antigos e exportar o mesmo snapshot exibido. A demo precisa sobreviver a reload sem perder registros ou confundir mock com implementação real.
