# Runbook — Deploy do protótipo `ita-challenge.autarke.ia.br`

Runbook **operacional** do protótipo B2B Sales Machine. Cobre o **deploy de uma nova
versão**, o **rollback** e a **verificação**. Para o *setup inicial*
(AWS/OIDC/IAM/Secrets Manager/DNS/TLS) e os *gotchas*, ver
**[`deploy/README.md`](../../deploy/README.md)**.

> **Divisão de donos:** este runbook é a operação recorrente. O `deploy/README.md` é a
> referência de arquitetura, dos artefatos em `deploy/` e do setup de uma-vez.
>
> **Segredo vem do AWS Secrets Manager, nunca de `.env`** (`secrets-config`). O
> container herda a role da EC2 e lê o secret `b2b-sales-machine/prod` no boot.

---

## TL;DR (deploy de nova versão)

**Método padrão — pin por digest, igual aos irmãos.** Copie o digest da imagem (UI do
ECR ou CLI) e rode o script na caixa:

```bash
# na caixa, via SSM:
sudo AWS_REGION=sa-east-1 IMAGE_DIGEST=sha256:<digest> bash scripts/deploy-ec2.sh
```

O script faz: re-login no ECR → `sed` do digest na linha `image:` do compose →
`docker compose up -d --pull always` → verifica `curl 127.0.0.1:3001/api/v1/health`.

O `app-ecr` **não** faz deploy — só publica a imagem. O deploy na caixa é sempre
manual (pin por digest), igual ao backend Mindville.

---

## Topologia (estado real — 2026-10-03)

