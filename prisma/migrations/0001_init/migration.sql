-- CreateEnum
CREATE TYPE "dataset_kind" AS ENUM ('demo', 'user');

-- CreateEnum
CREATE TYPE "level" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "renewal_window" AS ENUM ('m0_3', 'm4_6', 'm7_12', 'over_12');

-- CreateEnum
CREATE TYPE "operating_status" AS ENUM ('active', 'inactive', 'unknown');

-- CreateEnum
CREATE TYPE "signal_strength" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "contact_channel_type" AS ENUM ('institutional_page', 'generic_corporate_email', 'professional_profile', 'corporate_phone', 'company_contact_page', 'other_public');

-- CreateEnum
CREATE TYPE "opportunity_result" AS ENUM ('won', 'lost', 'negotiating');

-- CreateEnum
CREATE TYPE "ruleset_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "import_target" AS ENUM ('full_xlsx', 'companies', 'signals', 'contacts', 'opportunities', 'icp_rules', 'priority_rules', 'disqualifiers');

-- CreateEnum
CREATE TYPE "merge_policy" AS ENUM ('fill_missing', 'overwrite_non_null');

-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('pending', 'previewed', 'committed', 'invalid', 'expired');

-- CreateEnum
CREATE TYPE "job_state" AS ENUM ('queued', 'running', 'completed', 'partial_failed', 'failed');

-- CreateEnum
CREATE TYPE "job_item_state" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "suggestion_relation" AS ENUM ('confirmation', 'contradiction', 'fill', 'inconclusive');

-- CreateEnum
CREATE TYPE "suggestion_state" AS ENUM ('pending', 'accepted', 'rejected', 'deferred', 'stale');

-- CreateEnum
CREATE TYPE "review_action" AS ENUM ('accept', 'reject', 'defer');

-- CreateEnum
CREATE TYPE "review_session_mode" AS ENUM ('manual', 'assisted');

