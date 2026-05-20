"use client";

import type { LucideIcon } from "lucide-react";

type StatCardTone = "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";

const toneStyles: Record<
  StatCardTone,
  { icon: string; ring: string; value: string }
> = {
  blue: { icon: "bg-blue-50 text-blue-600", ring: "border-blue-100", value: "text-slate-900" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", ring: "border-emerald-100", value: "text-slate-900" },
  amber: { icon: "bg-amber-50 text-amber-600", ring: "border-amber-100", value: "text-amber-700" },
  violet: { icon: "bg-violet-50 text-violet-600", ring: "border-violet-100", value: "text-slate-900" },
  rose: { icon: "bg-rose-50 text-rose-600", ring: "border-rose-100", value: "text-slate-900" },
  slate: { icon: "bg-slate-100 text-slate-600", ring: "border-slate-100", value: "text-slate-900" },
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
    <div
      className={`bg-white rounded-2xl border ${s.ring} p-5 shadow-sm hover:shadow-md transition-shadow ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${s.value}`}>{value}</p>
          {hint ? <p className="text-xs text-slate-400 mt-1">{hint}</p> : null}
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
