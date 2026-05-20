"use client";

import Modal from "./Modal";
import { AlertTriangle, Info } from "lucide-react";

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
};

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  variant = "warning",
  loading = false,
}: ConfirmModalProps) {
  const icon =
    variant === "danger" ? (
      <AlertTriangle className="text-red-600 shrink-0" size={22} />
    ) : variant === "info" ? (
      <Info className="text-blue-600 shrink-0" size={22} />
    ) : (
      <AlertTriangle className="text-amber-600 shrink-0" size={22} />
    );

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : variant === "info"
        ? "bg-blue-600 hover:bg-blue-700"
        : "bg-amber-600 hover:bg-amber-700";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      scrollBody={false}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-white font-medium disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? "İşleniyor…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex gap-3">
        {icon}
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
