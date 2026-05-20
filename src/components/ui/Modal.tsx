"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClass: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1200px)]",
};

type ModalTone = "default" | "violet" | "blue" | "emerald";

const toneHeader: Record<ModalTone, string> = {
  default: "border-slate-100",
  violet: "border-violet-100 bg-gradient-to-r from-violet-50 to-white",
  blue: "border-blue-100 bg-gradient-to-r from-blue-50 to-white",
  emerald: "border-emerald-100 bg-gradient-to-r from-emerald-50 to-white",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Alt kısım sabit, gövde kaydırılabilir */
  scrollBody?: boolean;
  className?: string;
  tone?: ModalTone;
  icon?: ReactNode;
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  scrollBody = true,
  className = "",
  tone = "default",
  icon,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizeClass[size]} bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col max-h-[min(92vh,900px)] ${className}`}
      >
        {(title || subtitle || icon) && (
          <div
            className={`shrink-0 px-6 py-4 border-b flex items-start justify-between gap-4 ${toneHeader[tone]}`}
          >
            <div className="min-w-0 flex items-start gap-3">
              {icon ? (
                <div className="p-2 rounded-xl bg-white/80 border border-slate-100 shadow-sm shrink-0">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                {title ? (
                  <h3 className="text-lg font-bold text-slate-900 truncate">{title}</h3>
                ) : null}
                {subtitle ? (
                  <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div
          className={
            scrollBody
              ? "flex-1 overflow-y-auto px-6 py-5 min-h-0"
              : "flex-1 px-6 py-5 min-h-0 overflow-hidden flex flex-col"
          }
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50/80 rounded-b-2xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
