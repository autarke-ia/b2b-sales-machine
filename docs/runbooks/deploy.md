# Runbook — Deploy do protótipo (`ita-challenge.autarke.ia.br`)

EC2 (Ubuntu) + Docker Compose + ECR → nginx faz proxy de
`https://ita-challenge.autarke.ia.br` → `127.0.0.1:3001`. **Segredo vem do AWS
Secrets Manager** (nunca `.env` no host) — o container herda a role da instância e
busca `DATABASE_URL`/`SESSION_SECRET` no boot. Setup completo e porquês em
**[`deploy/README.md`](../../deploy/README.md)**.

## Quick reference

| Item | Valor |
|---|---|
| Compose | `/opt/mindville/docker-compose.b2b-sales-machine.prod.yml` |
| Container | `b2b_sales_machine` |
| Imagem (ECR) | `131464424960.dkr.ecr.sa-east-1.amazonaws.com/b2b-sales-machine` |
| Secret (SM) | `autarkeia/b2b-sales-machine/dev` → `DATABASE_URL`, `SESSION_SECRET` |
| Health (local) | `curl -sS http://127.0.0.1:3001/api/v1/health` |
| Health (HTTPS) | `curl -i https://ita-challenge.autarke.ia.br/api/v1/health` |
| Logs | `sudo docker logs --since 10m b2b_sales_machine` |

---

## 🍰 Deploy de nova versão (a receita)

### 1) Merge do PR na `main` → espere o `app-ecr` ficar verde

O push na `main` builda e empurra a imagem pro ECR automaticamente (tag
`sha-<commit>` + `vX.Y.Z` em release). Confira verde em **Actions → app-ecr**.

### 2) Na caixa (SSM): login no ECR + suba a imagem nova

Copie o **digest** da imagem nova (console do ECR → repo `b2b-sales-machine` →
coluna *Image URI* / *Digest*). Pin por **digest** (não tag flutuante), igual aos
irmãos. Cole **um comando por vez** no SSM.

```bash
DIGEST=sha256:<cole-o-digest-do-ECR>

sudo aws ecr get-login-password --region sa-east-1 \
  | sudo docker login --username AWS --password-stdin \
    131464424960.dkr.ecr.sa-east-1.amazonaws.com

sudo sed -i -E "s|(image:\s*).*|\1131464424960.dkr.ecr.sa-east-1.amazonaws.com/b2b-sales-machine@${DIGEST}|" \
  /opt/mindville/docker-compose.b2b-sales-machine.prod.yml

sudo docker compose -f /opt/mindville/docker-compose.b2b-sales-machine.prod.yml up -d --pull always
```

### 3) Verifique

```bash
curl -sS -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:3001/api/v1/health   # 200
```

Pronto. Migrations só quando mudou algo em `prisma/migrations/` (ver §Migrations).

> **Rollback:** repita o passo 2 com o `DIGEST` anterior. ~30s.
>
> **Sem espaço em disco** (`no space left`): `sudo docker image prune -f` e repita o
> `up -d --pull always` (atualizar só o compose não recria o container).

---

## Primeira vez (setup — uma vez só)

Faça na ordem. Detalhe e comandos AWS em **[`deploy/README.md`](../../deploy/README.md)**.

### A) Criar o secret no Secrets Manager (pela UI)

Console → **Secrets Manager** → *Store a new secret* (região **sa-east-1**):

1. **Secret type:** *Other type of secret*.
2. Aba **Plaintext**, cole o JSON (só estas duas chaves):
   ```json
   {
     "DATABASE_URL": "postgresql://b2bsm_app:<SENHA-DO-APP>@mindville-db-dev.cjawcuqkc3br.sa-east-1.rds.amazonaws.com:5432/b2b_sales_machine_dev",
     "SESSION_SECRET": "<gere: openssl rand -base64 48>"
   }
   ```
   - `DATABASE_URL`: credencial do papel de **app** (`b2bsm_app`), a mesma do seu
     `.env` local. **Não** use a credencial de owner aqui.
   - `SESSION_SECRET`: gere um **novo** e forte; não reutilize o de dev.
