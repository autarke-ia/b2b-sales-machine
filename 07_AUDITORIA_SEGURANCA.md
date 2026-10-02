# 07 · Auditoria append-only, concorrência e segurança

## 1. Arquitetura adotada

Manter estado atual nas tabelas operacionais e uma tabela de eventos append-only. Uma edição atualiza o registro atual e insere um evento com cópias antes/depois. O histórico não é a fonte única usada por cada consulta do produto; não é necessário implementar event sourcing completo.

Triggers do PostgreSQL registram mudanças na mesma transação [T1/T2]. ORM pode participar da transação; triggers e grants entram em migration SQL revisada. Não depender de um endpoint se lembrar de chamar um logger e não usar logs de aplicação como única auditoria.

## 2. Conteúdo do evento

| Campo | Uso |
|---|---|
| id | UUID único do evento |
| dataset_id | Base do registro |
| entity_type / entity_id | Tipo conhecido e ID estável |
| operation | create, update, archive, restore, publish, decision, commit ou event |
| version_before / version_after | Versões da linha/entidade; create tem before=null |
| changed_fields | Campos de negócio efetivamente alterados, ordenados |
| before / after | JSON dos campos auditáveis antes/depois; snapshot de negócio, não segredos |
| actor_user_id | Usuário autenticado que editou/aprovou; usuário técnico identificado para seed/sistema |
| source | manual, import, ai_acceptance, seed ou system |
| request_id | Correlação da ação HTTP |
| import_id / suggestion_id | Origem específica quando aplicável |
| occurred_at | Timestamp do servidor/banco, UTC |

Um evento por alteração de registro, mesmo que cinco campos mudem. `created_by/updated_by` facilitam leitura do estado atual, mas não substituem a trilha. Para valores anteriores de um campo, consultar eventos daquela entidade com `changed_fields` contendo a chave e ler before/after.

No-op não gera ruído. Confirmação de valor igual é uma decisão de revisão, não uma alteração fictícia de dados. Decisões e sessões têm sua própria tabela append-only de eventos; não duplicar todo o histórico técnico do worker no audit de negócio.

## 3. Atomicidade e proteção no banco

A credencial da aplicação não pode UPDATE, DELETE ou TRUNCATE `audit_events`, nem INSERT direto arbitrário nessa tabela. O mecanismo de auditoria escreve com função/owner apropriado. Credencial de migrations é separada e não fica na configuração cotidiana da API.

Funções SECURITY DEFINER, se utilizadas, precisam de owner não utilizável pela aplicação, search_path fixo seguro e nomes de tabela qualificados. Retirar privilégios desnecessários de PUBLIC. Não conceder à aplicação ownership de tabelas ou capacidade de desabilitar triggers. O estado de usuários deve permitir validar actor_user_id recebido do contexto de transação.

O backend obtém o ator da sessão; não do payload. Injeta contexto transacional local e inclui import_id/suggestion_id conforme a operação. Ausência de contexto válido em mutação de negócio falha fechada: rollback. Usuário técnico do seed é explícito; não usar null para esconder autoria.

O banco deve reverter alteração e auditoria juntos se qualquer etapa falhar. Testar com falha deliberada da inserção no histórico. Triggers PostgreSQL participam da transação do comando que os acionou [T2].

Essa proteção impede edição ordinária do histórico pela aplicação. Não é garantia de inviolabilidade diante de administrador do banco ou invasor com controle do backend/credencial de migração. O contexto de usuário em GUC é uma atribuição confiada ao servidor, não prova criptográfica da pessoa. Ver limites de privilégios em [T9].

## 4. Versões e updates concorrentes

`UPDATE ... WHERE id=? AND dataset_id=? AND version=?`, com incrementação atômica. Nenhuma linha afetada exige distinguir not found de version conflict sem expor dados de outra base. Campos de autoria/versionamento são server-side.

Exemplo: Marco e Gabriel leem versão 3; Gabriel salva versão 4; PATCH de Marco com expected_version=3 recebe 409. Frontend mostra que precisa recarregar, preserva seu rascunho local para comparação e não manda a mesma alteração com versão nova sem decisão explícita.

Sugestões usam esse controle mais a checagem do campo-alvo e versões de evidências. Importação compara a revisão da base vista na prévia. Publicação compara regra ativa esperada. Auditoria preserva o que ocorreu, mas essas checagens são necessárias para evitar que o conflito ocorra silenciosamente.

## 5. Arquivamento e restauração

“Excluir” na interface significa arquivar. Manter linha, external_id reservado e audit_event. Restaurar altera archived_at, gera novo evento e nova versão. Não sobrescrever uma linha arquivada por reimportação.

