# 10 · Fontes, proveniência e premissas

## 1. Fontes do projeto

**[P1] Decisões de Marco nesta conversa.** Upload de XLSX/CSVs, duas etapas de avaliação, tratamento de pendências, reaproveitamento de critérios sem somar notas, CRUD manual, usuários individuais, histórico append-only e instrumentação fina foram explicitamente discutidos e confirmados. Marco autorizou detalhar a fórmula operacional. Nenhum threshold numérico específico foi apresentado por ele como dado observado.

**[P2] Exportação do grupo `WhatsApp Chat - G2 ITA Challenge(1).zip`.** Trechos consultados: proposta de Gabriel em 27/09/2026 às 21h23; orientação de Bárbara em 30/09/2026 às 10h46; divisão front/backend proposta por Marco em 01/10/2026 às 14h09 e resposta de Gabriel às 14h12. O chat completo não é redistribuído neste pacote.

A orientação de 30/09 separa duas fases: no protótipo, usar só a planilha e cruzar Sinais_Publicos com Prospects; busca real fica como evolução. Também corrige a métrica para tempo de validação e sugere acompanhar qualidade/aceitação. Essa orientação é posterior ao texto do deck que mencionava pesquisa externa.

**[P3] `ITA_Challenge_G2_Semana_2_Hipoteses_Allya.pdf`, oito páginas, 27/09/2026.** Consultado diretamente do ZIP. Páginas 3–5: fluxo, revisão e recorte; página 6: referência fictícia/qualidade; página 7: plano de validação; página 8: dúvidas depois respondidas pela mentora. Não tratar suas hipóteses como resultados implementados.

**[P4] Base de Dados — Allya.** Leitura e exportação autenticadas do Google Drive nesta execução. Identificador: `19lEVw3R403IJMWnaZk0M795s-JSYs_Nv8eiyLzRLGJo`. Cópia original incluída em `seed/allya-case-original.xlsx`, com hash no seed normalizado. Planilha declarada como dados fictícios. Abas e cabeçalhos foram conferidos, incluindo os dois conjuntos distintos de pesos e a falta de datas no histórico.

**[P5] Desafio 01 — Allya.** Documento do projeto previamente consultado na conversa, identificador `1jOSzqvWnMgpaz4T9fDVusin2LZY2tyHW`. Requisitos de listagem, ICP, cruzamento, sinais, score, ranking, contatos/canais e evidências. Não substitui os esclarecimentos posteriores do recorte.

## 2. Precedência aplicada

Decisões mais recentes de Marco → feedback da mentora compatível com elas → enunciado e apresentação → dados de exemplo → defaults técnicos desta especificação. Em particular, a exigência antiga de evidência para toda atualização não se aplica a uma edição manual livre autorizada por Marco; continua obrigatória para aceitar uma **sugestão atribuída à IA**.

Ranking de referência e casos de validação são instrumentos de comparação, não labels obrigatórios nem entradas escondidas do produto. Clientes atuais não foram automaticamente excluídos: não houve decisão de transformar essa aba em impedimento.

## 3. Defaults que precisam de calibração posterior

| Item | Default escolhido | Natureza |
|---|---|---|
| Corte de ICP | 60/100 | Parâmetro inicial, não resultado de ajuste estatístico |
| Nível médio | Fator 0,5 | Pontuação parcial explícita |
| UF brasileira fora da lista prioritária | Fator 0,5 no critério região | Não transforma região não prioritária em impedimento |
| Recência | Até 90 dias, inclusivo | Janela operacional inicial |
| D05 | −20 pontos quando confirmado | Penalidade inicial; condição desconhecida não é aplicada |
| Faixas | Alta ≥70; média ≥40; baixa <40 | Labels de prioridade, não probabilidades |
| Histórico S10 | Exigir data e segmento no fechamento; excluir a própria empresa | Proteção contra uso temporal indevido e circularidade |
| Base demo | as_of 30/09/2026 | Reprodutibilidade do teste |
| Limites de arquivo/base/job | Conforme specs 01 e 04 | Limites do MVP, a revisar após medição |

Interpretar UF como localização da operação brasileira foi registrado como uma derivação explícita na demo. Valores de benefícios e renovação longa foram deixados ausentes. Não há tentativa de enriquecer empresas fictícias consultando domínios reais parecidos.

## 4. Referências técnicas primárias consultadas

Consultadas nesta execução; servem de fundamento dos mecanismos. A aplicação ainda precisa implementá-los e testá-los.

- **[T1] PostgreSQL — Trigger Functions**, exemplo de auditoria de mudanças: https://www.postgresql.org/docs/current/plpgsql-trigger.html
- **[T2] PostgreSQL — Overview of Trigger Behavior**, execução de trigger na transação: https://www.postgresql.org/docs/current/trigger-definition.html
- **[T3] Prisma — Transactions**, limites e uso de transações: https://www.prisma.io/docs/orm/fundamentals/transactions
- **[T4] OWASP — File Upload Cheat Sheet**, validação e armazenamento de uploads: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- **[T5] OWASP — Session Management Cheat Sheet**, sessão e cookies: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- **[T6] OWASP — CSRF Prevention Cheat Sheet**, proteção de mutações autenticadas por cookie: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- **[T7] OpenAPI Specification 3.1.1**, descrição formal da interface HTTP: https://spec.openapis.org/oas/v3.1.1.html
- **[T8] OWASP — Password Storage Cheat Sheet**, hash de senhas: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- **[T9] PostgreSQL — Privileges**, papéis e limites dos privilégios: https://www.postgresql.org/docs/current/ddl-priv.html
- **[T10] Prisma — Editing a migration**, uso de SQL em migrations personalizadas: https://www.prisma.io/docs/orm/migrations/editing-a-migration
- **[T11] Laravel — Database**, alternativa de backend PHP/PostgreSQL: https://laravel.com/framework/docs/13.x/database

Versões numéricas de runtime/bibliotecas não foram congeladas a partir de memória. O backend escolhe uma combinação suportada e a registra em seu lockfile. OpenAPI 3.1.1 é uma escolha de compatibilidade do contrato, não uma afirmação de que seja a versão mais recente da especificação.

## 5. O que permanece deliberadamente fora

Sem busca pública, scraping, LinkedIn real, descoberta de pessoas, mensagens geradas/enviadas, multitenancy, campanhas, CRM completo ou reaproveitamento obrigatório da Autarkeia. Se esses itens entrarem depois, exigem uma revisão explícita de escopo, dados permitidos, segurança e contrato. Não os deixar escondidos como requisito para a primeira demo.
