import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sere",
  description: "Jobs, invoices, payments, and cash for HVAC shops.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="/sere.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
