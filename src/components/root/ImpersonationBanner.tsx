"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

export default function ImpersonationBanner() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setActive(Boolean(d?.user?.impersonatorId));
      })
      .catch(() => setActive(false));
  }, []);

  if (!active) return null;

  const exit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/root/exit-impersonate", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      window.location.href = data.redirect || "/root";
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <span className="inline-flex items-center gap-2 font-medium">
        <ShieldAlert size={16} />
        Root impersonation aktif — tenant ERP oturumundasınız.
      </span>
      <button
        type="button"
        disabled={loading}
        onClick={() => void exit()}
        className="underline font-semibold hover:no-underline disabled:opacity-50"
      >
        Root panele dön
      </button>
    </div>
  );
}
