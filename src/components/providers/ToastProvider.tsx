"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastInput = {
  kind?: ToastKind;
  title: string;
  message?: string;
  duration?: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const kindStyles: Record<ToastKind, string> = {
  success: "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/90 dark:border-emerald-500/40",
  error: "border-red-500/30 bg-red-50 dark:bg-red-950/90 dark:border-red-500/40",
  info: "border-blue-500/30 bg-blue-50 dark:bg-blue-950/90 dark:border-blue-500/40",
};

const kindIcon: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const item: ToastItem = {
        id,
        kind: input.kind ?? "info",
        title: input.title,
        message: input.message,
      };
      setItems((prev) => [...prev.slice(-2), item]);
      const duration = input.duration ?? 4000;
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast,
      success: (title: string, message?: string) =>
        toast({ kind: "success", title, message }),
      error: (title: string, message?: string) =>
        toast({ kind: "error", title, message }),
      info: (title: string, message?: string) =>
        toast({ kind: "info", title, message }),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[300] flex flex-col items-center gap-2 px-4 pointer-events-none md:bottom-6 md:items-end md:pr-4"
        aria-live="polite"
      >
        {items.map((item) => {
          const Icon = kindIcon[item.kind];
          return (
            <div
              key={item.id}
              className={`pointer-events-auto w-full max-w-sm animate-toast-in rounded-2xl border shadow-lg backdrop-blur-md px-4 py-3 flex items-start gap-3 ${kindStyles[item.kind]}`}
            >
              <Icon size={20} className="shrink-0 mt-0.5 text-[var(--erp-accent)]" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-[var(--erp-text)]">{item.title}</p>
                {item.message ? (
                  <p className="text-xs text-[var(--erp-text-muted)] mt-0.5">{item.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 p-1.5 rounded-lg text-[var(--erp-text-muted)] hover:bg-black/5 dark:hover:bg-white/10 touch-target-sm"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
