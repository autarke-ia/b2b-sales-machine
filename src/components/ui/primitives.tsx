/**
 * Primitivos estilo shadcn/ui, vendados no repo e temados pelos tokens Autarkeia
 * (decisão F1/F6): radius-0, hairlines, sem sombra; hover por shift de superfície.
 */
"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-ink-fg border-ink hover:opacity-85",
  secondary: "bg-transparent text-fg border-line hover:bg-hover",
  ghost: "bg-transparent text-muted border-transparent hover:bg-hover hover:text-fg",
  danger: "bg-transparent text-bad-fg border-bad/40 hover:bg-tint-bad",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 border px-3 py-1.5 text-[var(--text-sm)] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-8 w-full border border-line bg-panel px-2.5 text-[var(--text-sm)] text-fg placeholder:text-faint focus-visible:outline-2 focus-visible:outline-[var(--focus)] focus-visible:outline-offset-1 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-8 border border-line bg-panel px-2 text-[var(--text-sm)] text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type Tone = "ok" | "wait" | "bad" | "ia" | "broken" | "neutral";

const tones: Record<Tone, string> = {
  ok: "text-ok-fg bg-tint-ok",
  wait: "text-wait-fg bg-tint-wait",
  bad: "text-bad-fg bg-tint-bad",
  ia: "text-ia-fg bg-tint-ia",
  broken: "text-broken-fg bg-tint-broken",
  neutral: "text-muted bg-hover",
};

export function Badge({ tone = "neutral", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={`inline-flex items-center px-2 py-0.5 text-[var(--text-2xs)] font-medium leading-4 ${tones[tone]} ${className}`} {...props} />;
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border border-dashed border-line px-6 py-10 text-center">
      <p className="text-[var(--text-base)] text-fg">{title}</p>
      {hint ? <p className="max-w-md text-[var(--text-xs)] text-muted">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-bad/30 bg-tint-bad px-6 py-8 text-center" role="alert">
      <p className="text-[var(--text-sm)] text-bad-fg">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-10 text-[var(--text-sm)] text-muted" aria-busy="true">
      <span className="inline-block size-3 animate-spin border-2 border-line border-t-ink" />
      {label}
    </div>
  );
}
