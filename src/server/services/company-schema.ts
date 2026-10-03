import { z } from "zod";

/** Campos de cadastro editáveis por PATCH (doc 01 §2.1). Identidade, autoria,
 * versões e is_synthetic são server-side — nunca aceitos do cliente (INV-3). */
export const patchChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "domínio sem protocolo/caminho").max(253).nullish(),
    segment: z.string().trim().min(1).max(120).nullish(),
    employees: z.number().int().min(0).nullish(),
    uf: z.enum(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]).nullish(),
    operates_in_brazil: z.boolean().nullish(),
    hr_structured: z.boolean().nullish(),
    has_benefits: z.boolean().nullish(),
    seeks_benefit_differentiation: z.boolean().nullish(),
    multi_region: z.boolean().nullish(),
    growth: z.enum(["low", "medium", "high"]).nullish(),
    employer_branding: z.enum(["low", "medium", "high"]).nullish(),
    retention_pain: z.enum(["low", "medium", "high"]).nullish(),
    renewal_window: z.enum(["m0_3", "m4_6", "m7_12", "over_12"]).nullish(),
    renewed_24_plus: z.boolean().nullish(),
    operating_status: z.enum(["active", "inactive", "unknown"]).nullish(),
    source_label: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();

export const patchBodySchema = z
  .object({
    expected_version: z.number().int().min(1),
    changes: patchChangesSchema,
  })
  .strict();

export const archiveBodySchema = z
  .object({ archived: z.boolean(), expected_version: z.number().int().min(1) })
  .strict();

export type PatchChanges = z.infer<typeof patchChangesSchema>;
