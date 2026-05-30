/** Mobil WebView / APK — sunucu PDF veya masaustu yazdirma */

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function prefersMobileLabelExport(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isNativeShell()) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function deliverPdfBlob(blob: Blob, filename: string): Promise<"shared" | "opened" | "downloaded"> {
  const safeName = filename.replace(/[^\w\-]+/g, "_").slice(0, 80) || "paket-etiketi";

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const file = new File([blob], `${safeName}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: safeName });
        return "shared";
      }
    } catch {
      /* devam */
    }
  }

  const url = URL.createObjectURL(blob);

  if (isNativeShell()) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return "opened";
  }

  const opened = window.open(url, "_blank");
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return "opened";
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}

async function fetchServerLabelPdf(orderId: string): Promise<
  | { ok: true; blob: Blob }
  | { ok: false; error: string }
> {
  const res = await fetch(`/api/orders/label-pdf?id=${encodeURIComponent(orderId)}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let error = `Sunucu hatasi (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) error = data.error;
    } catch {
      /* binary body */
    }
    return { ok: false, error };
  }

  const blob = await res.blob();
  if (!blob.size || blob.type !== "application/pdf") {
    return { ok: false, error: "Gecersiz PDF yaniti." };
  }
  return { ok: true, blob };
}

export async function triggerLabelPrint(
  elementId: string,
  filename: string,
  orderId?: string
): Promise<void> {
  if (prefersMobileLabelExport()) {
    if (!orderId) {
      alert("Siparis bilgisi eksik. Onizlemeyi kapatip tekrar deneyin.");
      return;
    }

    const fetched = await fetchServerLabelPdf(orderId);
    if (!fetched.ok) {
      alert(`PDF olusturulamadi: ${fetched.error}`);
      return;
    }

    const method = await deliverPdfBlob(fetched.blob, filename);
    if (method === "shared") return;
    if (method === "opened") {
      alert("PDF acildi. Yazici uygulamasini veya paylas menüsünden tekrar yazdirabilirsiniz.");
      return;
    }
    alert("PDF hazir. Dosyadan acip yazdirabilirsiniz.");
    return;
  }

  const prevTitle = document.title;
  document.title = " ";
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      try {
        window.print();
      } finally {
        window.setTimeout(() => {
          document.title = prevTitle;
        }, 500);
      }
    }, 100);
  });

  void elementId;
}