| Item | Valor |
|---|---|
| Conta AWS | `131464424960` · região `sa-east-1` |
| Instância EC2 | `i-0f1ec133bb46a870d` · IP **dinâmico** `18.231.141.59` |
| Repo ECR | `b2b-sales-machine` (pin por **digest**) |
| Compose (caixa) | `/opt/mindville/docker-compose.b2b-sales-machine.prod.yml` · project `b2b-sales-machine` |
| Container | `b2b_sales_machine` · `127.0.0.1:3001->3000` |
| Secret (runtime) | `b2b-sales-machine/prod` (SM) → `DATABASE_URL`, `SESSION_SECRET` |
| nginx do host | `/etc/nginx/sites-available/ita-challenge.autarke.ia.br` → `proxy_pass 127.0.0.1:3001` |
| Domínio | `https://ita-challenge.autarke.ia.br` (TLS Let's Encrypt) |
| Banco | RDS `mindville-db-dev` · `b2b_sales_machine_dev` |

```
push main / tag v*  ─▶  GitHub Actions (app-ecr.yml)  ─▶  ECR: b2b-sales-machine:sha-<sha>
                                                                 │  (pull por DIGEST)
                                 [ EC2 i-0f1ec133bb46a870d ]  ◀──┘
                                  docker: b2b_sales_machine (:3001)
                                    │ boot lê segredo do Secrets Manager (role da EC2)
                                    ▼
                              nginx host :443 (certbot)  ──▶  https://ita-challenge.autarke.ia.br
```

---

## Deploy de nova versão (passo a passo)

### 1. Confirmar a imagem no ECR

Todo push na `main` (ou tag `v*`) dispara o `app-ecr.yml`, que builda e empurra
`b2b-sales-machine:sha-<commit-sha>`. Confirme (de uma máquina com AWS admin):

```bash
aws ecr describe-images --repository-name b2b-sales-machine --region sa-east-1 \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[].{tags:imageTags,pushed:imagePushedAt,digest:imageDigest}' \
  --output table | head -20
```

Anote o **`imageDigest`** (`sha256:...`) alvo — ou copie da **UI do ECR**. Sempre
deploy por digest (a tag `sha-<sha>` é única por commit, mas o pin canônico é o digest).

### 2. Deploy na caixa (via SSM)

```bash
sudo AWS_REGION=sa-east-1 IMAGE_DIGEST=sha256:<digest> bash scripts/deploy-ec2.sh
```

> ⚠️ **Cole comandos multi-linha com cuidado no SSM** — um comentário `# ...` no fim de
> uma linha pode "engolir" o comando seguinte se colarem juntos. Na dúvida, um por vez.

Se preferir manual: edite a linha `image:` (só o que vem depois de `@sha256:`) em
`/opt/mindville/docker-compose.b2b-sales-machine.prod.yml` e rode
`sudo docker compose -f <arquivo> up -d --pull always`.

### 3. Verificação (de fora)

```bash
# HTTPS + validação de cert:
curl -sS --resolve ita-challenge.autarke.ia.br:443:18.231.141.59 \
  -o /dev/null -w "HTTPS %{http_code} | TLS %{ssl_verify_result} (0=OK)\n" \
  https://ita-challenge.autarke.ia.br/api/v1/health
# espera: HTTPS 200 | TLS 0 (0=OK)

# redirect 80 -> 443:
curl -sSI --resolve ita-challenge.autarke.ia.br:80:18.231.141.59 \
  http://ita-challenge.autarke.ia.br/ | grep -iE '^HTTP|^location'
```

No navegador: login com um `SEED_USERS` → cookie `allya_session` com `Secure` → base
demo (120 empresas) → ranking 56 → exportar CSV.

---

## Rollback

Reaponte pro digest anterior e suba de novo — ~30s:

```bash
sudo AWS_REGION=sa-east-1 IMAGE_DIGEST=sha256:<digest-anterior> bash scripts/deploy-ec2.sh
```

O digest anterior está no histórico do ECR (passo 1) ou na linha `image:` do compose
**antes** da troca.

---

## Banco — migrations (da sua máquina, nunca do servidor)

**Demo Day (padrão):** o banco é o `b2b_sales_machine_dev` do RDS compartilhado, já
semeado. Migration nova roda **do seu notebook** com a credencial de **owner** (que
nunca vai para o EC2 nem para o SM de runtime):

```bash
DATABASE_URL=<owner> pnpm exec prisma migrate deploy
```

**Banco prod separado** (quando houver uso real): crie `b2b_sales_machine_prod` na
mesma instância e, do notebook (NÃO rode `db:setup`/bootstrap — o papel `b2bsm_app` é
compartilhado e o bootstrap faria `ALTER ROLE ... PASSWORD`, trocando a senha do dev):

```bash
DATABASE_URL=<owner-do-prod> pnpm exec prisma migrate deploy
DATABASE_URL=<app-do-prod>  pnpm db:seed
```

Depois, aponte o `DATABASE_URL` do secret `b2b-sales-machine/prod` para o banco novo
(`put-secret-value`) e reinicie o container.

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `docker pull` → `403 Forbidden` | Pull do ECR não escopado a `b2b-sales-machine` | Confirmar a policy `ecr-pull-b2b` na `EC2-SecretsManager-Role` (`deploy/README.md` §3) |
| `Could not assume role with OIDC` no CI | `sub` da org tem IDs imutáveis | `deploy/README.md` §"Gotcha OIDC" — a trust casa `repo:autarke-ia@310814087/b2b-sales-machine@1402425093:*` |
| Container reinicia / log "Secrets Manager: falha ao buscar" | Role sem leitura do secret, ou IMDS hop-limit 1 | `deploy/README.md` §Secrets Manager + §Gotcha IMDS |
| Container "Secrets Manager: sem as chaves obrigatórias" | Secret sem `DATABASE_URL`/`SESSION_SECRET` | Conferir o JSON: `aws secretsmanager get-secret-value --secret-id b2b-sales-machine/prod` |
| `Found orphan containers (mindville_*)` | project name compartilhado | O compose tem `name: b2b-sales-machine`; se reaparecer, confirmar essa linha |
| Cookie sem `Secure` no login | `APP_ORIGIN` não é https | Conferir `APP_ORIGIN=https://...` no compose e reiniciar |
| Login não bloqueia por IP | `TRUSTED_PROXY_DEPTH` ausente | Deve ser `"1"` no compose (um nginx na frente) |
| DNS não resolve | registro A / propagação | `dig +short ita-challenge.autarke.ia.br` = `18.231.141.59` |

---

## Limites declarados

- O deploy usa o **banco dev** da instância compartilhada até existir o prod separado.
- A credencial do container (DML, sem DDL) edita valores; a autoria na trilha é do servidor.
- `AI_PROVIDER=fixture`: interpretador determinístico, sem chave — trocar por provedor
  real é evolução (o adaptador openai-compatible é stub).
- `18.231.141.59` é IP **dinâmico** (não EIP): muda em stop/start e derruba DNS+TLS.
