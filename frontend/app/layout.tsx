import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { SiteHeader } from '@/components/SiteHeader';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'PrepKit — AI Interview Prep',
  description: 'Turn a job description into a personalised interview preparation kit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