-- CreateEnum
CREATE TYPE "review_session_state" AS ENUM ('active', 'paused', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "timing_quality" AS ENUM ('complete', 'interrupted');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_technical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_norm" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" "dataset_kind" NOT NULL DEFAULT 'user',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data_revision" INTEGER NOT NULL DEFAULT 1,
    "review_revision" INTEGER NOT NULL DEFAULT 1,
    "default_as_of" DATE NOT NULL,
    "active_ruleset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "segment" TEXT,
    "employees" INTEGER,
    "uf" TEXT,
    "operates_in_brazil" BOOLEAN,
    "hr_structured" BOOLEAN,
    "has_benefits" BOOLEAN,
    "seeks_benefit_differentiation" BOOLEAN,
    "multi_region" BOOLEAN,
    "growth" "level",
    "employer_branding" "level",
    "retention_pain" "level",
    "renewal_window" "renewal_window",
    "renewed_24_plus" BOOLEAN,
    "operating_status" "operating_status" NOT NULL DEFAULT 'unknown',
    "source_label" TEXT,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "evidence_text" TEXT NOT NULL,
    "strength" "signal_strength" NOT NULL,
    "observed_on" DATE,
    "source_name" TEXT,
    "source_url" VARCHAR(2048),
    "source_allowed" BOOLEAN,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "full_name" TEXT,
    "job_title" TEXT,
    "channel_type" "contact_channel_type" NOT NULL,
    "channel_value" TEXT NOT NULL,
    "origin" TEXT,
    "is_professional_public" BOOLEAN NOT NULL DEFAULT false,
    "source_allowed" BOOLEAN,
    "decision_maker_identified" BOOLEAN NOT NULL DEFAULT false,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "result" "opportunity_result" NOT NULL,
    "closed_on" DATE,
    "segment_at_close" TEXT,
    "cycle_days" INTEGER,
    "estimated_ticket_cents" BIGINT,
    "reason" TEXT,
    "sponsor" TEXT,
    "origin" TEXT,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rulesets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "status" "ruleset_status" NOT NULL,
    "config" JSONB NOT NULL,
    "base_ruleset_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID NOT NULL,

    CONSTRAINT "source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "source_file_id" UUID NOT NULL,
    "target" "import_target" NOT NULL,
    "merge_policy" "merge_policy" NOT NULL DEFAULT 'fill_missing',
    "separator" TEXT,
    "expected_version" INTEGER NOT NULL,
    "expected_data_revision" INTEGER NOT NULL,
    "status" "import_batch_status" NOT NULL DEFAULT 'pending',
    "counts" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "committed_at" TIMESTAMPTZ(6),
    "commit_error" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_id" UUID NOT NULL,
    "sheet" TEXT,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB,
    "normalized" JSONB,
    "action" TEXT,
    "errors" JSONB,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "state" "job_state" NOT NULL DEFAULT 'queued',
    "requested" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "prompt_version" TEXT,
    "usage" JSONB,
    "error" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retry_of_job_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_job_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "state" "job_item_state" NOT NULL DEFAULT 'queued',
    "frozen_input" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" JSONB,
    "lease_until" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "analysis_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_id" UUID,
    "job_item_id" UUID,
    "field" TEXT NOT NULL,
    "current_value" JSONB,
    "proposed_value" JSONB,
    "relation" "suggestion_relation" NOT NULL,
    "confidence" TEXT,
    "rationale" TEXT,
    "evidence" JSONB NOT NULL,
    "base_company_version" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "suggestion_state" NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suggestion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "review_action" NOT NULL,
    "note" TEXT,
    "review_session_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "input_revision" INTEGER NOT NULL,
    "ruleset_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "dataset_revision" INTEGER NOT NULL,
    "review_revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "data_revision" INTEGER NOT NULL,
    "review_revision" INTEGER NOT NULL,
    "ruleset_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "rows" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" "review_session_mode" NOT NULL,
    "state" "review_session_state" NOT NULL DEFAULT 'active',
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "wall_seconds" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_resumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "timing_quality" "timing_quality" NOT NULL DEFAULT 'complete',
    "input_revision_at_complete" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_session_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "expected_version" INTEGER NOT NULL,
    "payload" JSONB,
    "server_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "version_before" INTEGER,
    "version_after" INTEGER,
    "changed_fields" JSONB,
    "before" JSONB,
    "after" JSONB,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "request_id" UUID,
    "import_id" UUID,
    "suggestion_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_norm_ip_occurred_at_idx" ON "login_attempts"("email_norm", "ip", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_active_ruleset_id_key" ON "datasets"("active_ruleset_id");

-- CreateIndex
CREATE INDEX "datasets_kind_idx" ON "datasets"("kind");

-- CreateIndex
CREATE INDEX "companies_dataset_id_archived_at_idx" ON "companies"("dataset_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_dataset_id_external_id_key" ON "companies"("dataset_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_id_dataset_id_key" ON "companies"("id", "dataset_id");

-- CreateIndex
CREATE INDEX "signals_dataset_id_company_id_idx" ON "signals"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "signals_company_id_archived_at_idx" ON "signals"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "signals_dataset_id_external_id_key" ON "signals"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "contacts_dataset_id_company_id_idx" ON "contacts"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "contacts_company_id_archived_at_idx" ON "contacts"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_dataset_id_external_id_key" ON "contacts"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "opportunities_dataset_id_company_id_idx" ON "opportunities"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "opportunities_company_id_archived_at_idx" ON "opportunities"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_dataset_id_external_id_key" ON "opportunities"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "rulesets_dataset_id_status_idx" ON "rulesets"("dataset_id", "status");

-- CreateIndex
CREATE INDEX "rulesets_base_ruleset_id_idx" ON "rulesets"("base_ruleset_id");

-- CreateIndex
CREATE UNIQUE INDEX "rulesets_id_dataset_id_key" ON "rulesets"("id", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_files_dataset_id_sha256_key" ON "source_files"("dataset_id", "sha256");

-- CreateIndex
CREATE INDEX "import_batches_dataset_id_status_idx" ON "import_batches"("dataset_id", "status");

-- CreateIndex
CREATE INDEX "import_rows_import_id_idx" ON "import_rows"("import_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_dataset_id_state_idx" ON "analysis_jobs"("dataset_id", "state");

-- CreateIndex
CREATE INDEX "analysis_jobs_state_created_at_idx" ON "analysis_jobs"("state", "created_at");

-- CreateIndex
CREATE INDEX "analysis_job_items_state_lease_until_idx" ON "analysis_job_items"("state", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_job_items_job_id_company_id_key" ON "analysis_job_items"("job_id", "company_id");

-- CreateIndex
CREATE INDEX "suggestions_company_id_state_idx" ON "suggestions"("company_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_dataset_id_fingerprint_key" ON "suggestions"("dataset_id", "fingerprint");

-- CreateIndex
CREATE INDEX "review_decisions_suggestion_id_idx" ON "review_decisions"("suggestion_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_decisions_suggestion_id_idempotency_key_key" ON "review_decisions"("suggestion_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "assessments_dataset_id_ruleset_id_as_of_idx" ON "assessments"("dataset_id", "ruleset_id", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_company_id_input_revision_ruleset_id_as_of_data_key" ON "assessments"("company_id", "input_revision", "ruleset_id", "as_of", "dataset_revision", "review_revision");

-- CreateIndex
CREATE INDEX "ranking_snapshots_dataset_id_created_at_idx" ON "ranking_snapshots"("dataset_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_snapshots_dataset_id_data_revision_review_revision__key" ON "ranking_snapshots"("dataset_id", "data_revision", "review_revision", "ruleset_id", "as_of");

-- CreateIndex
CREATE INDEX "review_sessions_dataset_id_user_id_state_idx" ON "review_sessions"("dataset_id", "user_id", "state");

-- CreateIndex
CREATE INDEX "review_sessions_company_id_state_idx" ON "review_sessions"("company_id", "state");

-- CreateIndex
CREATE INDEX "review_session_events_session_id_idx" ON "review_session_events"("session_id");

-- CreateIndex
CREATE INDEX "review_session_events_server_timestamp_idx" ON "review_session_events"("server_timestamp");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_version_after_idx" ON "audit_events"("entity_type", "entity_id", "version_after");

-- CreateIndex
CREATE INDEX "audit_events_dataset_id_occurred_at_idx" ON "audit_events"("dataset_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_method_route_key_key" ON "idempotency_records"("user_id", "method", "route", "key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_active_ruleset_id_fkey" FOREIGN KEY ("active_ruleset_id") REFERENCES "rulesets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "companies"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "companies"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "companies"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_base_ruleset_id_dataset_id_fkey" FOREIGN KEY ("base_ruleset_id", "dataset_id") REFERENCES "rulesets"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_job_items" ADD CONSTRAINT "analysis_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "suggestions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_events" ADD CONSTRAINT "review_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "review_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Auditoria append-only e privilégios (doc 04 §3, doc 07)
-- Executa como papel OWNER (DATABASE_MIGRATION_URL). O papel da
-- aplicação (b2bsm_app) é criado antes por scripts/bootstrap-db.ts
-- (ou `pnpm db:setup`, que impõe a ordem bootstrap → migrate → seed).
-- Nomes físicos em snake_case (doc 04 §3); a API do Prisma Client
-- não muda (mapeamento via @@map no schema).
-- ============================================================

-- FK circular de bootstrap (doc 01 §8): o seed cria o ruleset publicado ANTES do
-- dataset que o referencia. Com a FK DEFERRABLE INITIALLY DEFERRED a verificação
-- ocorre no COMMIT (quando ambas as linhas existem) — sem reordenar o seed e sem
-- um segundo evento de auditoria que violaria INV-1.
ALTER TABLE "rulesets" ALTER CONSTRAINT "rulesets_dataset_id_fkey" DEFERRABLE INITIALLY DEFERRED;

-- No máximo uma sessão de revisão aberta/pausada por usuário/empresa (doc 03 §9).
CREATE UNIQUE INDEX "review_sessions_one_open_per_user_company"
  ON "review_sessions" ("user_id", "company_id")
  WHERE state IN ('active', 'paused');

-- Linhagem de regras (doc 04 §10): um rascunho nunca é base de si mesmo.
ALTER TABLE "rulesets" ADD CONSTRAINT ruleset_no_self_base CHECK (base_ruleset_id IS NULL OR base_ruleset_id <> id);

-- Função de escrita da trilha: SECURITY DEFINER com owner ≠ app, search_path fixo
-- e nomes de tabela QUALIFICADOS (doc 07 §3) — sem resolução via pg_temp.
CREATE OR REPLACE FUNCTION public.audit_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_source text;
  v_request_id uuid;
  v_import_id uuid;
  v_suggestion_id uuid;
  v_dataset uuid;
  v_entity uuid;
  v_entity_type text;
  v_old jsonb;
  v_new jsonb;
  v_op text;
  v_changed jsonb;
BEGIN
  v_actor := NULLIF(current_setting('app.actor_user_id', true), '')::uuid;
  v_source := COALESCE(NULLIF(current_setting('app.source', true), ''), 'system');
  v_request_id := NULLIF(current_setting('app.request_id', true), '')::uuid;
  v_import_id := NULLIF(current_setting('app.import_id', true), '')::uuid;
  v_suggestion_id := NULLIF(current_setting('app.suggestion_id', true), '')::uuid;
  v_old := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_dataset := COALESCE(v_new->>'dataset_id', v_old->>'dataset_id')::uuid;
  v_entity := COALESCE(v_new->>'id', v_old->>'id')::uuid;
  v_op := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END;

  -- entity_type é o nome LÓGICO singular do contrato (AuditEvent.entity_type, doc 03/07),
  -- não o nome físico plural da tabela (TG_TABLE_NAME) — as duas convenções divergem desde
  -- o @@map em snake_case. Fail-fast num tipo não mapeado: uma tabela auditada nova precisa
  -- entrar aqui E no enum do contrato, nunca gravar um valor fora do contrato em silêncio.
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'companies'     THEN 'company'
    WHEN 'signals'       THEN 'signal'
    WHEN 'contacts'      THEN 'contact'
    WHEN 'opportunities' THEN 'opportunity'
    WHEN 'rulesets'      THEN 'ruleset'
  END;
  IF v_entity_type IS NULL THEN
    RAISE EXCEPTION 'AUDIT_ENTITY_TYPE_UNMAPPED: % sem valor de contrato para entity_type', TG_TABLE_NAME;
  END IF;

  -- Falha fechada (doc 07 §3): mutação sem ator válido reverte a transação.
  -- (avalia ANTES do no-op: sem contexto, nem no-op passa silenciosamente)
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUDIT_ACTOR_MISSING: % em % sem contexto de ator', TG_OP, TG_TABLE_NAME;
  END IF;

  -- No-op não gera evento nem ruído (doc 07 §2).
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Campos de negócio efetivamente alterados (doc 07 §2); colunas técnicas
    -- versionadas ficam em version_before/after, não em changed_fields.
    SELECT COALESCE(jsonb_agg(k.key ORDER BY k.key), '[]'::jsonb) INTO v_changed
    FROM jsonb_object_keys(v_new) AS k(key)
    WHERE k.key NOT IN ('updated_at', 'updated_by', 'version', 'input_revision')
      AND (v_old -> k.key) IS DISTINCT FROM (v_new -> k.key);
  ELSE
    v_changed := NULL;
  END IF;

  INSERT INTO public."audit_events" ("id", "dataset_id", "entity_type", "entity_id", "operation",
    "version_before", "version_after", "changed_fields", "before", "after",
    "actor_user_id", "source", "request_id", "import_id", "suggestion_id", "occurred_at")
  VALUES (gen_random_uuid(), v_dataset, v_entity_type, v_entity, v_op,
    (v_old->>'version')::int, (v_new->>'version')::int, v_changed, v_old, v_new,
    v_actor, v_source, v_request_id, v_import_id, v_suggestion_id, now());

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_company       AFTER INSERT OR UPDATE OR DELETE ON "companies"      FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_signal        AFTER INSERT OR UPDATE OR DELETE ON "signals"        FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_contact       AFTER INSERT OR UPDATE OR DELETE ON "contacts"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_opportunity   AFTER INSERT OR UPDATE OR DELETE ON "opportunities"  FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_ruleset       AFTER INSERT OR UPDATE OR DELETE ON "rulesets"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
-- datasets NÃO é entidade auditada (doc 04 §3: coluna "auth", não "audit"; o enum
-- AuditEvent.entity_type do contrato não tem valor 'dataset'). Mudanças de dataset
-- (data_revision/review_revision) são reconstruíveis pelos eventos das entidades filhas.

-- Papéis: nenhuma tabela acessível a PUBLIC; sem TEMP nem CREATE no schema (INV-2).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE TEMPORARY ON DATABASE ' || quote_ident(current_database()) || ' FROM PUBLIC'; END $$;

-- Papel da aplicação: sem DDL, sem DELETE de negócio, sem escrita na trilha.
GRANT USAGE ON SCHEMA public TO b2bsm_app;
GRANT SELECT, INSERT, UPDATE ON "users", "sessions", "login_attempts", "datasets", "companies",
  "signals", "contacts", "opportunities", "rulesets", "source_files", "import_batches", "import_rows",
  "analysis_jobs", "analysis_job_items", "suggestions", "review_decisions", "assessments",
  "ranking_snapshots", "review_sessions", "review_session_events", "idempotency_records" TO b2bsm_app;

-- Derivados e decisão são append-only: a app insere, nunca atualiza (INV-8/INV-11).
REVOKE UPDATE ON "assessments", "ranking_snapshots", "review_decisions" FROM b2bsm_app;

-- Higiene técnica (TTL de idempotência, tentativas de login, sessões expiradas).
GRANT DELETE ON "idempotency_records", "login_attempts", "sessions" TO b2bsm_app;

-- Trilha: leitura para a app; escrita apenas pela função SECURITY DEFINER (owner).
GRANT SELECT ON "audit_events" TO b2bsm_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "audit_events" FROM b2bsm_app;
REVOKE EXECUTE ON FUNCTION public.audit_append_only() FROM PUBLIC;
