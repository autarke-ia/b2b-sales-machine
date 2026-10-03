#!/usr/bin/env bash
#
# deploy-ec2.sh — publica uma nova versão do protótipo B2B Sales Machine no EC2.
#
# Modelo idêntico ao autarkeia-website / backend Mindville: a imagem é buildada e
# empurrada pro ECR pelo GitHub Actions (app-ecr.yml); AQUI, na caixa, só puxamos
# a imagem por DIGEST e reiniciamos o container. O nginx do host faz proxy + TLS.
# Segredo NÃO entra aqui: o container herda a role da instância e busca o secret
# no AWS Secrets Manager no boot (ver deploy/README.md §Secrets Manager).
#
# Uso (na caixa, via SSM):
#   sudo AWS_REGION=sa-east-1 \
#        IMAGE_DIGEST=sha256:<digest> \
#        bash scripts/deploy-ec2.sh
#
# Como achar o digest da imagem recém-buildada (de uma máquina com AWS admin):
#   aws ecr describe-images --repository-name b2b-sales-machine \
#     --region sa-east-1 --image-ids imageTag=sha-<commit-sha> \
#     --query 'imageDetails[0].imageDigest' --output text
set -euo pipefail

AWS_REGION="${AWS_REGION:-sa-east-1}"
ACCOUNT_ID="${ACCOUNT_ID:-131464424960}"
ECR_REPO="${ECR_REPO:-b2b-sales-machine}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/mindville/docker-compose.b2b-sales-machine.prod.yml}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

: "${IMAGE_DIGEST:?defina IMAGE_DIGEST=sha256:<digest> (nunca tag flutuante — pin por digest)}"

echo "==> Re-login no ECR (token expira a cada 12h)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Pinando o digest no compose"
NEW_IMAGE="${REGISTRY}/${ECR_REPO}@${IMAGE_DIGEST}"
# Substitui a linha image: do serviço, preservando indentação.
sudo sed -i -E "s|(^\s*image:\s*).*|\1${NEW_IMAGE}|" "$COMPOSE_FILE"
grep -n "image:" "$COMPOSE_FILE"

echo "==> Subindo o container (pull always)"
sudo docker compose -f "$COMPOSE_FILE" up -d --pull always

echo "==> Verificação"
sleep 4
sudo docker compose -f "$COMPOSE_FILE" ps
curl -sS -o /dev/null -w "health HTTP %{http_code}\n" http://127.0.0.1:3001/api/v1/health  # espera 200
echo "==> Deploy OK → ${NEW_IMAGE}"
