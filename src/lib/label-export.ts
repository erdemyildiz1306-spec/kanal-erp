/** Mobil WebView / APK — window.print() yerine PDF indirme veya paylaşım */

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

export async function exportLabelElementAsPdf(
  element: HTMLElement,
  filename: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
    const renderWidth = imgWidth * ratio;
    const renderHeight = imgHeight * ratio;
    const x = (pageWidth - renderWidth) / 2;
    const y = margin;

    pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);

    const safeName = filename.replace(/[^\w\-]+/g, "_").slice(0, 80) || "paket-etiketi";
    const blob = pdf.output("blob");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const file = new File([blob], `${safeName}.pdf`, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: safeName,
          });
          return { ok: true };
        }
      } catch {
        /* indirmeye düş */
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}.pdf`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF oluşturulamadı";
    return { ok: false, error: message };
  }
}

export async function triggerLabelPrint(elementId: string, filename: string): Promise<void> {
  if (prefersMobileLabelExport()) {
    const el = document.getElementById(elementId);
    if (!el) {
      alert("Etiket önizlemesi bulunamadı.");
      return;
    }
    const result = await exportLabelElementAsPdf(el, filename);
    if (!result.ok) {
      alert(`PDF oluşturulamadı: ${result.error}\n\nMasaüstünde Ctrl+P ile yazdırmayı deneyin.`);
    }
    return;
  }

  requestAnimationFrame(() => {
    window.setTimeout(() => window.print(), 100);
  });
}
