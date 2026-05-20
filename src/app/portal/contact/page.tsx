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
      <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <MessageCircle size={20} /> Destek & İletişim
        </h2>
        <p className="text-sm text-violet-200 mt-1">
          Sipariş, ödeme veya ürünler hakkında bizimle iletişime geçin.
        </p>
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
        <div>
          <p className="font-bold text-xl">{contact.storeName}</p>
          {contact.companyLegalTitle ? (
            <p className="text-sm text-violet-300">{contact.companyLegalTitle}</p>
          ) : null}
        </div>

        {contact.companyAddress ? (
          <div className="flex gap-3 text-sm">
            <MapPin size={16} className="text-violet-400 shrink-0 mt-0.5" />
            <p>{contact.companyAddress}</p>
          </div>
        ) : null}

        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className="flex gap-3 text-sm hover:text-violet-200">
            <Phone size={16} className="text-violet-400 shrink-0" />
            {contact.phone}
          </a>
        ) : null}

        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="flex gap-3 text-sm hover:text-violet-200">
            <Mail size={16} className="text-violet-400 shrink-0" />
            {contact.email}
          </a>
        ) : null}

        {contact.whatsapp ? (
          <a
            href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
          >
            WhatsApp ile yaz
          </a>
        ) : null}

        {!contact.phone && !contact.email && !contact.whatsapp ? (
          <p className="text-sm text-violet-300">
            İletişim bilgileri henüz tanımlanmamış. Yönetici Ayarlar bölümünden portal destek alanlarını doldurabilir.
          </p>
        ) : null}
      </div>

      <Link
        href="/portal/orders"
        className="block text-center py-3 rounded-2xl bg-violet-600 font-bold hover:bg-violet-500 transition-colors"
      >
        Sipariş vermek için tıklayın →
      </Link>
    </div>
  );
}
