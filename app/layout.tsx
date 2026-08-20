import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { THEME_BOOT, THEME_DARK_COLOR, THEME_LIGHT_COLOR } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sere",
  description: "Jobs, invoices, payments, and cash for local service businesses.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    title: "Sere",
    capable: true,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_LIGHT_COLOR },
    { media: "(prefers-color-scheme: dark)", color: THEME_DARK_COLOR },
  ],
  width: "device-width",
  initialScale: 1,
  /* Let the page reach under the notch and home indicator; padding handles the rest. */
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="sere-theme" strategy="beforeInteractive">
          {THEME_BOOT}
        </Script>
        {children}
        <Script src="/sere.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
