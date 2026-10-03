import fieldCatalog from "../../../contracts/field-catalog.json";

/** Catálogo de campos servido por /schema (doc 01 §4): describe formatos aceitos,
 * não permite criar colunas arbitrárias. Fonte: o próprio contrato do pacote. */
export function fieldCatalogData(): Record<string, unknown> {
  return fieldCatalog as unknown as Record<string, unknown>;
}
