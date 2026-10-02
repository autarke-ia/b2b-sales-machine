# 00 · Decisões, escopo e responsabilidades

## 1. Objetivo

Dar ao SDR uma lista de contas priorizadas, com motivo da prioridade, informações de ICP, evidências, decisores e canais disponíveis. O protótipo apoia a validação das informações existentes e a preparação do contato.

O material da Semana 2 é a base funcional; o feedback da mentora de 30/09 remove a busca externa da primeira fase. As decisões posteriores de Marco, nesta conversa, prevalecem sobre sugestões antigas. A rastreabilidade dessas mudanças está em [10_FONTES_E_PREMISSAS.md](10_FONTES_E_PREMISSAS.md).

## 2. Decisões já tomadas por Marco

| ID | Decisão vinculante |
|---|---|
| D01 | Usuário pode fazer upload de XLSX no formato do case e de CSVs nos contextos correspondentes. A base fictícia vem pré-carregada para demonstração. |
| D02 | Schema conhecido e documentado. Tela edita critérios conhecidos, sem construtor genérico de regras. |
| D03 | Primeira etapa: desqualificadores + aderência ponderada ao ICP + corte configurável. Saída concluída booleana; avaliação inconclusiva fica pendente. |
| D04 | Dados ausentes não equivalem a incompatibilidade. A IA pode tratar lacunas necessárias à decisão das contas pendentes. |
| D05 | Empresas fora do ICP não participam do ranking. Continuam armazenadas, consultáveis e corrigíveis. |
| D06 | Segunda etapa: score de prioridade baseado em `Regras_Score_Exemplo`, somente para empresas dentro do ICP. Reaproveitar critérios; não somar a nota de ICP. |
| D07 | Pode haver ranking preliminar. Sugestões não aprovadas não alteram dados nem pontuação. |
| D08 | CRUD manual com autoria e histórico. Não exigir justificativa nem evidência para toda edição manual. |
| D09 | Estado atual em tabelas operacionais; histórico append-only, antes/depois, na mesma transação. Controle de versão para concorrência. |
| D10 | Login individual com usuários pré-cadastrados, todos no mesmo ambiente compartilhado. |
| D11 | Metadados de validação em camada fina; geração/envio de abordagens fica fora da primeira versão. |
| D12 | Referência: frontend TypeScript, backend TypeScript, PostgreSQL e Prisma. Backend PHP continua possível por contrato, usando uma camada de persistência apropriada. |

## 3. Requisitos funcionais e fronteiras

| ID | Requisito | Dentro do MVP | Fora desta versão |
|---|---|---|---|
| RF01 | Acesso | Login/logout e sessão individual | Cadastro público, recuperação por e-mail, SSO |
| RF02 | Bases | Demo e bases vazias para importação; seleção de base | Multitenancy comercial, isolamento por organização e faturamento |
| RF03 | Importação | Prévia, validação, confirmação, XLSX conhecido, CSVs tipados | Mapeador arbitrário de colunas, sincronização contínua com CRM/Drive |
| RF04 | Cadastro | Criar/editar/arquivar/restaurar empresas, sinais, contatos e oportunidades | Exclusão física pelo usuário, gestão de clientes/portfolio como CRM |
| RF05 | Regras | Critérios existentes, pesos, faixas, corte, desqualificadores; publicação versionada | Regras em linguagem natural executáveis, SQL livre, novos tipos de critério |
| RF06 | IA | Interpretar `Sinais_Publicos`, preencher lacunas, apontar confirmação/contradição/inconclusão | Web, LinkedIn, CNPJ real, scraping, descoberta de novos leads |
| RF07 | Revisão | Aceitar, rejeitar ou adiar; preservar evidência e autoria | Autoaceite por confiança, sobrescrita silenciosa |
| RF08 | Avaliação | Gate ICP, score final, decomposição e snapshot reproduzível | Previsão de probabilidade de compra ou treinamento de modelo preditivo |
| RF09 | Ranking | Filtrar, ordenar de forma determinística, exportar CSV | Distribuição automática de carteiras e execução de campanhas |
| RF10 | Decisores | Consolidar contatos/canais disponíveis e permitidos no cenário | Encontrar perfis externos ou garantir identidade da pessoa |
| RF11 | Auditoria | Append-only, consulta por registro/campo, fonte e autor | Event sourcing integral, blockchain, trilha inviolável contra administrador |
| RF12 | Medição | Início/pausa/retomada/conclusão, contagens e exportação | Plataforma de experimentação ou dashboard comercial sofisticado |

## 4. Escolhas operacionais desta versão

Estas escolhas tornam a especificação implementável; não são novas exigências dadas pela mentora:

- Uma **base lógica (`dataset`)** separa demonstração e arquivos do usuário. Todas as bases são visíveis aos usuários do mesmo ambiente. A seleção não cria permissões por cliente.
- Banco gerenciado PostgreSQL; Prisma é o ORM/migrations, não o nome obrigatório do provedor de hospedagem. API e worker podem compartilhar código e banco. Não exigir Redis, Kafka, microserviços ou infraestrutura da Autarkeia.
- Mesmo domínio para frontend e `/api/v1`, por proxy/rewrite. Sessão em cookie e proteção CSRF. Credenciais do banco e da IA somente no backend.
- `as_of` da demo: `2026-09-30`. Em base nova: data corrente UTC. Fixar a data estabiliza recência durante o experimento; não transforma dados atuais em um backtest histórico.
- Valores iniciais da fórmula são configuráveis. Nenhuma regra depende de reproduzir o ranking fictício fornecido.

## 5. Divisão de trabalho

Gabriel responde pela API, persistência, importação, autenticação, auditoria, regras, worker de IA e testes do backend. Marco responde por navegação, telas, edição, prévias, revisão, estados de erro, consumo da API e testes do frontend. Mudanças no contrato e nos parâmetros iniciais que alterem comportamento são alinhadas pelos dois antes de merge.

O backend é responsável por toda decisão de negócio e validação definitiva. O frontend pode validar formulários para usabilidade, mas não recalcula a pontuação para substituir a resposta do servidor.

## 6. Controle de mudança

`v1.0.0` congela nomes, tipos, enums, rotas e semântica apresentados. A implementação pode escolher bibliotecas sem mudar essa interface. Uma alteração incompatível exige versão nova do contrato, fixtures e testes atualizados no mesmo PR e aceite de ambos. Não acrescentar funcionalidades da fase 2 enquanto os testes P0 estiverem falhando.
