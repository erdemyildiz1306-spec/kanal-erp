"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
};

type Props = {
  items: Item[];
  openId: string | null;
  onToggle: (id: string) => void;
  renderPanel: (id: string) => ReactNode;
  renderFooter?: (id: string) => ReactNode;
};

export default function MobileAccordion({
  items,
  openId,
  onToggle,
  renderPanel,
  renderFooter,
}: Props) {
  return (
    <div className="lg:hidden space-y-3">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <section key={item.id} className="erp-card overflow-hidden">
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className="w-full flex items-center gap-3 p-4 text-left touch-target-sm"
              aria-expanded={open}
            >
              <div className="shrink-0 p-2.5 rounded-xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--erp-text)]">{item.title}</p>
                {item.subtitle ? (
                  <p className="text-xs erp-muted mt-0.5">{item.subtitle}</p>
                ) : null}
              </div>
              <ChevronDown
                size={22}
                className={`shrink-0 text-[var(--erp-text-muted)] transition-transform duration-200 ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>
            {open ? (
              <div className="border-t border-[var(--erp-border)] p-4 space-y-4 animate-fade-in">
                {renderPanel(item.id)}
                {renderFooter ? renderFooter(item.id) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
