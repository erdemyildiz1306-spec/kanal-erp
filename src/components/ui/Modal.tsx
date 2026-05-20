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
  default: "border-[var(--erp-border)] bg-[var(--erp-surface)]",
  violet:
    "border-[var(--erp-border)] bg-gradient-to-r from-violet-50 to-[var(--erp-surface)] dark:from-[var(--erp-surface-2)] dark:to-[var(--erp-surface)]",
  blue:
    "border-[var(--erp-border)] bg-gradient-to-r from-blue-50 to-[var(--erp-surface)] dark:from-[var(--erp-surface-2)] dark:to-[var(--erp-surface)]",
  emerald:
    "border-[var(--erp-border)] bg-gradient-to-r from-emerald-50 to-[var(--erp-surface)] dark:from-[var(--erp-surface-2)] dark:to-[var(--erp-surface)]",
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
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizeClass[size]} bg-[var(--erp-surface)] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[var(--erp-border)] flex flex-col max-h-[min(96dvh,900px)] sm:max-h-[min(92vh,900px)] ${className}`}
      >
        {(title || subtitle || icon) && (
          <div
            className={`shrink-0 px-6 py-4 border-b flex items-start justify-between gap-4 ${toneHeader[tone]}`}
          >
            <div className="min-w-0 flex items-start gap-3">
              {icon ? (
                <div className="p-2 rounded-xl bg-[var(--erp-surface-2)] border border-[var(--erp-border)] shrink-0">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                {title ? (
                  <h3 className="text-lg font-bold text-[var(--erp-text)] truncate">{title}</h3>
                ) : null}
                {subtitle ? (
                  <p className="text-sm erp-muted mt-0.5">{subtitle}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl erp-muted hover:text-[var(--erp-text)] hover:bg-[var(--erp-surface-2)] shrink-0"
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
          <div className="shrink-0 px-6 py-4 border-t border-[var(--erp-border)] bg-[var(--erp-surface-2)] rounded-b-2xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
