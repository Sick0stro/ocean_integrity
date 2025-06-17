import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Ocean Integrity AI Accounting",
  description: "AI-powered PDF data extraction for accounting",
};
const inter = Inter({ subsets: ["latin"] });

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={inter.className}>
        <div data-wrapper="" className="border-grid flex flex-1 flex-col min-h-screen">
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}


