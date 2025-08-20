import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

// Load Inter font with Turbopack compatibility
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // Add fallback font to prevent layout shifts
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Ocean Integrity AI Accounting',
  description: 'AI-powered PDF data extraction for accounting',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head />
      <body className={`${inter.variable} font-sans`}>
        <div
          data-wrapper=''
          className='border-grid flex flex-1 flex-col min-h-screen'
        >
          <SiteHeader />
          <main className='flex flex-1 flex-col'>{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
