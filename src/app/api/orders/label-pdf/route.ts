import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Order from "@/models/Order";
import { resolveSingletonSettingDocument } from "@/lib/erp-settings";
import { requireSession } from "@/lib/auth";
import { buildPackageLabelPdf } from "@/lib/package-label-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = requireSession(request);
    if (auth instanceof Response) return auth;

    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Siparis ID gerekli." }, { status: 400 });
    }

    const order = await Order.findById(id).lean();
    if (!order) {
      return NextResponse.json({ success: false, error: "Siparis bulunamadi." }, { status: 404 });
    }

    const settingsDoc = await resolveSingletonSettingDocument();
    const pdfBytes = await buildPackageLabelPdf(
      order as Parameters<typeof buildPackageLabelPdf>[0],
      {
        storeName: String(settingsDoc.get("storeName") ?? "").trim() || "Stok ERP",
        printPackageContents: settingsDoc.get("printPackageContents") !== false,
      }
    );

    const orderNo = String(order.orderNumber ?? id).replace(/[^\w\-]+/g, "_");
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="paket-${orderNo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PDF olusturulamadi";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
