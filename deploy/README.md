# Deploy — B2B Sales Machine (GitHub Actions → ECR → EC2, padrão Autarkeia/Mindville)

Referência de **arquitetura** e **setup de uma-vez** do deploy do protótipo. Replica o
pipeline dos irmãos (`autarkeia-website`, backend Mindville): **o GitHub Actions builda
a imagem via OIDC e empurra pro ECR; o EC2 puxa por digest e roda o container; o nginx
do host faz reverse proxy + TLS.**

> **Só quer publicar uma nova versão?** Vá ao runbook operacional:
> **[`docs/runbooks/deploy.md`](../docs/runbooks/deploy.md)**. Este arquivo é a
> referência de arquitetura, dos artefatos em `deploy/` e do setup inicial.

## Divergências deliberadas do `autarkeia-website`

| | autarkeia-website | b2b-sales-machine |
|---|---|---|
| Interior do container | nginx servindo `out/` estático | **servidor Next (`next start`, :3000)** |
| Segredo em runtime | nenhum | **sim** → **AWS Secrets Manager** (nunca `.env`) |
| Banco | nenhum | PostgreSQL (RDS `mindville-db-dev`) |
| Porta no host | 8081 | **3001** |
| Pipeline (OIDC→ECR, release-please, pr-gate) | — | **idêntico** |

A paridade é no **pipeline e na operação**, não no interior do container.

## Topologia (estado real — 2026-10-03)

| Item | Valor |
|---|---|
| Conta AWS | `131464424960` · região `sa-east-1` |
| Instância EC2 | `i-0f1ec133bb46a870d` · IP **dinâmico** `18.231.141.59` (mesma caixa dos irmãos) |
| Repo ECR | `b2b-sales-machine` (imagem pinada por **digest**) |
| Role OIDC (push no CI) | `b2b-sales-machine-github-oidc-ecr` |
| Pull do ECR (na caixa) | role `EC2-SecretsManager-Role` + policy inline `ecr-pull-b2b` |
| Secret (runtime) | `b2b-sales-machine/prod` (SM) → `DATABASE_URL`, `SESSION_SECRET` |
| Leitura do secret | role `EC2-SecretsManager-Role` + policy `secretsmanager:GetSecretValue` escopada |
| Compose (caixa) | `/opt/mindville/docker-compose.b2b-sales-machine.prod.yml` · project `b2b-sales-machine` |
| Container | `b2b_sales_machine` · `127.0.0.1:3001->3000` |
| nginx do host | `/etc/nginx/sites-available/ita-challenge.autarke.ia.br` → `proxy_pass 127.0.0.1:3001` |
| Domínio | `ita-challenge.autarke.ia.br` (A no Registro.br → `18.231.141.59`) |
| TLS | Let's Encrypt (certbot) |

```
push main / tag v*  ─▶  GitHub Actions (app-ecr.yml)
                          OIDC → ECR (sa-east-1)  imagem: b2b-sales-machine:sha-<sha>
                                                          │
                        [ EC2 18.231.141.59 ]  ◀──── pull por DIGEST (deploy-ec2.sh)
                         docker: b2b_sales_machine (next start :3000)
                              │  127.0.0.1:3001         │ boot: lê segredo do
                              ▼                          ▼ Secrets Manager (role da EC2)
                         nginx do HOST :443 (certbot)  ──▶  https://ita-challenge.autarke.ia.br
```

---

## Secrets Manager — por que, e como funciona

Política do dono (`secrets-config`): **segredo vem do AWS Secrets Manager, nunca de
`.env` de host**. O container **não** recebe segredo por env nem por arquivo — ele
herda a **role da instância** (`EC2-SecretsManager-Role`) e, no boot, o loader
(`instrumentation.ts` → `src/server/config/secrets.ts`) chama `GetSecretValue`,
hidrata `process.env.DATABASE_URL`/`SESSION_SECRET` (SM **autoritativo**) e **falha
fechado** se o SM não responder ou faltar chave. Em dev local, `AWS_SECRET_NAME` fica
ausente → o loader no-opa e o `.env` local continua valendo.

O compose passa só **bootstrap não-secreto**: `AWS_REGION`, `AWS_SECRET_NAME`,
`APP_ORIGIN`, `TRUSTED_PROXY_DEPTH`, `AI_PROVIDER`.

### ⚠️ Gotcha IMDS — container precisa de hop-limit 2

A instância está com **IMDSv2 Required**. Um container em rede bridge só alcança o
endpoint de metadados (e, portanto, a role da instância) se o
`--http-put-response-hop-limit` for **≥ 2**. Confirme antes do primeiro boot:

```bash
aws ec2 describe-instance-metadata-options --instance-id i-0f1ec133bb46a870d \
  --region sa-east-1 --query 'InstanceMetadataOptions.HttpPutResponseHopLimit'
# se for 1, suba para 2 (afeta a caixa toda — mudança benigna):
aws ec2 modify-instance-metadata-options --instance-id i-0f1ec133bb46a870d \
  --region sa-east-1 --http-tokens required --http-put-response-hop-limit 2
```

Se os containers do Mindville já puxam segredo do SM, o hop-limit já está em 2.

---

## Setup inicial (uma vez)

### 1. AWS — ECR + role OIDC dedicada  *(precisa `aws sso login`)*

Cada repo tem recursos próprios (as roles OIDC da conta são **por-repo**). Na mesma
conta `131464424960`, reusando o GitHub OIDC provider já existente:

