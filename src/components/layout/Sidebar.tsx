"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNav, secondaryNav, isNavActive } from "@/lib/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const menuItems = [...primaryNav, ...secondaryNav];

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--erp-sidebar)] text-[#e8e4df] border-r border-[#2f3832]">
      <div className="flex shrink-0 items-center justify-center h-[4.25rem] border-b border-[#323d36] px-3">
        <div className="text-center select-none">
          <h1 className="text-lg font-semibold tracking-wide text-[#f7f5f3]">
            Kanal<span className="text-[#c4d4c8] font-bold">ERP</span>
          </h1>
          <p className="text-[11px] text-[#98a099] mt-0.5">Trendyol · Mağaza</p>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {menuItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-colors ${
                    active
                      ? "bg-[#49564d] text-white shadow-inner"
                      : "text-[#c9c5c0] hover:bg-[#464f48] hover:text-white"
                  }`}
                >
                  <item.icon size={18} strokeWidth={1.75} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="shrink-0 p-4 border-t border-[#323d36] text-[11px] text-center text-[#7e877f] leading-relaxed">
        Yumuşak kontrast · Stok tek depo
      </div>
    </div>
  );
}
