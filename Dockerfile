# Protótipo B2B Sales Machine — ITA Challenge G2 · Allya.
#
# Convenção dos irmãos (ver Dockerfile do autarkeia-website): a paridade é no
# PIPELINE (OIDC → ECR → imagem, release-please, pr-gate), não no interior do
# container. Runtime: Next.js padrão (`next start`) com node_modules completos —
# a otimização para output:'standalone' é evolução futura, não requisito do
# protótipo (demo local; a imagem existe para o pipeline existir de verdade).
#
# Segredos NUNCA na imagem (INV-13): DATABASE_URL e afins entram por env no deploy.

# -- Stage 1: Build --------------------------------------------------------
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# pnpm via corepack (versão vem do campo packageManager do package.json).
RUN corepack enable

# 1. Manifests + schema do Prisma primeiro (postinstall roda `prisma generate`)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# 2. Código-fonte + build
COPY . .
RUN pnpm build

# -- Stage 2: Runtime ------------------------------------------------------
FROM node:20-bullseye-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["pnpm", "start"]
