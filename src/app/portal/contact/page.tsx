"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Phone, Mail, MapPin } from "lucide-react";

export default function PortalContactPage() {
  const [contact, setContact] = useState({
    storeName: "KanalERP",
    companyLegalTitle: "",
    companyAddress: "",
    phone: "",
    email: "",
    whatsapp: "",
  });

  useEffect(() => {
    void fetch("/api/portal/contact")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.contact) setContact(d.contact);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="erp-card p-5">
        <h2 className="font-bold text-lg flex items-center gap-2 text-[var(--erp-text)]">
          <MessageCircle size={20} className="text-[var(--erp-accent)]" /> Destek & İletişim
        </h2>
        <p className="text-sm erp-muted mt-1">
          Sipariş, ödeme veya ürünler hakkında bizimle iletişime geçin.
        </p>
      </div>

      <div className="erp-card p-5 space-y-4">
        <div>
          <p className="font-bold text-xl text-[var(--erp-text)]">{contact.storeName}</p>
          {contact.companyLegalTitle ? (
            <p className="text-sm erp-muted">{contact.companyLegalTitle}</p>
          ) : null}
        </div>

        {contact.companyAddress ? (
          <div className="flex gap-3 text-sm">
            <MapPin size={16} className="text-[var(--erp-accent)] shrink-0 mt-0.5" />
            <p>{contact.companyAddress}</p>
          </div>
        ) : null}

        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className="flex gap-3 text-sm hover:text-[var(--erp-accent)]">
            <Phone size={16} className="text-[var(--erp-accent)] shrink-0" />
            {contact.phone}
          </a>
        ) : null}

        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="flex gap-3 text-sm hover:text-[var(--erp-accent)]">
            <Mail size={16} className="text-[var(--erp-accent)] shrink-0" />
            {contact.email}
          </a>
        ) : null}

        {contact.whatsapp ? (
          <a
            href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="erp-btn erp-btn-primary inline-flex"
          >
            WhatsApp ile yaz
          </a>
        ) : null}

        {!contact.phone && !contact.email && !contact.whatsapp ? (
          <p className="text-sm erp-muted">
            İletişim bilgileri henüz tanımlanmamış. Yönetici Ayarlar bölümünden portal destek alanlarını doldurabilir.
          </p>
        ) : null}
      </div>

      <Link href="/portal/orders" className="erp-btn erp-btn-secondary w-full">
        Sipariş vermek için tıklayın →
      </Link>
    </div>
  );
}
