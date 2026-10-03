# ITA Challenge · Grupo 2 · Allya
## Protótipo v1 implementado · especificação v1.0.0

**Marco: frontend. Gabriel: backend.** Data de referência: 01/10/2026.

Este repositório contém o **protótipo implementado** (Fases 0–4 do plano: motor determinístico, API, auditoria append-only, importação CSV, regras versionadas, IA assistida com revisão humana e métricas) **e** o pacote de especificação que o governa. A especificação permanece normativa: divergência entre código e documento corrige o pacote antes de implementar.

## Quick start

```bash
pnpm install     # dependências + prisma generate (pnpm 9.15.9, Node ≥ 20)
pnpm db:setup    # papéis → migrations → seed da demo (idempotente)
pnpm dev         # http://localhost:3000
```

- **Banco**: PostgreSQL `b2b_sales_machine_dev` (credenciais no `.env` local — copie os nomes do [`.env.example`](.env.example); nunca versionado).
- **Login**: usuários pré-cadastrados definidos em `SEED_USERS` do `.env` (ex.: `dev1@b2bsm.local` e `dev2@b2bsm.local`; **as senhas estão no seu `.env`**). Dois usuários = demonstração do conflito 409 em duas janelas.
- **IA**: `AI_PROVIDER=fixture` — interpretador determinístico sobre os sinais da base, sem chave nem rede.

### Verificar

```bash
pnpm test        # 151 testes de domínio + contrato (contra o banco real)
pnpm e2e         # 4 jornadas no navegador — ATENÇÃO: reseta a demo antes/depois
pnpm test:all    # typecheck + lint + test + build + e2e (gate completo)
```

O roteiro completo de execução, demonstração e troubleshooting está no
[runbook](docs/runbooks/rodar-e-testar.md). Demo carregada: 120 empresas,
287 sinais — 56 dentro do ICP / 37 fora / 27 pendentes sob os defaults.

### Começar por aqui (especificação)

| Leitor | Ordem sugerida |
|---|---|
| Ambos | [Escopo e decisões](00_DECISOES_E_ESCOPO.md) → [Contrato HTTP](03_CONTRATO_API.md) → [Plano de entrega](09_PLANO_DE_ENTREGA.md) |
| Gabriel | [Backend](04_BACKEND_GABRIEL.md), [Modelo e importação](01_MODELO_DE_DADOS_E_IMPORTACAO.md), [Fórmulas](02_REGRAS_ICP_E_PRIORIZACAO.md), [Auditoria](07_AUDITORIA_SEGURANCA.md) |
| Marco | [Frontend](05_FRONTEND_MARCO.md), [Contrato HTTP](03_CONTRATO_API.md), diretório `examples/` |
| Grupo/mentora | [IA e revisão](06_IA_E_REVISAO_HUMANA.md), [Aceite e experimentos](08_TESTES_E_CRITERIOS_DE_ACEITE.md) |

### Fluxo contratado

Importar/abrir uma base → avaliar o ICP → tratar lacunas das contas pendentes → revisar sugestões → pontuar somente empresas dentro do ICP → exibir ranking, motivos, evidências e canais disponíveis.

A primeira nota é usada para decidir **dentro / fora / pendente**. A segunda é usada para **priorizar as empresas dentro do ICP**. Os critérios compartilhados são reutilizados; a nota inteira de ICP não é adicionada à segunda nota.

A IA lê os sinais presentes na planilha. Não pesquisa na internet, não altera cadastros sozinha, não calcula scores e não envia mensagens.

### Autoridade dos arquivos

- `contracts/openapi.yaml` é a fonte normativa dos formatos HTTP/JSON. O `.json` contém a mesma especificação; não editar os dois independentemente.
- Os documentos Markdown definem regras de negócio, estados, segurança e comportamentos que não cabem somente no schema.
- `contracts/rules-default-v1.json` contém os parâmetros iniciais. Os pesos provêm das duas abas do case; corte de 60, janela de 90 dias, fatores parciais e penalidade de 20 são **decisões operacionais desta especificação**, autorizadas para detalhamento por Marco, ainda não calibradas em experimento.
- `tools/scoring-reference.mjs` e `tests/` materializam exemplos e verificações. O backend pode ser TypeScript ou PHP, desde que produza o mesmo comportamento.
- Divergência entre código auxiliar e documento deve gerar correção do pacote antes de implementar. Não resolver silenciosamente de um lado só.

### Conteúdo adicional

`seed/allya-case-original.xlsx` é uma cópia da base fictícia fornecida. `normalized-demo.json` é o seed normalizado e documenta inferências de importação. `expected-assessments-v1.json` é a saída do motor desta versão, não um gabarito comercial independente. Os CSVs em `templates/` servem de modelos de upload; o catálogo de campos é servido pelo backend em `/schema`.

Os arquivos de `examples/` são fixtures locais para o frontend, sem usuários reais ou credenciais válidas. Não representam resultados obtidos em produção. O histórico original do WhatsApp não está incluído.

### Verificação local

```bash
node --test tests/scoring.test.mjs
python tools/validate_package.py
```

A primeira verificação não exige bibliotecas externas. A segunda usa `jsonschema` e, quando disponível, `openapi-spec-validator`; as instruções estão no relatório [VERIFICACAO.md](VERIFICACAO.md). Nenhum desses comandos faz chamadas a um modelo ou a serviços comerciais.

### Primeiro marco de integração

Login → base de demonstração → lista de empresas → detalhe → edição manual com conflito de versão → histórico append-only → ranking determinístico. Só depois conectar a interpretação por IA. Critérios de pronto: [09_PLANO_DE_ENTREGA.md](09_PLANO_DE_ENTREGA.md).
