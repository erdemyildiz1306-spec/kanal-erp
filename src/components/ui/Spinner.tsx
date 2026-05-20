"use client";

import { Loader2 } from "lucide-react";

type Props = {
  label?: string;
  className?: string;
  size?: number;
};

export default function Spinner({ label = "Yükleniyor…", className = "", size = 28 }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}>
      <Loader2
        size={size}
        className="animate-spin text-[var(--erp-accent)]"
        aria-hidden
      />
      <p className="text-sm erp-muted font-medium">{label}</p>
    </div>
  );
}
