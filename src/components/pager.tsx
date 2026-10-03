"use client";

import { Button } from "./ui/primitives";

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <span className="mono text-[var(--text-xs)] text-muted">{page} / {totalPages}</span>
      <Button variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Próxima</Button>
    </div>
  );
}
