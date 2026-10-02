// GENERATED from openapi.json. Do not edit by hand.

// Conditional field rules, formats and numerical constraints are validated at runtime.

export type Company = { "id": string; "dataset_id": string; "version": number; "created_at": string; "created_by": string; "updated_at": string; "updated_by": string; "archived_at": string | null; "external_id": string; "name": string; "domain": string | null; "segment": string | null; "employees": number | null; "uf": "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO" | null; "operates_in_brazil": boolean | null; "hr_structured": boolean | null; "has_benefits": boolean | null; "seeks_benefit_differentiation": boolean | null; "multi_region": boolean | null; "growth": "low" | "medium" | "high" | null; "employer_branding": "low" | "medium" | "high" | null; "retention_pain": "low" | "medium" | "high" | null; "renewal_window": "m0_3" | "m4_6" | "m7_12" | "over_12" | null; "renewed_24_plus": boolean | null; "operating_status": "active" | "inactive" | "unknown"; "source_label": string | null; "is_synthetic": boolean; "input_revision": number; };

export type CompanyCreate = { "external_id": string; "name": string; "domain"?: string | null; "segment"?: string | null; "employees"?: number | null; "uf"?: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO" | null; "operates_in_brazil"?: boolean | null; "hr_structured"?: boolean | null; "has_benefits"?: boolean | null; "seeks_benefit_differentiation"?: boolean | null; "multi_region"?: boolean | null; "growth"?: "low" | "medium" | "high" | null; "employer_branding"?: "low" | "medium" | "high" | null; "retention_pain"?: "low" | "medium" | "high" | null; "renewal_window"?: "m0_3" | "m4_6" | "m7_12" | "over_12" | null; "renewed_24_plus"?: boolean | null; "operating_status"?: "active" | "inactive" | "unknown"; "source_label"?: string | null; "is_synthetic"?: boolean; };

export type CompanyPatch = { "expected_version": number; "changes": { "name"?: string; "domain"?: string | null; "segment"?: string | null; "employees"?: number | null; "uf"?: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO" | null; "operates_in_brazil"?: boolean | null; "hr_structured"?: boolean | null; "has_benefits"?: boolean | null; "seeks_benefit_differentiation"?: boolean | null; "multi_region"?: boolean | null; "growth"?: "low" | "medium" | "high" | null; "employer_branding"?: "low" | "medium" | "high" | null; "retention_pain"?: "low" | "medium" | "high" | null; "renewal_window"?: "m0_3" | "m4_6" | "m7_12" | "over_12" | null; "renewed_24_plus"?: boolean | null; "operating_status"?: "active" | "inactive" | "unknown"; "source_label"?: string | null; }; };

export type Signal = { "id": string; "dataset_id": string; "version": number; "created_at": string; "created_by": string; "updated_at": string; "updated_by": string; "archived_at": string | null; "external_id": string; "company_id": string; "signal_type": string; "evidence_text": string; "strength": "low" | "medium" | "high" | null; "observed_on": string | null; "source_name": string; "source_url": string | null; "source_allowed": boolean | null; "is_synthetic": boolean; };

export type SignalCreate = { "external_id": string; "company_id": string; "signal_type": string; "evidence_text": string; "strength"?: "low" | "medium" | "high" | null; "observed_on"?: string | null; "source_name": string; "source_url"?: string | null; "source_allowed"?: boolean | null; "is_synthetic"?: boolean; };

export type SignalPatch = { "expected_version": number; "changes": { "signal_type"?: string; "evidence_text"?: string; "strength"?: "low" | "medium" | "high" | null; "observed_on"?: string | null; "source_name"?: string; "source_url"?: string | null; "source_allowed"?: boolean | null; }; };

export type Contact = { "id": string; "dataset_id": string; "version": number; "created_at": string; "created_by": string; "updated_at": string; "updated_by": string; "archived_at": string | null; "external_id": string; "company_id": string; "full_name": string | null; "job_title": string | null; "channel_type": "institutional_page" | "generic_corporate_email" | "professional_profile" | "corporate_phone" | "company_contact_page" | "other_public"; "channel_value": string; "origin": string | null; "is_professional_public": boolean | null; "source_allowed": boolean | null; "decision_maker_identified": boolean | null; "is_synthetic": boolean; };

export type ContactCreate = { "external_id": string; "company_id": string; "full_name"?: string | null; "job_title"?: string | null; "channel_type": "institutional_page" | "generic_corporate_email" | "professional_profile" | "corporate_phone" | "company_contact_page" | "other_public"; "channel_value": string; "origin"?: string | null; "is_professional_public"?: boolean | null; "source_allowed"?: boolean | null; "decision_maker_identified"?: boolean | null; "is_synthetic"?: boolean; };

export type ContactPatch = { "expected_version": number; "changes": { "full_name"?: string | null; "job_title"?: string | null; "channel_type"?: "institutional_page" | "generic_corporate_email" | "professional_profile" | "corporate_phone" | "company_contact_page" | "other_public"; "channel_value"?: string; "origin"?: string | null; "is_professional_public"?: boolean | null; "source_allowed"?: boolean | null; "decision_maker_identified"?: boolean | null; }; };

export type Opportunity = { "id": string; "dataset_id": string; "version": number; "created_at": string; "created_by": string; "updated_at": string; "updated_by": string; "archived_at": string | null; "external_id": string; "company_id": string; "result": "won" | "lost" | "negotiating"; "closed_on": string | null; "segment_at_close": string | null; "cycle_days": number | null; "estimated_ticket_cents": number | null; "reason": string | null; "sponsor": string | null; "origin": string | null; "is_synthetic": boolean; };

export type OpportunityCreate = { "external_id": string; "company_id": string; "result": "won" | "lost" | "negotiating"; "closed_on"?: string | null; "segment_at_close"?: string | null; "cycle_days"?: number | null; "estimated_ticket_cents"?: number | null; "reason"?: string | null; "sponsor"?: string | null; "origin"?: string | null; "is_synthetic"?: boolean; };

export type OpportunityPatch = { "expected_version": number; "changes": { "result"?: "won" | "lost" | "negotiating"; "closed_on"?: string | null; "segment_at_close"?: string | null; "cycle_days"?: number | null; "estimated_ticket_cents"?: number | null; "reason"?: string | null; "sponsor"?: string | null; "origin"?: string | null; }; };

export type ArchiveRequest = { "expected_version": number; "archived": boolean; };

export type Dataset = { "id": string; "name": string; "kind": "demo" | "user"; "version": number; "data_revision": number; "default_as_of": string; "created_at": string; "created_by": string; };

export type DatasetCreate = { "name": string; };

export type User = { "id": string; "name": string; "email": string; };

export type LoginRequest = { "email": string; "password": string; };

export type AuthSession = { "user": User; "csrf_token": string; "expires_at": string; };

export type Meta = { "request_id": string; };

export type Pagination = { "page": number; "page_size": number; "total": number; "total_pages": number; };

export type ListMeta = { "request_id": string; "pagination": Pagination; };

export type Error = { "error": { "code": string; "message": string; "field_errors": Array<{ "path": string; "message": string; }>; "details": { [key: string]: unknown; }; }; "request_id": string; };

export type Health = { "status": "ok"; "api_version": string; };

export type RuleConfig = { "schema_version": "1.0.0"; "shared": { "employee_min": number; "employee_max": number; "medium_factor": number; "priority_ufs": Array<"AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO">; "other_region_factor": number; "accepted_renewal_windows": Array<"m0_3" | "m4_6" | "m7_12" | "over_12">; }; "icp": { "threshold": number; "required_criteria": Array<"size" | "hr" | "benefits" | "growth" | "employer_branding" | "geography" | "region" | "retention" | "renewal">; "weights": { "size": number; "hr": number; "benefits": number; "growth": number; "employer_branding": number; "geography": number; "region": number; "retention": number; "renewal": number; }; }; "priority": { "weights": { "S01": number; "S02": number; "S03": number; "S04": number; "S05": number; "S06": number; "S07": number; "S08": number; "S09": number; "S10": number; }; "recent_signal_days": number; "high_threshold": number; "medium_threshold": number; }; "disqualifiers": { "D01": { "enabled": boolean; "min_employees": number; }; "D02": { "enabled": boolean; }; "D03": { "professional_public_only": true; }; "D04": { "enabled": boolean; }; "D05": { "enabled": boolean; "penalty_points": number; }; }; };

export type Ruleset = { "id": string; "dataset_id": string; "version": number; "status": "draft" | "published"; "config": RuleConfig; "created_by": string; "created_at": string; "published_at": string | null; "base_ruleset_id": string | null; };

export type RulesDraftRequest = { "base_ruleset_id": string; "config": RuleConfig; };

export type RulesPublishRequest = { "expected_version": number; "expected_active_ruleset_id": string; };

export type CriterionScore = { "id": string; "factor": number | null; "weight": number; "points": number; "missing": boolean; "reason_code": string; "input_fields": Array<string>; "evidence_ids": Array<string>; };

export type Gate = { "state": "in" | "out" | "pending"; "in_icp": boolean | null; "score_min": number; "score_max": number; "threshold": number; "hard_failures": Array<string>; "unknown_requirements": Array<string>; "criteria": Array<CriterionScore>; };

export type Priority = { "score": number; "score_min": number; "score_max": number; "band": "high" | "medium" | "low"; "status": "preliminary" | "reviewed"; "criteria": Array<CriterionScore>; "applied_penalty": number; "possible_penalty": number; "known_weight": number; "warnings": Array<string>; };

export type Assessment = { "id": string; "company_id": string; "company_version": number; "input_revision": number; "dataset_revision": number; "ruleset_id": string; "as_of": string; "calculated_at": string; "gate": Gate; "priority": Priority | null; };

export type CompanyDetail = { "company": Company; "assessment": Assessment; "pending_suggestions": number; "is_current_customer": boolean; "review_completed_for_input_revision": number | null; };

export type RankingRow = { "rank": number; "company_id": string; "external_id": string; "name": string; "segment": string | null; "uf": "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO" | null; "employees": number | null; "assessment": Assessment; "has_public_channel": boolean; "has_decision_maker": boolean; "pending_suggestions": number; };

export type RankingMeta = { "request_id": string; "pagination": Pagination; "snapshot_id": string; "dataset_revision": number; "ruleset_id": string; "as_of": string; "current_dataset_revision": number; "is_stale": boolean; };

export type EvidenceRef = { "signal_id": string; "signal_version": number; "quote": string; "source_row": number | null; };

export type Suggestion = { "id": string; "dataset_id": string; "company_id": string; "job_id": string; "version": number; "field": "employees" | "uf" | "operates_in_brazil" | "hr_structured" | "has_benefits" | "seeks_benefit_differentiation" | "multi_region" | "growth" | "employer_branding" | "retention_pain" | "renewal_window" | "renewed_24_plus" | "operating_status"; "base_company_version": number; "base_value": string | number | boolean | null; "proposed_value": string | number | boolean | null; "relation": "confirmation" | "contradiction" | "fill" | "inconclusive"; "confidence": "low" | "medium" | "high"; "rationale": string; "evidence": Array<EvidenceRef>; "status": "pending" | "deferred" | "accepted" | "rejected" | "stale"; "can_accept": boolean; "blocked_reason": string | null; "created_at": string; "decided_at": string | null; "decided_by": string | null; };

export type SuggestionDecisionRequest = { "decision": "accept" | "reject" | "defer"; "expected_suggestion_version": number; "expected_company_version": number; "note"?: string | null; };

export type SuggestionDecisionResult = { "suggestion": Suggestion; "company": Company; "assessment": Assessment; };

export type JobCreate = { "company_ids": Array<string>; "scope": "icp_gaps" | "eligible_enrichment"; };

export type Job = { "id": string; "dataset_id": string; "state": "queued" | "running" | "succeeded" | "partial_failed" | "failed" | "cancelled"; "scope": "icp_gaps" | "eligible_enrichment"; "requested_count": number; "processed_count": number; "failed_count": number; "skipped_count": number; "suggestion_count": number; "created_at": string; "started_at": string | null; "finished_at": string | null; "created_by": string; "model": string | null; "prompt_version": string; "errors": Array<{ "company_id": string; "code": string; "message": string; }>; "warnings": Array<{ "company_id": string; "code": string; "message": string; }>; };

export type JobRetryRequest = { "failed_company_ids": Array<string>; };

export type ImportUpload = { "file": string; "target": "workbook" | "companies" | "signals" | "contacts" | "opportunities" | "icp_rules" | "priority_rules" | "disqualifiers"; "merge_policy": "fill_missing" | "overwrite_non_null"; "delimiter"?: "auto" | "comma" | "semicolon"; };

export type ImportIssue = { "sheet": string; "row": number | null; "column": string | null; "code": string; "message": string; "severity": "warning" | "error"; };

export type ImportRowPreview = { "target": string; "external_id": string; "action": "create" | "update" | "skip"; "changed_fields": Array<string>; "before": { [key: string]: unknown; } | null; "after": { [key: string]: unknown; } | null; };

export type ImportPreview = { "id": string; "dataset_id": string; "version": number; "status": "ready" | "invalid" | "committed" | "expired"; "file_name": string; "sha256": string; "target": "workbook" | "companies" | "signals" | "contacts" | "opportunities" | "icp_rules" | "priority_rules" | "disqualifiers"; "merge_policy": "fill_missing" | "overwrite_non_null"; "base_dataset_revision": number; "expires_at": string; "rows_total": number; "rows_create": number; "rows_update": number; "rows_skip": number; "errors_count": number; "warnings_count": number; "creates_rules_draft": boolean; "issues": Array<ImportIssue>; "preview_rows": Array<ImportRowPreview>; };

export type ImportCommitRequest = { "expected_version": number; "expected_dataset_revision": number; "confirm_overwrite": boolean; };

export type ImportCommitResult = { "import_id": string; "status": "committed"; "dataset_revision": number; "created": number; "updated": number; "skipped": number; "rules_draft_id": string | null; };

export type AuditEvent = { "id": string; "dataset_id": string; "entity_type": "company" | "signal" | "contact" | "opportunity" | "ruleset" | "review_decision" | "review_session" | "import"; "entity_id": string; "operation": "create" | "update" | "archive" | "restore" | "publish" | "decision" | "commit" | "event"; "version_before": number | null; "version_after": number; "changed_fields": Array<string>; "before": { [key: string]: unknown; } | null; "after": { [key: string]: unknown; } | null; "actor_user_id": string; "source": "manual" | "import" | "ai_acceptance" | "seed" | "system"; "request_id": string; "import_id": string | null; "suggestion_id": string | null; "occurred_at": string; };

export type ReviewSessionCreate = { "company_id": string; "mode": "manual" | "assisted"; };

export type ReviewSessionEventRequest = { "action": "pause" | "resume" | "complete" | "abandon"; "expected_version": number; "expected_input_revision"?: number; "interrupted"?: boolean; };

export type ReviewSession = { "id": string; "dataset_id": string; "company_id": string; "user_id": string; "mode": "manual" | "assisted"; "version": number; "state": "active" | "paused" | "completed" | "abandoned"; "started_at": string; "last_resumed_at": string | null; "finished_at": string | null; "active_seconds": number; "wall_seconds": number; "input_revision_at_start": number; "input_revision_at_completion": number | null; "timing_quality": "complete" | "interrupted"; };

export type Metrics = { "mode": "manual" | "assisted" | "all"; "completed_sessions": number; "mean_active_seconds": number | null; "median_active_seconds": number | null; "accepted": number; "rejected": number; "pending": number; "acceptance_rate": number | null; "measures": "validation_time_not_web_research"; "warnings": Array<string>; };

export type FieldDescriptor = { "key": string; "label": string; "type": "string" | "integer" | "boolean" | "enum" | "date"; "nullable": boolean; "required_on_create": boolean; "editable": boolean; "allowed_values": Array<string>; "description": string; };

export type SchemaCatalog = { "schema_version": string; "entities": { "company": Array<FieldDescriptor>; "signal": Array<FieldDescriptor>; "contact": Array<FieldDescriptor>; "opportunity": Array<FieldDescriptor>; }; "import_targets": Array<"workbook" | "companies" | "signals" | "contacts" | "opportunities" | "icp_rules" | "priority_rules" | "disqualifiers">; "max_file_bytes": number; "max_import_rows": number; };

export type CompanyResponse = { "data": Company; "meta": Meta; };

export type SignalResponse = { "data": Signal; "meta": Meta; };

export type ContactResponse = { "data": Contact; "meta": Meta; };

export type OpportunityResponse = { "data": Opportunity; "meta": Meta; };

export type DatasetResponse = { "data": Dataset; "meta": Meta; };

export type UserResponse = { "data": User; "meta": Meta; };

export type AuthSessionResponse = { "data": AuthSession; "meta": Meta; };

export type PaginationResponse = { "data": Pagination; "meta": Meta; };

export type HealthResponse = { "data": Health; "meta": Meta; };

export type RuleConfigResponse = { "data": RuleConfig; "meta": Meta; };

export type RulesetResponse = { "data": Ruleset; "meta": Meta; };

export type CriterionScoreResponse = { "data": CriterionScore; "meta": Meta; };

export type GateResponse = { "data": Gate; "meta": Meta; };

export type PriorityResponse = { "data": Priority; "meta": Meta; };

export type AssessmentResponse = { "data": Assessment; "meta": Meta; };

export type CompanyDetailResponse = { "data": CompanyDetail; "meta": Meta; };

export type RankingRowResponse = { "data": RankingRow; "meta": Meta; };

export type EvidenceRefResponse = { "data": EvidenceRef; "meta": Meta; };

export type SuggestionResponse = { "data": Suggestion; "meta": Meta; };

export type SuggestionDecisionResultResponse = { "data": SuggestionDecisionResult; "meta": Meta; };

export type JobResponse = { "data": Job; "meta": Meta; };

export type ImportIssueResponse = { "data": ImportIssue; "meta": Meta; };

export type ImportRowPreviewResponse = { "data": ImportRowPreview; "meta": Meta; };

export type ImportPreviewResponse = { "data": ImportPreview; "meta": Meta; };

export type ImportCommitResultResponse = { "data": ImportCommitResult; "meta": Meta; };

export type AuditEventResponse = { "data": AuditEvent; "meta": Meta; };

export type ReviewSessionResponse = { "data": ReviewSession; "meta": Meta; };

export type MetricsResponse = { "data": Metrics; "meta": Meta; };

export type FieldDescriptorResponse = { "data": FieldDescriptor; "meta": Meta; };

export type SchemaCatalogResponse = { "data": SchemaCatalog; "meta": Meta; };

export type DatasetListResponse = { "data": Array<Dataset>; "meta": ListMeta; };

export type CompanyListResponse = { "data": Array<Company>; "meta": ListMeta; };

export type SignalListResponse = { "data": Array<Signal>; "meta": ListMeta; };

export type ContactListResponse = { "data": Array<Contact>; "meta": ListMeta; };

export type OpportunityListResponse = { "data": Array<Opportunity>; "meta": ListMeta; };

export type SuggestionListResponse = { "data": Array<Suggestion>; "meta": ListMeta; };

export type AuditEventListResponse = { "data": Array<AuditEvent>; "meta": ListMeta; };

export type ImportIssueListResponse = { "data": Array<ImportIssue>; "meta": ListMeta; };

export type ReviewSessionListResponse = { "data": Array<ReviewSession>; "meta": ListMeta; };

export type RankingResponse = { "data": Array<RankingRow>; "meta": RankingMeta; };
