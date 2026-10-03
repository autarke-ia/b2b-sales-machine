"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorState, Input } from "@/components/ui/primitives";
import { login } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      const back = params.get("retorno");
      router.replace(back && back.startsWith("/") ? back : "/app");
    } catch (err) {
      setError(err instanceof Error && err.message === "UNAUTHENTICATED" ? "Sessão expirada." : (err as { message?: string }).message ?? "Falha no login.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm border border-line bg-panel p-6">
        <div className="eyebrow">Autarkeia · B2B Sales Machine</div>
        <h1 className="mt-3 text-[var(--text-xl)] font-light">Entrar</h1>
        <p className="mt-1 text-[var(--text-xs)] text-muted">Usuários pré-cadastrados do ambiente compartilhado.</p>
        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">E-mail</span>
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--text-xs)] text-muted">Senha</span>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
          </label>
          {error ? <ErrorState message={error} /> : null}
          <Button type="submit" variant="primary" className="w-full py-2" disabled={submitting || !email || !password}>
            {submitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
