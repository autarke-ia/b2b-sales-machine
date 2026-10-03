# -*- coding: utf-8 -*-
import io

p = "src/server/services/review.ts"
s = io.open(p, encoding="utf-8").read()

tampered_old = """    if (tampered) {
      await tx.suggestion.update({ where: { id: suggestionId }, data: { state: "stale", version: { increment: 1 }, updated_at: new Date(), updated_by: userId } });
      throw conflict("SUGGESTION_STALE", `O campo ${sugg.field} mudou após a análise. Reanalise.`, { field: sugg.field });
    }"""
tampered_new = """    if (tampered) {
      await markStale(suggestionId, userId);
      throw conflict("SUGGESTION_STALE", `O campo ${sugg.field} mudou após a análise. Reanalise.`, { field: sugg.field });
    }"""
assert tampered_old in s, "tampered anchor"
s = s.replace(tampered_old, tampered_new)

evidence_old = """        await tx.suggestion.update({ where: { id: suggestionId }, data: { state: "stale", version: { increment: 1 }, updated_at: new Date(), updated_by: userId } });
        throw conflict("SUGGESTION_STALE", "A evidência citada mudou ou foi arquivada. Reanalise.", { signal_id: ev.signal_id });"""
evidence_new = """        await markStale(suggestionId, userId);
        throw conflict("SUGGESTION_STALE", "A evidência citada mudou ou foi arquivada. Reanalise.", { signal_id: ev.signal_id });"""
assert evidence_old in s, "evidence anchor"
s = s.replace(evidence_old, evidence_new)

helper = """/** Transição -> stale persistida em transação PRÓPRIA: o throw de SUGGESTION_STALE
 * na transação principal reverteria a marcação se compartilhassem o escopo. */
async function markStale(suggestionId: string, userId: string): Promise<void> {
  await prisma.suggestion.update({ where: { id: suggestionId }, data: { state: "stale", version: { increment: 1 }, updated_at: new Date(), updated_by: userId } });
}

export function suggestionDto("""
assert "export function suggestionDto(" in s
s = s.replace("export function suggestionDto(", helper, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("markStale ok")
