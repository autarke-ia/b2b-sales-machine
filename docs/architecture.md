# Arquitetura — Protótipo v1 (B2B Sales Machine)

Decisões de arquitetura do protótipo; origem em entrevista de discovery (02/10/2026) e revisão plan-review. Plano executável e invariantes: `docs/plans/prototipo-v1-b2b-sales-machine.md`.

## Princípio do produto

> IA interpreta evidências · Humanos validam decisões ambíguas · Código aplica regras objetivas · O sistema preserva a rastreabilidade.

## Camadas

1. **Domínio puro** (`src/domain/`) — sem IO: motor de scoring (gate ICP L/U, prioridade S01–S10, `validateRuleConfig`). Fiel 1:1 ao motor de referência do pacote; a suíte de 52 testes é o contrato. Extraível para o backend da fase B.
2. **Servidor** (`src/server/`, `app/api/v1/`) — route handlers Next.js = a API contratada. Escritas transacionais com contexto de ator via `set_config` local; auditoria por trigger PostgreSQL append-only (credencial da app sem UPDATE/DELETE/TRUNCATE na trilha); snapshots imutáveis de avaliação/ranking com cache `(dataset_id, data_revision, review_revision, ruleset_id, as_of)`.
3. **Interface** (`app/`, `src/components/`) — Tailwind v4 com os design tokens Autarkeia (`app/globals.css` como única fonte de cor), shadcn/ui temado, pt-BR. Nunca recalcula score; o servidor é a única fonte de avaliação.
4. **Dados** — PostgreSQL (RDS `mindville_db`, banco dedicado `b2b_sales_machine_dev`) + Prisma 6; dois papéis: owner (migrations) e `b2bsm_app` (runtime restrito).

## Papel da IA

Adaptador configurável (`AI_PROVIDER`): provedor OpenAI-compatible em produção, provider `fixture` para dev sem rede. O backend valida toda saída (trecho literal verificado na evidência, relação recalculada, saída inválida descartada). Nenhuma sugestão altera cadastro sem decisão humana transacional.

## Invariantes

INV-1…INV-14 no plano são exigências verificáveis (testes e SQL), parte do aceite de cada fase.
