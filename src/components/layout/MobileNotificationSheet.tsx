"use client";

import { Bell, X } from "lucide-react";

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "order" | "stock" | "info" | "order-event";
  read?: boolean;
  url?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: NotificationItem[];
  unread: number;
  loadStatus: "idle" | "loading" | "ok" | "err";
  actionBusy: string | null;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
};

export default function MobileNotificationSheet({
  open,
  onClose,
  items,
  unread,
  loadStatus,
  actionBusy,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onDelete,
}: Props) {
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[130] animate-fade-in">
      <div className="absolute inset-0 bg-[var(--erp-bg)] flex flex-col">
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--erp-border)] bg-[var(--erp-header)]"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Bell size={20} className="text-[var(--erp-accent)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--erp-text)]">Bildirimler</h2>
              {unread > 0 ? (
                <p className="text-xs erp-muted">{unread} okunmamış</p>
              ) : (
                <p className="text-xs erp-muted">Tümü okundu</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unread > 0 ? (
              <button
                type="button"
                disabled={actionBusy === "all"}
                onClick={() => void onMarkAllRead()}
                className="text-xs font-semibold text-[var(--erp-accent)] px-3 py-2 rounded-lg bg-[var(--erp-accent-soft)] disabled:opacity-50"
              >
                Tümünü okundu
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="touch-target-sm rounded-xl border border-[var(--erp-border)] flex items-center justify-center"
              aria-label="Kapat"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {loadStatus === "loading" && items.length === 0 ? (
            <p className="text-sm erp-muted text-center py-10">Yükleniyor…</p>
          ) : items.length === 0 ? (
            <p className="text-sm erp-muted text-center py-10">Gösterilecek bildirim yok.</p>
          ) : (
            items.map((n) => (
              <article
                key={n.id}
                className={`erp-card p-4 ${n.read ? "opacity-85" : "ring-1 ring-[var(--erp-accent)]/30"}`}
              >
                <button
                  type="button"
                  className={`w-full text-left ${n.url ? "cursor-pointer" : "cursor-default"}`}
                  onClick={() => {
                    if (n.url) onOpen(n);
                  }}
                >
                  <p className={`font-semibold text-[var(--erp-text)] ${n.read ? "erp-muted" : ""}`}>
                    {n.title}
                  </p>
                  <p className="text-sm erp-muted mt-1 leading-snug">{n.detail}</p>
                  {n.time ? <p className="text-[11px] erp-muted mt-2">{n.time}</p> : null}
                </button>

                {n.kind !== "info" ? (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--erp-border)]">
                    {!n.read ? (
                      <button
                        type="button"
                        disabled={actionBusy === n.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onMarkRead(n.id);
                        }}
                        className="erp-btn erp-btn-secondary text-sm py-2.5 flex-1 min-w-[7rem]"
                      >
                        Okundu
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={actionBusy === `del-${n.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDelete(n.id);
                      }}
                      className="erp-btn erp-btn-ghost text-sm py-2.5 text-red-600 flex-1 min-w-[7rem]"
                    >
                      Sil
                    </button>
                    {n.url ? (
                      <button
                        type="button"
                        onClick={() => onOpen(n)}
                        className="erp-btn erp-btn-primary text-sm py-2.5 w-full"
                      >
                        Siparişe git
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