Arquivar empresa a remove de listas padrão/ranking e bloqueia novas análises/edições de relacionados até restauração. Não apagar ou arquivar em cascata sinais e contatos: a visibilidade efetiva leva em conta o pai arquivado. Isso permite restaurar a empresa sem perder a árvore de evidências.

Uma evidência arquivada invalida sugestões pendentes que a citam; snapshots antigos retêm seu conteúdo. Histórico não pode sumir porque o registro atual foi arquivado. Exclusão física/retention formal fica fora da interface do MVP e precisa de política própria se o produto passar a operar dados reais.

## 6. Histórico de regras, dados e scores

Guardar configuração completa em cada ruleset publicado; alterar regras cria uma nova versão de conteúdo. Voltar a configuração antiga exige novo rascunho/publicação, preservando quem a reativou. Nenhuma regra publicada é editada in-place.

Cada avaliação congela fatos utilizados, evidências, regras, data de referência e resultado por critério. Assim é possível explicar por que uma conta teve 70 ontem e 50 hoje mesmo após mudanças de peso e de dados.

**Chave de cache completa:** dados/regras/data determinam score; estado de revisão determina o rótulo preliminar/revisado e contagens de pendências. Implementar um `review_revision` da base (incrementado em decisões e conclusões) e incluir também essa revisão no cache/snapshot, ou atualizar esse rótulo em resposta com versão explícita. Neste pacote, adotar a primeira opção: `cache_key=(dataset_id,data_revision,review_revision,ruleset_id,as_of)`. O campo review_revision é interno; `is_stale` compara qualquer uma dessas dependências, não apenas data_revision.

Não reutilizar snapshot com contagem de sugestões antiga depois de aceitar/rejeitar. `current_dataset_revision` pode continuar igual quando só houve revisão; `is_stale` ainda será true. O frontend usa is_stale, não tenta deduzir isso sozinho.

## 7. Autenticação e autorização mínima

Usuários individuais pré-cadastrados, ativos/inativos, todos no mesmo ambiente. Senhas com hash de função apropriada de biblioteca mantida; preferir Argon2id e configurações publicadas pela biblioteca escolhida [T8]. Não escrever uma função de hash caseira nem guardar senha reversível.

Sessão opaca, token aleatório, armazenamento server-side do hash, expiração inicial de oito horas e revogação no logout. Cookie HttpOnly/Secure/SameSite, rotação no login, verificação de origem e token CSRF em mutações [T5/T6]. Limite inicial de cinco tentativas de login por 15 minutos por combinação de usuário/IP, com defesa adicional por IP; parametrizável, sem permitir bypass trocando caixa do e-mail.

Todas as rotas de dados validam sessão, dataset e vínculo de IDs. Arquivos de upload/download ficam privados e só são acessíveis após autorização. A credencial da aplicação não administra usuários via endpoint público. Seed de pessoas usa variáveis/segredos fora do Git.

## 8. Upload e conteúdo não confiável

Permitir apenas XLSX/CSV conhecidos; conferir assinatura/tipo, limites de arquivo descompactado e quantidade de entradas, nomes saneados e parser mantido. Não confiar apenas no MIME enviado pelo navegador. Não armazenar no diretório público de static assets [T4].

Não executar fórmulas/macros/conexões; não visitar URLs automaticamente. Tratar conteúdo importado/gerado como texto escapado, nunca HTML confiável. Links permitidos são http/https por ação explícita; bloquear javascript/data/file. CSV exportado neutraliza prefixos `=`, `+`, `-`, `@`, tabs ou controles em células textuais, por exemplo prefixando apóstrofo antes de escapar aspas.

A IA não recebe ferramentas capazes de escrever dados ou navegar. Validar schema, tipos, IDs e trechos no backend mesmo com resposta “estruturada” do provedor. Limitar tamanho de payload, prompt e saída. Não enviar tabelas com senhas, sessões ou benchmarks ao modelo.

## 9. Testes de segurança obrigatórios

Credencial da aplicação tenta alterar/apagar/truncar audit e falha; escrita sem contexto de ator falha; falha de audit faz rollback do dado; actor spoofing no JSON é rejeitado; cookies/CSRF ausentes não permitem mutação; IDs de outra base são rejeitados; arquivo com fórmula, tipo indevido ou expansão excessiva é recusado; HTML/instruções do sinal não são executados; CSV exportado não executa fórmula ao abrir.

As fontes técnicas fundamentam mecanismos, não atestam a segurança de uma implementação ainda não criada. Testes reais no banco e no navegador fazem parte da definição de pronto.
