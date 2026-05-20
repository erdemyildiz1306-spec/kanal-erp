"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { primaryNav, isNavActive } from "@/lib/navigation";

type Props = {
  onOpenMore: () => void;
};

export default function MobileBottomNav({ onOpenMore }: Props) {
  const pathname = usePathname();

  return (
      <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--erp-border)] bg-[var(--erp-nav)] backdrop-blur-xl"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Ana menü"
    >
      <div className="grid grid-cols-6 items-end px-0.5 pt-1">
        {primaryNav.map((item) => {
          const active = isNavActive(pathname, item.href);
          const isScanner = item.href === "/scanner";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3rem] min-w-[3rem] ${
                isScanner ? "-mt-3" : ""
              }`}
            >
              {isScanner ? (
                <span
                  className={`flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg ${
                    active
                      ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]"
                      : "bg-[var(--erp-accent)] text-white dark:text-[#0f1210] ring-4 ring-[var(--erp-bg)]"
                  }`}
                >
                  <item.icon size={26} strokeWidth={2} />
                </span>
              ) : (
                <>
                  <item.icon
                    size={22}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={active ? "text-[var(--erp-accent)]" : "text-[var(--erp-text-muted)]"}
                  />
                  <span
                    className={`text-[11px] font-semibold leading-none ${
                      active ? "text-[var(--erp-accent)]" : "text-[var(--erp-text-muted)]"
                    }`}
                  >
                    {item.shortLabel ?? item.name}
                  </span>
                </>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center gap-0.5 py-2 touch-target-sm text-[var(--erp-text-muted)]"
          aria-label="Diğer menü"
        >
          <Menu size={22} />
          <span className="text-[10px] font-semibold leading-none">Menü</span>
        </button>
      </div>
    </nav>
  );
}
