"use client";

import type { LucideIcon } from "lucide-react";

type StatCardTone = "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";

const toneStyles: Record<
  StatCardTone,
  { icon: string; ring: string; value: string }
> = {
  blue: {
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    ring: "border-blue-200 dark:border-blue-900/50",
    value: "text-[var(--erp-text)]",
  },
  emerald: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    ring: "border-emerald-200 dark:border-emerald-900/50",
    value: "text-[var(--erp-text)]",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-900/50",
    value: "text-amber-700 dark:text-amber-300",
  },
  violet: {
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    ring: "border-violet-200 dark:border-violet-900/50",
    value: "text-[var(--erp-text)]",
  },
  rose: {
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    ring: "border-rose-200 dark:border-rose-900/50",
    value: "text-[var(--erp-text)]",
  },
  slate: {
    icon: "bg-[var(--erp-surface-2)] text-[var(--erp-text-muted)]",
    ring: "border-[var(--erp-border)]",
    value: "text-[var(--erp-text)]",
  },
};

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatCardTone;
  className?: string;
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  className = "",
}: StatCardProps) {
  const s = toneStyles[tone];
  return (
    <div className={`erp-card p-5 ${s.ring} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium erp-muted uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${s.value}`}>{value}</p>
          {hint ? <p className="text-xs erp-muted mt-1">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={`p-2.5 rounded-xl shrink-0 ${s.icon}`}>
            <Icon size={20} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
