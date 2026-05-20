"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { secondaryNav, isNavActive } from "@/lib/navigation";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Moon, Sun, Monitor } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function MobileMoreSheet({ open, onClose }: Props) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[120] animate-fade-in">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t border-[var(--erp-border)] bg-[var(--erp-surface)] animate-slide-up overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--erp-border)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--erp-text-muted)]">
              Diğer
            </p>
            <h2 className="text-lg font-bold text-[var(--erp-text)]">Menü & Ayarlar</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target-sm rounded-xl border border-[var(--erp-border)] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 grid grid-cols-2 gap-2">
          {secondaryNav.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`erp-card flex flex-col items-start gap-2 p-4 min-h-[5.5rem] ${
                  active ? "ring-2 ring-[var(--erp-accent)]" : ""
                }`}
              >
                <item.icon size={22} className="text-[var(--erp-accent)]" />
                <span className="font-semibold text-sm text-[var(--erp-text)]">{item.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="px-4 py-4 border-t border-[var(--erp-border)]">
          <p className="text-xs font-semibold text-[var(--erp-text-muted)] mb-2">Görünüm</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "light" as const, label: "Açık", icon: Sun },
                { id: "dark" as const, label: "Koyu", icon: Moon },
                { id: "system" as const, label: "Sistem", icon: Monitor },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`erp-btn erp-btn-ghost text-sm py-3 ${
                  theme === opt.id ? "ring-2 ring-[var(--erp-accent)]" : ""
                }`}
              >
                <opt.icon size={16} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
