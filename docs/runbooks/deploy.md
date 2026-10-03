# Runbook — Deploy do protótipo (GitHub Actions → ECR → EC2 + nginx)

> Pipeline idêntico ao dos irmãos Autarkeia/Mindville: **CI builda a imagem via
> OIDC e empurra pro ECR; o EC2 puxa por digest e roda o container; o nginx do
> host faz reverse proxy + TLS.** A paridade é no pipeline e na operação — o
> interior do container é o nosso (`next start`, não export estático).
> Decisão de arquitetura de deploy: co-hospedado no mesmo EC2/RDS dos irmãos.

## 0. O que já está pronto no repo

- `Dockerfile` + `.dockerignore` (node:20-slim, `pnpm start`, :3000, sem segredos na imagem)
- `app-ecr.yml` (OIDC → ECR → buildx, tags `sha-<sha>` + `vX.Y.Z` em push de tag) — **aguardando `vars.AWS_ROLE_TO_ASSUME`**
- release-please já cuta tags (`v0.2.1`) — o merge do release PR dispara a imagem automaticamente
- healthcheck público: `GET /api/v1/health`

## 1. AWS — uma vez

1. **ECR**: crie o repositório `b2b-sales-machine` em `sa-east-1`.
2. **IAM OIDC**: provider OIDC do GitHub Actions (org `autarke-ia`) + role com
   push no ECR acima, trust limitada a `autarke-ia/b2b-sales-machine` (a mesma
   role do website serve se a trust incluir este repo — prefira role própria).
3. **GitHub**: Settings → Secrets and variables → Variables → `AWS_ROLE_TO_ASSUME` = ARN da role.
   A partir daqui, `workflow_dispatch` no *app-ecr* ou o merge de um release PR publica a imagem.
4. **EC2**: a mesma caixa dos irmãos. Security group: `443` aberto, `22` restrito,
   **3000/3001 NÃO públicos** (o container publica só em `127.0.0.1:3001`).
5. **RDS**: o SG do `mindville-db-dev` já libera 5432 para o SG do EC2 (mesmo
   modelo dos irmãos — conferir se esta caixa já acessa; se não, adicionar regra).

## 2. Banco — decisão

**Opção A — Demo Day (recomendada p/ estrear):** usar o banco dev existente
`b2b_sales_machine_dev`. Zero passo adicional; a demo já está semeada.

**Opção B — banco prod separado** (quando houver uso real): crie o database
`b2b_sales_machine_prod` na mesma instância e, **do seu notebook** (credenciais
de owner NÃO vão para o EC2):

```bash
# .env apontando para o prod — ATENÇÃO: NÃO rode db:setup nem bootstrap aqui:
# o papel b2bsm_app é compartilhado pela instância e o bootstrap faria ALTER
# ROLE ... PASSWORD, trocando a senha que o dev usa. Rode apenas:
DATABASE_URL=<owner-do-prod> pnpm exec prisma migrate deploy
DATABASE_URL=<app-do-prod>  pnpm db:seed
```

Migrations ficam sempre na sua máquina (ou CI), nunca no servidor.

## 3. EC2 — preparo da caixa (uma vez)

```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
# docker já presente na caixa dos irmãos; aws CLI com instance profile
# AmazonEC2ContainerRegistryReadOnly (pull sem chaves estáticas)
sudo mkdir -p /opt/b2bsm && sudo chown $USER /opt/b2bsm
```

`/opt/b2bsm/.env` — **só o que o runtime precisa** (sem owner/migrations):

```env
DATABASE_URL=postgresql://b2bsm_app:<senha>@mindville-db-dev...:5432/b2b_sales_machine_dev
SESSION_SECRET=<segredo forte e novo>
APP_ORIGIN=https://<seu-domínio>
TRUSTED_PROXY_DEPTH=1
AI_PROVIDER=fixture
SEED_USERS=[{"email":"<pessoa1>@...","name":"...","password":"<forte>"},{"email":"<pessoa2>@...","name":"...","password":"<forte>"}]
```

> `APP_ORIGIN` com **https** é o que liga o flag `Secure` do cookie e valida o
> Origin das mutações — defina o domínio final ANTES do primeiro login.
> `TRUSTED_PROXY_DEPTH=1` faz o rate limit de login enxergar o cliente real
> (o app lê o ÚLTIMO hop do XFF — o que o nosso nginx acrescenta).

## 4. Rodar o container

```bash
cd /opt/b2bsm
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.sa-east-1.amazonaws.com
docker pull <account>.dkr.ecr.sa-east-1.amazonaws.com/b2b-sales-machine:v0.2.1   # ou sha-<sha>
docker run -d --name b2bsm --restart unless-stopped \
  --env-file /opt/b2bsm/.env \
  -p 127.0.0.1:3001:3000 \
  <imagem>:<tag>
docker logs -f b2bsm   # aguardar pronto
```

## 5. nginx + TLS

```bash
sudo cp deploy/nginx/b2bsm.conf.example /etc/nginx/sites-available/<seu-domínio>
sudo sed -i 's/<seu-domínio>/allya.exemplo.com.br/g' ...   # ou edite à mão
sudo ln -s /etc/nginx/sites-available/<seu-domínio> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# DNS apontando p/ o EC2; depois:
sudo certbot --nginx -d <seu-domínio>
```

O `conf.example` versionado já traz: `client_max_body_size 12m` (uploads CSV),
headers de proxy (XFF/X-Forwarded-Proto) e `proxy_read_timeout 120s`.

## 6. Deploy de nova versão (rotina)

```bash
# 1) merge do release PR (release-please) → tag vX.Y.Z → CI publica a imagem
# 2) no EC2:
cd /opt/b2bsm
docker pull ...:vX.Y.Z
docker stop b2bsm && docker rm b2bsm
docker run -d --name b2bsm --restart unless-stopped --env-file .env -p 127.0.0.1:3001:3000 ...:vX.Y.Z
# 3) migrations novas? rode ANTES do restart, do notebook:
#    DATABASE_URL=<owner> pnpm exec prisma migrate deploy
```

**Rollback**: `docker run` com a tag/digest anterior (anote o digest antes de atualizar).

## 7. Smoke pós-deploy

```bash
curl https://<seu-domínio>/api/v1/health        # 200 {"status":"ok"}
```

No navegador: login com um `SEED_USERS` → cookie `allya_session` com `Secure` →
base demo carrega (120 empresas) → ranking 56 → exportar CSV. Rate limit:
6 logins errados do MESMO IP → 429 (confirma `TRUSTED_PROXY_DEPTH=1` enxergando
clientes reais).

## 8. Limites declarados

- Sem HTTPS ainda? O login funciona em `http` (cookie sem `Secure`) — aceitável
  só para teste rápido; o produto exige `APP_ORIGIN` https.
- A credencial do container (DML, sem DDL — verificado no runbook de testes)
  permite editar valores; a autoria na trilha é atribuição do servidor.
- `AI_PROVIDER=fixture` no deploy: interpretador determinístico, sem chave —
  trocar p/ provedor real é evolução (adaptador openai-compatible é stub).
- O deploy usa o banco dev da instância compartilhada até a Opção B acima.
