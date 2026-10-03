import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { createImportPreview, type ImportTargetName } from "@/server/services/imports";

const TARGETS = new Set(["companies", "signals", "contacts", "opportunities", "icp_rules", "priority_rules", "disqualifiers"]);
const MAX_BYTES = 10 * 1024 * 1024;

/** POST multipart (doc 01 §6): arquivo + target + merge_policy → prévia, nunca grava cadastro. */
export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw badRequest("INVALID_FILE", "Envie multipart/form-data com o arquivo CSV.");
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("INVALID_FILE", "Campo 'file' ausente.");
    if (file.size > MAX_BYTES) throw badRequest("INVALID_FILE", "Arquivo acima de 10 MiB.");
    const target = String(form.get("target") ?? "");
    if (!TARGETS.has(target)) throw validation("target inválido.", [{ field: "target", message: `use um de: ${[...TARGETS].join(", ")}` }]);
    const policyRaw = String(form.get("merge_policy") ?? "fill_missing");
    if (policyRaw !== "fill_missing" && policyRaw !== "overwrite_non_null") {
      throw validation("merge_policy inválido.", [{ field: "merge_policy", message: "fill_missing ou overwrite_non_null" }]);
    }
    const body = await file.text();
    if (!/\.csv$/i.test(file.name) && !contentType.includes("csv")) {
      throw badRequest("INVALID_FILE", "Apenas CSV nesta versão (XLSX chega na próxima onda).");
    }

    const preview = await createImportPreview(dataset, body, file.name, target as ImportTargetName, policyRaw, session.user.id);
    return okJson(preview, {}, rid, 201);
  } catch (e) {
    return errorJson(e, rid);
  }
}