```bash
# 1a. Repositório ECR
aws ecr create-repository --repository-name b2b-sales-machine \
  --region sa-east-1 --image-tag-mutability IMMUTABLE

# 1b. Role OIDC — trust p/ o repo autarke-ia/b2b-sales-machine
aws iam create-role --role-name b2b-sales-machine-github-oidc-ecr \
  --assume-role-policy-document file://deploy/aws/oidc-trust-policy.json
aws iam put-role-policy --role-name b2b-sales-machine-github-oidc-ecr \
  --policy-name ecr-push --policy-document file://deploy/aws/ecr-push-policy.json
```

> **Gotcha OIDC — o `sub` da org `autarke-ia` traz IDs imutáveis.** A org tem a
> customização de OIDC ligada, então o `sub` do token **não** é o padrão
> `repo:org/repo:...` — inclui os IDs numéricos da org e do repo:
> `repo:autarke-ia@310814087/b2b-sales-machine@1402425093:...`. Por isso a
> trust-policy (`deploy/aws/oidc-trust-policy.json`) casa esse formato com `@id`, e
> **não** `repo:autarke-ia/b2b-sales-machine:*` (que dá `Not authorized to perform
> sts:AssumeRoleWithWebIdentity`). O `repo_id` sai de
> `gh api repos/autarke-ia/b2b-sales-machine --jq .id`.

### 2. GitHub — variável do repo

```bash
gh variable set AWS_ROLE_TO_ASSUME \
  --repo autarke-ia/b2b-sales-machine \
  --body arn:aws:iam::131464424960:role/b2b-sales-machine-github-oidc-ecr
```

A partir daqui, `workflow_dispatch` no *app-ecr* ou o merge de um release PR publica a
imagem. Sem a variável, o job `build_and_push` aparece como **skipped**.

### 3. EC2 — pull do ECR escopado ao b2b

A `EC2-SecretsManager-Role` puxa os repos dos irmãos, mas não o `b2b-sales-machine`.
Policy própria (inline), escopada só ao nosso repo (`docker login` funciona pelo
`GetAuthorizationToken: *`, mas o `docker pull` precisa do pull escopado):

```bash
aws iam put-role-policy --role-name EC2-SecretsManager-Role \
  --policy-name ecr-pull-b2b --policy-document file://deploy/aws/ecr-pull-policy.json
```

### 4. AWS — criar o secret + permissão de leitura

```bash
# 4a. Gere um SESSION_SECRET novo e forte (NÃO reutilize o de dev):
openssl rand -base64 48

# 4b. Crie o secret (JSON). A DATABASE_URL é a do papel de APP (b2bsm_app), não a
#     de owner. Passe os valores por arquivo temporário fora do histórico, ou via
#     --secret-string com cuidado para não vazar no shell history.
aws secretsmanager create-secret --name b2b-sales-machine/prod --region sa-east-1 \
  --secret-string '{"DATABASE_URL":"postgresql://b2bsm_app:<senha>@mindville-db-dev.cjawcuqkc3br.sa-east-1.rds.amazonaws.com:5432/b2b_sales_machine_dev","SESSION_SECRET":"<openssl-acima>"}'

# 4c. Deixe a role da EC2 ler ESTE secret (escopado):
aws iam put-role-policy --role-name EC2-SecretsManager-Role \
  --policy-name secrets-read-b2b --policy-document file://deploy/aws/secrets-read-policy.json
```

> Rotação: `aws secretsmanager put-secret-value --secret-id b2b-sales-machine/prod
> --secret-string '{...}'` e reinicie o container. Trocar a senha do banco é rotação
> **na origem** (par de `rotate-means-revoke-at-provider`).

### 5. EC2 — compose + nginx + DNS + TLS

```bash
# compose
sudo cp deploy/compose/b2b-sales-machine.prod.yml \
        /opt/mindville/docker-compose.b2b-sales-machine.prod.yml
# confirme a porta 3001 livre (3000/3080/4000/8081 já ocupadas):
sudo ss -ltnp | grep -E ':3001' || echo "3001 livre"

# nginx
sudo cp deploy/nginx/ita-challenge.autarke.ia.br.conf \
        /etc/nginx/sites-available/ita-challenge.autarke.ia.br
sudo ln -s /etc/nginx/sites-available/ita-challenge.autarke.ia.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# DNS (Registro.br): A  ita-challenge  →  18.231.141.59   (TTL 300)
dig +short ita-challenge.autarke.ia.br   # deve retornar 18.231.141.59

# TLS (só depois do dig resolver — certbot valida via HTTP-01):
sudo certbot --nginx -d ita-challenge.autarke.ia.br
```

### 6. Primeiro deploy

Depois que o `app-ecr` rodar (merge na main ou dispatch) e o secret existir:

```bash
# pegue o digest (de uma máquina com AWS admin):
aws ecr describe-images --repository-name b2b-sales-machine --region sa-east-1 \
  --image-ids imageTag=sha-<commit-sha> --query 'imageDetails[0].imageDigest' --output text

# na caixa, via SSM:
sudo AWS_REGION=sa-east-1 IMAGE_DIGEST=sha256:<digest> bash scripts/deploy-ec2.sh
```

### 7. Banco — migrations (da sua máquina, nunca do servidor)

O banco é o `b2b_sales_machine_dev` do RDS compartilhado (Demo Day). As migrations
rodam **do seu notebook** com a credencial de **owner** (que nunca vai para o EC2 nem
para o SM de runtime):

```bash
DATABASE_URL=<owner> pnpm exec prisma migrate deploy
```

Para um banco prod separado (`b2b_sales_machine_prod`), ver §2 do runbook operacional.

---

## Status e pendências

- **IP dinâmico** `18.231.141.59` (não é Elastic IP): muda em stop/start e derruba
  DNS+TLS de todos os domínios da caixa. Endurecer com EIP é coordenado (toca a
  produção do Mindville).
- Checar o **hop-limit do IMDS** (§Gotcha IMDS) antes do primeiro boot do container.
