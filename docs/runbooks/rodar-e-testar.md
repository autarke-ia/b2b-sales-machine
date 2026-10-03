# Runbook — Rodar e testar a plataforma

> Como subir o protótipo, executar cada suíte de verificação e percorrer o
> roteiro de demonstração. Público: o próprio time (Demo Day, treino de demo,
> check de sanidade após mudanças).
> Fontes normativas: `README.md`, `docs/plans/prototipo-v1-b2b-sales-machine.md`,
> `09_PLANO_DE_ENTREGA.md` §4 (roteiro de demo).

## 1. Pré-requisitos

| Item | Versão/valor |
|---|---|
| Node | ≥ 20 (ambiente de referência: 24) |
| pnpm | 9.15.9 (campo `packageManager` — o próprio pnpm recusa versão errada) |
| Banco | PostgreSQL do RDS `mindville-db-dev`, banco dedicado `b2b_sales_machine_dev` |
| `.env` local | **obrigatório** — veja a tabela abaixo; nunca versionado |

Variáveis do `.env` (mesmos nomes do `.env.example`):

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | credencial da aplicação (`b2bsm_app`, restrita) |
| `DATABASE_MIGRATION_URL` | credencial owner — migrations/bootstrap/reset |
| `APP_DB_PASSWORD` | senha do papel `b2bsm_app` (bootstrap) |
| `SESSION_SECRET` | HMAC do CSRF derivável |
| `APP_ORIGIN` | `http://localhost:3000` |
| `SEED_USERS` | JSON com os usuários de dev (`dev1`/`dev2@b2bsm.local`) — **as senhas vivem só aqui** |
| `AI_PROVIDER` | `fixture` (determinístico, sem chave/rede) |

Sem `.env`, as suítes de banco pulam de forma **visível** (`describeIfDb`) e o
login dos testes falha com "SEED_USERS ausente" — se vir isso, o `.env` não carregou.

## 2. Setup inicial (uma vez por checkout)

```bash
pnpm install            # instala e roda prisma generate (postinstall)
pnpm db:setup           # papéis → migrations → seed demo (idempotente)
```

`db:setup` é seguro de repetir: o seed detecta a demo já carregada e é no-op.
Ele **nunca** roda reset destrutivo no boot do servidor.

## 3. Subir a plataforma

```bash
pnpm dev                # http://localhost:3000
```

Sanidade em outro terminal:

```bash
curl http://localhost:3000/api/v1/health   # 200 + {"data":{"status":"ok",...}}
```

Login: um dos usuários do `SEED_USERS` (ex.: `dev1@b2bsm.local`). A base
**Allya — demonstração fictícia** já vem carregada (120 empresas, 287 sinais).

Ao terminar, encerre o processo **pelo dono da porta** e confirme que liberou:

```bash
netstat -ano | grep ":3000" | grep LISTENING   # anota o PID
taskkill //F //PID <PID>
curl -s -m 2 http://localhost:3000/api/v1/health || echo "porta liberada"
```

## 4. Suítes de verificação

| Comando | O que cobre | Duração aprox. |
|---|---|---|
| `pnpm typecheck && pnpm lint` | estáticos | segundos |
| `pnpm test` | **151 testes** de domínio + contrato contra o RDS real (motor 52/52, auth, CRUD/409, imports, regras, IA/revisão/métricas) | ~30–60 s |
| `pnpm build` | build de produção | ~30 s |
| `pnpm e2e` | **5 testes / 4 jornadas** no navegador (Playwright + Chromium) | ~1,5 min |
| `pnpm test:all` | tudo acima em sequência — o gate completo | ~3–4 min |

### ⚠️ O e2e RESETA a demo (de propósito)

O `globalSetup` roda `db:reset-demo` **antes** e o `globalTeardown` **depois**
de cada execução da suíte — as jornadas 3 e 4 mutam a demo (importam sinal,
publicam regra, aceitam sugestão). Consequências:

- Dados editados à mão na demo **somem** ao rodar `pnpm e2e`. Para experimentar
  sem medo, crie uma base nova em "Nova base" — o reset só toca a demo.
- Rodar `pnpm e2e` seguido de `pnpm test` é a ordem correta (o teardown devolve
  a demo pristine; o vitest confia nos goldens 56/37/27).

### CI (GitHub Actions)

Os mesmos três jobs (`verify`, `db-tests` com Postgres efêmero, `app-present`)
rodam em todo PR. O job `db-tests` tem um **guard de skip honesto**: todo
arquivo que usa `describeIfDb` precisa estar na lista `EXPECTED` do
`.github/workflows/pr-gate.yml` — arquivo novo fora da lista reprova o job.

## 5. Roteiro manual da demo (doc 09 §4, navegável)

1. Login → base **Allya — demonstração fictícia** (badge "Dados fictícios").
2. **Ranking**: 56 contas dentro do ICP; expanda a linha 1 — gate (aderência
   60–100, corte) e prioridade S01–S10 **separados**; exporte o CSV do snapshot.
3. **Empresas** → filtro ICP **Pendente** → abra uma conta: veja "não informado"
   ≠ incompatibilidade (D02, por ex.) e por que ela não pontua.
4. Abra uma conta **dentro**: edite um campo (ex.: RH estruturado), salve —
   versão e score recalculam na hora.
5. **Conflito real**: mesma conta em duas janelas (dev1 e dev2); um salva, o
   outro recebe 409 honesto com rascunho preservado; o Histórico mostra o
   antes/depois com autor.
6. **IA e revisão** (conta pendente): "Iniciar validação" → "Analisar lacunas
   do ICP" → sugestões com **trecho literal** da evidência → Aceitar aplica o
   campo (auditoria `ai_acceptance`) e recalcula; rejeitar/adiar não muta nada.
7. **Importar CSV** (área Empresas): modelo em `templates/signals.csv` → prévia
   com contagens → confirmar → sinal aparece no detalhe da empresa.
8. **Regras**: rascunho (cópia da ativa) → mude o corte → publicar → o ranking
   fica obsoleto (`is_stale`) → "Atualizar ranking" recomputa.
9. **Métricas**: sessões válidas, tempo médio/mediano, taxa de aceitação com
   denominador — o instrumento da hipótese 22min → <8min.

## 6. Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| `EADDRINUSE :3000` | dev server anterior vivo | mate pelo PID (seção 3) |
| Login 429 após tentativas | rate limit real (5/15min por e-mail+IP) | aguarde a janela ou limpe `login_attempts` |
| Golden 56/37/27 falhando no `pnpm test` | demo mutada fora do e2e | `pnpm db:reset-demo` |
| Testes de banco todos pulados | `.env` ausente/não carregado | confira `SEED_USERS`/`DATABASE_URL` |
| Timeout conectando ao banco | security group/rede do RDS | confira acesso a `mindville-db-dev:5432` |
| Prisma `P1001` | credencial/papel | rode `pnpm db:setup` (bootstrap de papéis) |
| CI `db-tests` vermelho no guard | arquivo novo com `describeIfDb` fora da lista | adicione ao `EXPECTED` do `pr-gate.yml` |

## 7. Reset cirúrgico da demo

```bash
pnpm db:reset-demo       # remove e recria APENAS o dataset demo (credencial owner)
```

Não roda no boot do servidor, não toca bases criadas por usuários — é o mesmo
comando que o e2e usa nos dois extremos da suíte.
