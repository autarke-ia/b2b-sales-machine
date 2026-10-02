# AGENTS.md — b2b-sales-machine

ITA Challenge · Grupo 2 · Allya — protótipo de prospecção B2B inteligente
(elegibilidade/ICP → interpretação assistida por IA → priorização determinística explicável).

Este projeto é um repo independente dentro do workspace `autarkeia`. As convenções do
workspace (raiz `AGENTS.md`) valem aqui e não são duplicadas em totalidade — leia a raiz
para regras de conduta, Git e segurança.

## Stack

- TypeScript strict + ESM; `pnpm@9.15.9` (versão do `packageManager`, nunca npm/yarn).
- Next.js 15.5 (App Router) + React 19; Tailwind v4 com os design tokens Autarkeia.
- PostgreSQL (RDS `mindville_db`, banco dedicado `b2b_sales_machine_dev`) + Prisma 6.
- Testes: vitest (unidade/contrato) + Playwright (e2e).

## Fontes normativas (não reabrir sem revisão do pacote)

- `00`–`10_*.md` — regras de negócio, contrato HTTP, auditoria, testes de aceite.
- `contracts/openapi.yaml` — fonte normativa dos endpoints; o `.json` é espelho gerado.
- `contracts/rules-default-v1.json` — parâmetros iniciais de ICP/prioridade.
- **Divergência entre código e especificação corrige o pacote antes de implementar.**

## Acordos de trabalho

- Português com diacríticos em toda escrita; identificadores de código em inglês.
- Nunca commitar ou pushar direto na `main` (exceção documental exige autorização
  explícita na conversa, nos termos da rule do workspace). PR exige revisão adversarial.
- Segredos (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `AI_API_KEY`, senhas de seed)
  vivem somente em `.env` local (gitignored). `.env.example` lista nomes, nunca valores.
- `seed/`, `examples/`, `templates/` e `contracts/` do pacote v1.0.0 são insumos
  normativos/imutáveis — alterá-los exige atualização do manifest e dos checksums.
- Toda mudança de capacidade reutilizável atualiza `CAPABILITIES.md` no mesmo conjunto.
- Motor de domínio (`src/domain/`) é puro: sem IO, sem rede, sem banco. O frontend
  nunca recalcula score — o servidor é a única fonte de avaliação.
- Plano vigente: `docs/plans/prototipo-v1-b2b-sales-machine.md` (invariantes INV-1…14
  são verificáveis e fazem parte do aceite).
