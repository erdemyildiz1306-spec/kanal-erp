import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kanal ERP — Trendyol & Web",
  description:
    "Tek depo, çok kullanıcı; stok ERP’den yönetilir. Trendyol ve özel Next.js mağaza entegrasyonu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.className} bg-[#f6f4f0] text-stone-900 antialiased print:bg-white`}>
        {children}
      </body>
    </html>
  );
}
