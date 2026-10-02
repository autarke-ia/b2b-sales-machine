# Verificação da entrega · v1.0.0

Este relatório distingue **verificação dos arquivos e do motor de referência** de testes sobre a aplicação que Marco e Gabriel ainda vão implementar.

## Executado com sucesso

| Verificação | Resultado |
|---|---|
| Motor determinístico, `node --test tests/scoring.test.mjs` | **52 testes aprovados; 0 falhas** |
| Perfis do case | As 120 avaliações reproduzem o golden desta especificação |
| Invariantes adicionais | 500 perfis pseudoaleatórios com semente fixa, dentro de um dos testes |
| JSON Schema 2020-12 | 94 definições de schema verificadas |
| Payloads e seed | 809 instâncias verificadas, incluindo 22 fixtures de resposta, 11 exemplos inline e 597 registros normalizados |
| API | 53 operações; IDs únicos, parâmetros de rota, CSRF/idempotência e índice de operações conferidos |
| Referências locais do contrato | 602 referências resolvidas, sem referência remota necessária à validação das instâncias |
| OpenAPI YAML e JSON | Conteúdo equivalente |
| TypeScript | 94 tipos regenerados; `tsc --noEmit --strict --skipLibCheck` aprovado |
| CSV | 7 modelos conferidos; pesos/condições confrontados com os defaults |
| XLSX de origem | SHA-256 confere com o arquivo usado para construir o seed |
| Documentação | Links locais resolvidos; sem contrato ou documento prometido ausente |

Os números de verificações menores e de arquivos JSON podem crescer com a inclusão deste relatório e do manifesto. Os resultados completos ficam em `tests/package-validation-result.json` e `tests/scoring-results.tap`.

O perfil mecânico inicial da demo resulta em **56 empresas dentro do ICP, 37 fora e 27 pendentes**. Essa é a saída dos parâmetros definidos neste pacote, não uma validação comercial de acurácia. O golden foi gerado pelo próprio motor: verifica regressões e consistência, mas não constitui gabarito independente.

A cobertura unitária inclui limites de colaboradores, dados ausentes, corte exato, dois scores independentes, desqualificadores, recência, contatos permitidos, ausência de histórico temporal, penalidades, ranking/desempates, arredondamento decimal e estado preliminar/revisado.

## Não executado nesta entrega

- Validador independente `openapi-spec-validator`: não estava instalado; a tentativa de instalação foi impedida pela indisponibilidade de rede do ambiente. Foram executadas as verificações estruturais próprias e de JSON Schema descritas acima. Não afirmar certificação integral do documento por uma ferramenta OpenAPI independente.
- Endpoints reais, banco PostgreSQL, migrations, triggers, permissões, login, CSRF, concorrência e recuperação de jobs. Esses testes dependem da aplicação e estão especificados em `08_TESTES_E_CRITERIOS_DE_ACEITE.md`.
- Parser XLSX/CSV de um backend implementado: os modelos e o seed foram conferidos, mas o importador do produto ainda será construído.
- Frontend no navegador, teste ponta a ponta, chamada real a LLM, custo de provedor, latência e eficácia comercial.
- Experimento manual versus assistido. Nenhuma meta de tempo foi declarada atingida.

## Reproduzir localmente

Motor, sem dependências externas:

```bash
node --test tests/scoring.test.mjs
```

Schemas, fixtures, seed, links e contrato estrutural:

```bash
python -m pip install jsonschema PyYAML
python tools/validate_package.py
```

Para incluir também o validador independente de OpenAPI, em ambiente com acesso ao instalador:

```bash
python -m pip install openapi-spec-validator
python tools/validate_package.py
```

Regenerar e conferir os tipos:

```bash
python tools/generate-types.py
# Requer o compilador TypeScript já instalado no ambiente/repositório.
tsc --noEmit --strict --skipLibCheck contracts/api-types.generated.ts
```

Ambiente usado: Node.js 22.16.0, TypeScript 5.8.3, Python 3.13.5, jsonschema 4.26.0 e PyYAML 6.0.3. São versões do ambiente de verificação, não uma recomendação de versões mais recentes ou uma exigência de stack para o backend.

`SHA256SUMS.txt` permite conferir os arquivos do pacote. Ele verifica integridade acidental, não autenticidade contra quem substitua os arquivos e o próprio manifesto.
