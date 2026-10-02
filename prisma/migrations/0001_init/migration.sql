-- CreateEnum
CREATE TYPE "DatasetKind" AS ENUM ('demo', 'user');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RenewalWindow" AS ENUM ('m0_3', 'm4_6', 'm7_12', 'over_12');

-- CreateEnum
CREATE TYPE "OperatingStatus" AS ENUM ('active', 'inactive', 'unknown');

-- CreateEnum
CREATE TYPE "SignalStrength" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ContactChannelType" AS ENUM ('institutional_site', 'generic_corporate_email', 'professional_profile', 'corporate_phone', 'contact_page', 'other_public_channel');

-- CreateEnum
CREATE TYPE "OpportunityResult" AS ENUM ('won', 'lost', 'negotiating');

-- CreateEnum
CREATE TYPE "RulesetStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ImportTarget" AS ENUM ('full_xlsx', 'companies', 'signals', 'contacts', 'opportunities', 'icp_rules', 'priority_rules', 'disqualifiers');

-- CreateEnum
CREATE TYPE "MergePolicy" AS ENUM ('fill_missing', 'overwrite_non_null');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('pending', 'previewed', 'committed', 'invalid', 'expired');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('queued', 'running', 'completed', 'partial_failed', 'failed');

-- CreateEnum
CREATE TYPE "JobItemState" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "SuggestionRelation" AS ENUM ('confirmation', 'contradiction', 'fill', 'inconclusive');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('pending', 'accepted', 'rejected', 'deferred', 'stale');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('accept', 'reject', 'defer');

-- CreateEnum
CREATE TYPE "ReviewSessionMode" AS ENUM ('manual', 'assisted');

