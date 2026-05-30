/** Mobil WebView / APK — etiket PDF ve paylaşım (html2canvas + jsPDF) */

const STYLE_PROPS = [
  "color",
  "background-color",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "display",
  "flex-direction",
  "align-items",
  "justify-content",
  "gap",
  "grid-template-columns",
  "text-align",
  "line-height",
  "letter-spacing",
  "text-transform",
  "overflow",
  "box-sizing",
  "object-fit",
  "vertical-align",
] as const;

/** Tailwind v4 lab() renkleri html2canvas'ta patlar — kaynak DOM'dan rgb inline kopyala */
function applyInlineStylesFromSource(source: Element, target: Element) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

  const computed = window.getComputedStyle(source);
  for (const prop of STYLE_PROPS) {
    const val = computed.getPropertyValue(prop);
    if (val && val !== "none" && val !== "auto") {
      target.style.setProperty(prop, val);
    }
  }

  if (target.tagName === "SVG" || source.tagName === "SVG") {
    target.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const sourceKids = source.children;
  const targetKids = target.children;
  for (let i = 0; i < sourceKids.length && i < targetKids.length; i++) {
    applyInlineStylesFromSource(sourceKids[i]!, targetKids[i]!);
  }
}

function stripStylesheets(clonedDoc: Document) {
  clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    node.parentNode?.removeChild(node);
  });
}

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
  const opened = window.open(url, "_blank");
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

export async function exportLabelElementAsPdf(
  sourceElement: HTMLElement,
  filename: string
): Promise<
  | { ok: true; method: "shared" | "opened" | "downloaded" }
  | { ok: false; error: string }
> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(sourceElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc, clonedElement) => {
        stripStylesheets(clonedDoc);
        clonedElement.style.background = "#ffffff";
        clonedElement.style.color = "#000000";
        applyInlineStylesFromSource(sourceElement, clonedElement);
      },
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

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

    const blob = pdf.output("blob");
    const method = await deliverPdfBlob(blob, filename);
    return { ok: true, method };
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
      alert(`PDF oluşturulamadı: ${result.error}`);
      return;
    }
    if (result.method === "shared") return;
    if (result.method === "opened") {
      alert("PDF açıldı. Sağ üstten yazıcı simgesiyle veya «Yazdır» ile çıktı alabilirsiniz.");
      return;
    }
    alert("PDF indirildi. Dosya yöneticisinden açıp yazdırabilirsiniz.");
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
}
