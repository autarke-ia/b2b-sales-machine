import { z } from "zod";

/** Schemas de escrita dos relacionados (doc 01 §2.2–2.4) — mesmo rigor do
 * company-schema: strict, readonly/autoria rejeitados, null explícito permitido. */
export const signalPatchSchema = z
  .object({
    signal_type: z.string().trim().min(1).max(120).nullish(),
    evidence_text: z.string().trim().min(1).max(6000).nullish(),
    strength: z.enum(["low", "medium", "high"]).nullish(),
    observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data ISO").nullish(),
    source_name: z.string().trim().min(1).max(120).nullish(),
    source_url: z.string().trim().max(2048).nullish(),
    source_allowed: z.boolean().nullish(),
  })
  .strict();

export const signalCreateSchema = z
  .object({
    company_external_id: z.string().trim().min(1),
    external_id: z.string().trim().min(1).max(120),
    signal_type: z.string().trim().min(1).max(120),
    evidence_text: z.string().trim().min(1).max(6000),
    strength: z.enum(["low", "medium", "high"]),
    observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data ISO").nullish(),
    source_name: z.string().trim().min(1).max(120).nullish(),
    source_url: z.string().trim().max(2048).nullish(),
    source_allowed: z.boolean().nullish(),
  })
  .strict();

export const contactPatchSchema = z
  .object({
    full_name: z.string().trim().min(1).max(240).nullish(),
    job_title: z.string().trim().min(1).max(240).nullish(),
    channel_type: z.enum(["institutional_site", "generic_corporate_email", "professional_profile", "corporate_phone", "company_contact_page", "other_public"]).nullish(),
    channel_value: z.string().trim().min(1).max(512).nullish(),
    origin: z.string().trim().min(1).max(120).nullish(),
    decision_maker_identified: z.boolean().nullish(),
    is_professional_public: z.boolean().nullish(),
    source_allowed: z.boolean().nullish(),
  })
  .strict();

export const contactCreateSchema = z
  .object({
    company_external_id: z.string().trim().min(1),
    external_id: z.string().trim().min(1).max(120),
    full_name: z.string().trim().min(1).max(240).nullish(),
    job_title: z.string().trim().min(1).max(240).nullish(),
    channel_type: z.enum(["institutional_site", "generic_corporate_email", "professional_profile", "corporate_phone", "company_contact_page", "other_public"]),
    channel_value: z.string().trim().min(1).max(512),
    origin: z.string().trim().min(1).max(120).nullish(),
    decision_maker_identified: z.boolean().nullish(),
    is_professional_public: z.boolean().nullish(),
    source_allowed: z.boolean().nullish(),
  })
  .strict();

export const opportunityPatchSchema = z
  .object({
    result: z.enum(["won", "lost", "negotiating"]).nullish(),
    closed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data ISO").nullish(),
    segment_at_close: z.string().trim().min(1).max(120).nullish(),
    cycle_days: z.number().int().min(0).nullish(),
    estimated_ticket_cents: z.number().int().min(0).nullish(),
    reason: z.string().trim().min(1).max(600).nullish(),
    sponsor: z.string().trim().min(1).max(240).nullish(),
    origin: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();

export const opportunityCreateSchema = z
  .object({
    company_external_id: z.string().trim().min(1),
    external_id: z.string().trim().min(1).max(120),
    result: z.enum(["won", "lost", "negotiating"]),
    closed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data ISO").nullish(),
    segment_at_close: z.string().trim().min(1).max(120).nullish(),
    cycle_days: z.number().int().min(0).nullish(),
    estimated_ticket_cents: z.number().int().min(0).nullish(),
    reason: z.string().trim().min(1).max(600).nullish(),
    sponsor: z.string().trim().min(1).max(240).nullish(),
    origin: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();

export const versionedBody = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ expected_version: z.number().int().min(1), changes: schema }).strict();
