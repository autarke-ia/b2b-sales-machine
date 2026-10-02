# API — fonte normativa

**`contracts/openapi.yaml` é a fonte normativa de todos os endpoints HTTP** (53 operações, `base: /api/v1`). O espelho `contracts/openapi.json` é gerado — não editar os dois independentemente.

## Como consumir este documento

- Formato de request/response, códigos de erro, envelopes `{data, meta}` e paginação: leia o OpenAPI.
- Semântica de negócio, estados e comportamentos que não cabem no schema: docs `03_CONTRATO_API.md`, `01`, `02`, `06`, `07`, `08` na raiz.
- Tipos TypeScript gerados: `contracts/api-types.generated.ts` (auxiliar — a validação definitiva é no backend).

## Regra de mudança

Toda rota nova ou alterada atualiza o OpenAPI **no mesmo PR** que o código, com exemplos e tipos regenerados (`python tools/generate-types.py`). Um endpoint "parecido" não satisfaz o contrato.

## Implementação atual

| Rota | Estado |
|---|---|
| `GET /api/v1/health` | implementada (Fase 0) |
| Demais 52 operações | especificadas; fases 1–4 do plano |

Ver `docs/plans/prototipo-v1-b2b-sales-machine.md` para a ordem de implementação.