-- CreateEnum
CREATE TYPE "ReviewSessionState" AS ENUM ('active', 'paused', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "TimingQuality" AS ENUM ('complete', 'interrupted');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_technical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_norm" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" "DatasetKind" NOT NULL DEFAULT 'user',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data_revision" INTEGER NOT NULL DEFAULT 1,
    "review_revision" INTEGER NOT NULL DEFAULT 1,
    "default_as_of" DATE NOT NULL,
    "active_ruleset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
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
    "growth" "Level",
    "employer_branding" "Level",
    "retention_pain" "Level",
    "renewal_window" "RenewalWindow",
    "renewed_24_plus" BOOLEAN,
    "operating_status" "OperatingStatus" NOT NULL DEFAULT 'unknown',
    "source_label" TEXT,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "evidence_text" TEXT NOT NULL,
    "strength" "SignalStrength" NOT NULL,
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

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "full_name" TEXT,
    "job_title" TEXT,
    "channel_type" "ContactChannelType" NOT NULL,
    "channel_value" TEXT NOT NULL,
    "origin" TEXT,
    "decision_maker_identified" BOOLEAN NOT NULL DEFAULT false,
    "is_professional_public" BOOLEAN NOT NULL DEFAULT false,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "result" "OpportunityResult" NOT NULL,
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

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruleset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "status" "RulesetStatus" NOT NULL,
    "config" JSONB NOT NULL,
    "base_ruleset_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "Ruleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID NOT NULL,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "source_file_id" UUID NOT NULL,
    "target" "ImportTarget" NOT NULL,
    "merge_policy" "MergePolicy" NOT NULL DEFAULT 'fill_missing',
    "separator" TEXT,
    "expected_version" INTEGER NOT NULL,
    "expected_data_revision" INTEGER NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'pending',
    "counts" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "committed_at" TIMESTAMPTZ(6),
    "commit_error" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_id" UUID NOT NULL,
    "sheet" TEXT,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB,
    "normalized" JSONB,
    "action" TEXT,
    "errors" JSONB,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'queued',
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

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJobItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "state" "JobItemState" NOT NULL DEFAULT 'queued',
    "frozen_input" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" JSONB,
    "lease_until" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "AnalysisJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_id" UUID,
    "job_item_id" UUID,
    "field" TEXT NOT NULL,
    "current_value" JSONB,
    "proposed_value" JSONB,
    "relation" "SuggestionRelation" NOT NULL,
    "confidence" TEXT,
    "rationale" TEXT,
    "evidence" JSONB NOT NULL,
    "base_company_version" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "SuggestionState" NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" UUID,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suggestion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "note" TEXT,
    "review_session_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
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

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "data_revision" INTEGER NOT NULL,
    "review_revision" INTEGER NOT NULL,
    "ruleset_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "rows" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataset_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" "ReviewSessionMode" NOT NULL,
    "state" "ReviewSessionState" NOT NULL DEFAULT 'active',
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "wall_seconds" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_resumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "timing_quality" "TimingQuality" NOT NULL DEFAULT 'complete',
    "input_revision_at_complete" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSessionEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "expected_version" INTEGER NOT NULL,
    "payload" JSONB,
    "server_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
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

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
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

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");

-- CreateIndex
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_norm_ip_occurred_at_idx" ON "LoginAttempt"("email_norm", "ip", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_active_ruleset_id_key" ON "Dataset"("active_ruleset_id");

-- CreateIndex
CREATE INDEX "Dataset_kind_idx" ON "Dataset"("kind");

-- CreateIndex
CREATE INDEX "Company_dataset_id_archived_at_idx" ON "Company"("dataset_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "Company_dataset_id_external_id_key" ON "Company"("dataset_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_id_dataset_id_key" ON "Company"("id", "dataset_id");

-- CreateIndex
CREATE INDEX "Signal_dataset_id_company_id_idx" ON "Signal"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "Signal_company_id_archived_at_idx" ON "Signal"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_dataset_id_external_id_key" ON "Signal"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "Contact_dataset_id_company_id_idx" ON "Contact"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "Contact_company_id_archived_at_idx" ON "Contact"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_dataset_id_external_id_key" ON "Contact"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "Opportunity_dataset_id_company_id_idx" ON "Opportunity"("dataset_id", "company_id");

-- CreateIndex
CREATE INDEX "Opportunity_company_id_archived_at_idx" ON "Opportunity"("company_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_dataset_id_external_id_key" ON "Opportunity"("dataset_id", "external_id");

-- CreateIndex
CREATE INDEX "Ruleset_dataset_id_status_idx" ON "Ruleset"("dataset_id", "status");

-- CreateIndex
CREATE INDEX "Ruleset_base_ruleset_id_idx" ON "Ruleset"("base_ruleset_id");

-- CreateIndex
CREATE UNIQUE INDEX "Ruleset_id_dataset_id_key" ON "Ruleset"("id", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFile_dataset_id_sha256_key" ON "SourceFile"("dataset_id", "sha256");

-- CreateIndex
CREATE INDEX "ImportBatch_dataset_id_status_idx" ON "ImportBatch"("dataset_id", "status");

-- CreateIndex
CREATE INDEX "ImportRow_import_id_idx" ON "ImportRow"("import_id");

-- CreateIndex
CREATE INDEX "AnalysisJob_dataset_id_state_idx" ON "AnalysisJob"("dataset_id", "state");

-- CreateIndex
CREATE INDEX "AnalysisJob_state_created_at_idx" ON "AnalysisJob"("state", "created_at");

-- CreateIndex
CREATE INDEX "AnalysisJobItem_state_lease_until_idx" ON "AnalysisJobItem"("state", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJobItem_job_id_company_id_key" ON "AnalysisJobItem"("job_id", "company_id");

-- CreateIndex
CREATE INDEX "Suggestion_company_id_state_idx" ON "Suggestion"("company_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_dataset_id_fingerprint_key" ON "Suggestion"("dataset_id", "fingerprint");

-- CreateIndex
CREATE INDEX "ReviewDecision_suggestion_id_idx" ON "ReviewDecision"("suggestion_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDecision_suggestion_id_idempotency_key_key" ON "ReviewDecision"("suggestion_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "Assessment_dataset_id_ruleset_id_as_of_idx" ON "Assessment"("dataset_id", "ruleset_id", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_company_id_input_revision_ruleset_id_as_of_datas_key" ON "Assessment"("company_id", "input_revision", "ruleset_id", "as_of", "dataset_revision", "review_revision");

-- CreateIndex
CREATE INDEX "RankingSnapshot_dataset_id_created_at_idx" ON "RankingSnapshot"("dataset_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "RankingSnapshot_dataset_id_data_revision_review_revision_ru_key" ON "RankingSnapshot"("dataset_id", "data_revision", "review_revision", "ruleset_id", "as_of");

-- CreateIndex
CREATE INDEX "ReviewSession_dataset_id_user_id_state_idx" ON "ReviewSession"("dataset_id", "user_id", "state");

-- CreateIndex
CREATE INDEX "ReviewSession_company_id_state_idx" ON "ReviewSession"("company_id", "state");

-- CreateIndex
CREATE INDEX "ReviewSessionEvent_session_id_idx" ON "ReviewSessionEvent"("session_id");

-- CreateIndex
CREATE INDEX "ReviewSessionEvent_server_timestamp_idx" ON "ReviewSessionEvent"("server_timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_type_entity_id_version_after_idx" ON "AuditEvent"("entity_type", "entity_id", "version_after");

-- CreateIndex
CREATE INDEX "AuditEvent_dataset_id_occurred_at_idx" ON "AuditEvent"("dataset_id", "occurred_at");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expires_at_idx" ON "IdempotencyRecord"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_user_id_method_route_key_key" ON "IdempotencyRecord"("user_id", "method", "route", "key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_active_ruleset_id_fkey" FOREIGN KEY ("active_ruleset_id") REFERENCES "Ruleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "Company"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "Company"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_company_id_dataset_id_fkey" FOREIGN KEY ("company_id", "dataset_id") REFERENCES "Company"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruleset" ADD CONSTRAINT "Ruleset_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruleset" ADD CONSTRAINT "Ruleset_base_ruleset_id_dataset_id_fkey" FOREIGN KEY ("base_ruleset_id", "dataset_id") REFERENCES "Ruleset"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJobItem" ADD CONSTRAINT "AnalysisJobItem_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "AnalysisJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "Suggestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSessionEvent" ADD CONSTRAINT "ReviewSessionEvent_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ReviewSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Auditoria append-only e privilégios (doc 04 §3, doc 07)
-- Executa como papel OWNER (DATABASE_MIGRATION_URL). O papel da
-- aplicação (b2bsm_app) é criado antes por scripts/bootstrap-db.ts
-- (ou `pnpm db:setup`, que impõe a ordem bootstrap → migrate → seed).
-- ============================================================

-- No máximo uma sessão de revisão aberta/pausada por usuário/empresa (doc 03 §9).
CREATE UNIQUE INDEX "review_sessions_one_open_per_user_company"
  ON "ReviewSession" ("user_id", "company_id")
  WHERE state IN ('active', 'paused');

-- Linhagem de regras (doc 04 §10): um rascunho nunca é base de si mesmo.
ALTER TABLE "Ruleset" ADD CONSTRAINT ruleset_no_self_base CHECK (base_ruleset_id IS NULL OR base_ruleset_id <> id);

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

  INSERT INTO public."AuditEvent" ("id", "dataset_id", "entity_type", "entity_id", "operation",
    "version_before", "version_after", "changed_fields", "before", "after",
    "actor_user_id", "source", "request_id", "import_id", "suggestion_id", "occurred_at")
  VALUES (gen_random_uuid(), v_dataset, TG_TABLE_NAME, v_entity, v_op,
    (v_old->>'version')::int, (v_new->>'version')::int, v_changed, v_old, v_new,
    v_actor, v_source, v_request_id, v_import_id, v_suggestion_id, now());

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_company       AFTER INSERT OR UPDATE OR DELETE ON "Company"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_signal        AFTER INSERT OR UPDATE OR DELETE ON "Signal"        FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_contact       AFTER INSERT OR UPDATE OR DELETE ON "Contact"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_opportunity   AFTER INSERT OR UPDATE OR DELETE ON "Opportunity"   FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_ruleset       AFTER INSERT OR UPDATE OR DELETE ON "Ruleset"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();
CREATE TRIGGER audit_dataset       AFTER INSERT OR UPDATE OR DELETE ON "Dataset"       FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();

-- Papéis: nenhuma tabela acessível a PUBLIC; sem TEMP nem CREATE no schema (INV-2).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE TEMPORARY ON DATABASE ' || quote_ident(current_database()) || ' FROM PUBLIC'; END $$;

-- Papel da aplicação: sem DDL, sem DELETE de negócio, sem escrita na trilha.
GRANT USAGE ON SCHEMA public TO b2bsm_app;
GRANT SELECT, INSERT, UPDATE ON "User", "Session", "LoginAttempt", "Dataset", "Company",
  "Signal", "Contact", "Opportunity", "Ruleset", "SourceFile", "ImportBatch", "ImportRow",
  "AnalysisJob", "AnalysisJobItem", "Suggestion", "ReviewDecision", "Assessment",
  "RankingSnapshot", "ReviewSession", "ReviewSessionEvent", "IdempotencyRecord" TO b2bsm_app;

-- Derivados e decisão são append-only: a app insere, nunca atualiza (INV-8/INV-11).
REVOKE UPDATE ON "Assessment", "RankingSnapshot", "ReviewDecision" FROM b2bsm_app;

-- Higiene técnica (TTL de idempotência, tentativas de login, sessões expiradas).
GRANT DELETE ON "IdempotencyRecord", "LoginAttempt", "Session" TO b2bsm_app;

-- Trilha: leitura para a app; escrita apenas pela função SECURITY DEFINER (owner).
GRANT SELECT ON "AuditEvent" TO b2bsm_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM b2bsm_app;
REVOKE EXECUTE ON FUNCTION public.audit_append_only() FROM PUBLIC;