3. **Encryption key:** `aws/secretsmanager` (default).
4. **Secret name:** `autarkeia/b2b-sales-machine/dev`. Rotation: desligada.

> `APP_ORIGIN`, `TRUSTED_PROXY_DEPTH`, `AI_PROVIDER` **não** são segredo — já vão no
> compose. Rotacionar depois: *Retrieve/Edit secret value* na UI + reiniciar o
> container.

### B) Dar à caixa permissão de ler o secret + puxar a imagem

Uma vez, no CloudShell (admin) — JSONs versionados em `deploy/aws/`:

```bash
aws iam put-role-policy --role-name EC2-SecretsManager-Role \
  --policy-name secrets-read-b2b --policy-document file://deploy/aws/secrets-read-policy.json
aws iam put-role-policy --role-name EC2-SecretsManager-Role \
  --policy-name ecr-pull-b2b --policy-document file://deploy/aws/ecr-pull-policy.json
```

### C) IMDS hop-limit = 2 (container em bridge + IMDSv2)

```bash
aws ec2 describe-instance-metadata-options --instance-id i-0f1ec133bb46a870d \
  --region sa-east-1 --query 'InstanceMetadataOptions.HttpPutResponseHopLimit'
# se for 1: (afeta a caixa toda — benigno)
aws ec2 modify-instance-metadata-options --instance-id i-0f1ec133bb46a870d \
  --region sa-east-1 --http-tokens required --http-put-response-hop-limit 2
```

### D) Compose + nginx + TLS (na caixa)

```bash
# compose (cópia do versionado):
curl -fsSL https://raw.githubusercontent.com/autarke-ia/b2b-sales-machine/main/deploy/compose/b2b-sales-machine.prod.yml \
  | sudo tee /opt/mindville/docker-compose.b2b-sales-machine.prod.yml >/dev/null

# nginx:
curl -fsSL https://raw.githubusercontent.com/autarke-ia/b2b-sales-machine/main/deploy/nginx/ita-challenge.autarke.ia.br.conf \
  | sudo tee /etc/nginx/sites-available/ita-challenge.autarke.ia.br >/dev/null
sudo ln -s /etc/nginx/sites-available/ita-challenge.autarke.ia.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# DNS já aponta (A ita-challenge → 18.231.141.59). TLS:
sudo certbot --nginx -d ita-challenge.autarke.ia.br
```

### E) Primeiro deploy

Rode a **receita** (§Deploy de nova versão) com o `DIGEST` da imagem já publicada.

---

## Migrations (só quando `prisma/migrations/` mudou)

O banco é o `b2b_sales_machine_dev` do RDS compartilhado (Demo Day). Rode **do seu
notebook** com a credencial de **owner** (que nunca vai pro EC2 nem pro SM):

```bash
DATABASE_URL=<owner> pnpm exec prisma migrate deploy
```

Banco prod separado: ver `deploy/README.md §7`.

---

## Troubleshooting

| Sintoma | Causa | Ação |
|---|---|---|
| `docker pull` → `403` | pull do ECR não escopado ao b2b | policy `ecr-pull-b2b` na role (setup B) |
| log `Secrets Manager: falha ao buscar` | role sem leitura do secret, ou IMDS hop-limit 1 | setup B + C |
| log `sem as chaves obrigatórias` | secret sem `DATABASE_URL`/`SESSION_SECRET` | conferir o JSON do secret (UI) |
| cookie sem `Secure` | `APP_ORIGIN` não é https | compose: `APP_ORIGIN=https://...` + restart |
| `Found orphan containers (mindville_*)` | project name | o compose tem `name: b2b-sales-machine`; confirmar |
| `Could not assume role with OIDC` no CI | `sub` da org com IDs | `deploy/README.md` §"Gotcha OIDC" |
| DNS não resolve | registro A / propagação | `dig +short ita-challenge.autarke.ia.br` = `18.231.141.59` |

## Limites declarados

- Usa o **banco dev** compartilhado até existir um prod separado.
- `AI_PROVIDER=fixture` (determinístico, sem chave) — provedor real é evolução.
- `18.231.141.59` é IP **dinâmico** (não EIP): muda em stop/start e derruba DNS+TLS.
