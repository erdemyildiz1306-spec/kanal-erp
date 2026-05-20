import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppProviders from "@/components/providers/AppProviders";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Kanal ERP — Trendyol & Web",
  description:
    "Tek depo, çok kullanıcı; stok ERP'den yönetilir. Trendyol ve özel Next.js mağaza entegrasyonu.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kanal ERP",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4a5d45" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://erp-stok.vercel.app" />
        <link rel="dns-prefetch" href="https://erp-stok.vercel.app" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='kanal-erp-theme',t=localStorage.getItem(k),d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${inter.className} bg-[var(--erp-bg)] text-[var(--erp-text)] antialiased print:bg-white`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
