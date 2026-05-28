"use client";

import { useFcmRegistration } from "@/hooks/useFcmRegistration";

/** Oturum açık ERP kabuğunda native push token kaydı */
export default function FcmBootstrap({ enabled }: { enabled: boolean }) {
  useFcmRegistration(enabled);
  return null;
}
