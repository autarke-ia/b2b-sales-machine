# Modelos de importação

CSVs de domínio contêm só cabeçalho; preencher uma ou mais linhas. CSVs de regras contêm a configuração inicial completa para facilitar edição. Encoding UTF-8 com BOM e separador vírgula.

`companies.csv`: empresas. `signals.csv`, `contacts.csv`, `opportunities.csv`: registros relacionados por company_external_id. Regras são importadas nos destinos icp_rules, priority_rules e disqualifiers.

O modelo completo de XLSX é `../seed/allya-case-original.xlsx`: manter nomes de abas e cabeçalhos conhecidos. A importação pode conter novas linhas e valores, não precisa preservar os dados fictícios. Apagar uma coluna obrigatória ou introduzir expressão de regra desconhecida gera erro de validação.

Colunas opcionais podem ser omitidas; campos ausentes em criação ficam null ou no default documentado. Campo vazio em atualização preserva valor atual. `__NULL__` só apaga explicitamente em overwrite confirmado e campo nullable. Para modelos e campos detalhados, ver `../01_MODELO_DE_DADOS_E_IMPORTACAO.md`.
