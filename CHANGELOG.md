# Changelog

## [0.3.1](https://github.com/autarke-ia/b2b-sales-machine/compare/v0.3.0...v0.3.1) (2026-10-05)


### Bug Fixes

* **app:** menu lateral não linka índices sem dataset (corrige 404) ([#21](https://github.com/autarke-ia/b2b-sales-machine/issues/21)) ([16246e1](https://github.com/autarke-ia/b2b-sales-machine/commit/16246e1b5b79726d3a6c39144216d9a4462d9002))
* **runbooks:** receita de deploy por digest ([@sha256](https://github.com/sha256)), corrige @${TAG} inválido ([#19](https://github.com/autarke-ia/b2b-sales-machine/issues/19)) ([0ee2b20](https://github.com/autarke-ia/b2b-sales-machine/commit/0ee2b203a97276da0e6fed9b278e3c212fa05656))

## [0.3.0](https://github.com/autarke-ia/b2b-sales-machine/compare/v0.2.2...v0.3.0) (2026-10-03)


### Features

* **deploy:** deploy via ECR→EC2 por digest + segredos no AWS Secrets Manager ([#16](https://github.com/autarke-ia/b2b-sales-machine/issues/16)) ([223616f](https://github.com/autarke-ia/b2b-sales-machine/commit/223616f03bef09769d9d3ca285caf5ea0a368298))


### Bug Fixes

* **deploy:** secret renomeado para autarkeia/b2b-sales-machine/dev ([#18](https://github.com/autarke-ia/b2b-sales-machine/issues/18)) ([342b309](https://github.com/autarke-ia/b2b-sales-machine/commit/342b3097ac33e72f92125e91363c1579f626f131))


### Documentation

* **runbooks:** deploy como receita de bolo (quick deploy + secret pela UI) ([#17](https://github.com/autarke-ia/b2b-sales-machine/issues/17)) ([0548b33](https://github.com/autarke-ia/b2b-sales-machine/commit/0548b33a6dfc4b4471f8a7ede1a0c23df7bccec7))

## [0.2.2](https://github.com/autarke-ia/b2b-sales-machine/compare/v0.2.1...v0.2.2) (2026-10-03)


### Documentation

* **readme:** quick start — setup, login (senhas no .env), verificação e link p/ runbook ([#12](https://github.com/autarke-ia/b2b-sales-machine/issues/12)) ([3613e20](https://github.com/autarke-ia/b2b-sales-machine/commit/3613e20bbd190559799a2c88ef344a61cb6cc943))

## [0.2.1](https://github.com/autarke-ia/b2b-sales-machine/compare/v0.2.0...v0.2.1) (2026-10-03)


### Documentation

* **runbooks:** como rodar e testar a plataforma ([#10](https://github.com/autarke-ia/b2b-sales-machine/issues/10)) ([d9fd7a4](https://github.com/autarke-ia/b2b-sales-machine/commit/d9fd7a42b6ede732e36532947add8650c9941d50))

## [0.2.0](https://github.com/autarke-ia/b2b-sales-machine/compare/v0.1.0...v0.2.0) (2026-10-03)


### Features

* **fase-0:** fundação do protótipo v1 — scaffold, tokens Autarkeia e motor determinístico ([#1](https://github.com/autarke-ia/b2b-sales-machine/issues/1)) ([5998a3e](https://github.com/autarke-ia/b2b-sales-machine/commit/5998a3ef5ed39ab0234bb5d41be2b73e8ca56e4a))
* **fase-1:** auth, idempotência, ranking determinístico com snapshots e UI — jornada 1 ([#5](https://github.com/autarke-ia/b2b-sales-machine/issues/5)) ([fc9ca5d](https://github.com/autarke-ia/b2b-sales-machine/commit/fc9ca5dee12fc7473ac58ea1029084bcc5fed517))
* **fase-2:** CRUD versionado com auditoria, detalhe com avaliação e conflito honesto ([#6](https://github.com/autarke-ia/b2b-sales-machine/issues/6)) ([1575d0e](https://github.com/autarke-ia/b2b-sales-machine/commit/1575d0e73cfbb675505348a234a75eb323ea7265))
* **fase-3a:** importação CSV com prévia→commit atômico e IMP02-10 ([#7](https://github.com/autarke-ia/b2b-sales-machine/issues/7)) ([64365be](https://github.com/autarke-ia/b2b-sales-machine/commit/64365be9e397331b16db7be01add6e83907ac0c0))
* **fase-3b:** CRUD relacionados versionados e regras rascunho→publicação — jornada 3 ([#8](https://github.com/autarke-ia/b2b-sales-machine/issues/8)) ([2be6e77](https://github.com/autarke-ia/b2b-sales-machine/commit/2be6e7750fbfb0643b56b128e4b99417437baeb5))
* **fase-4:** IA assistida, revisão humana transacional e métricas — jornada 4 ([#9](https://github.com/autarke-ia/b2b-sales-machine/issues/9)) ([1eaa5b2](https://github.com/autarke-ia/b2b-sales-machine/commit/1eaa5b28c56172692224b228009389cbaa74b409))


### Documentation

* **capacidades:** estado final da maratona — todas as capacidades de produção ([c65d4af](https://github.com/autarke-ia/b2b-sales-machine/commit/c65d4afa447bd4b1c5eae9034597d93cf53941d5))


### Miscellaneous

* inicializa o repo com o pacote de especificação v1.0.0 ([6a11b0c](https://github.com/autarke-ia/b2b-sales-machine/commit/6a11b0ce466ecd6cb7fc5f68fea5e55556719632))
