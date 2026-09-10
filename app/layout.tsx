import type { Metadata } from 'next';
import { Geist, Source_Sans_3, DM_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-geist',
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-source-sans',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Fireground', template: '%s | Fireground' },
  description: 'Built at the OpenAI GPT-6 Astra Hackathon.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fireground.meerkatops.app'),
  openGraph: {
    title: 'Fireground',
    description: 'Built at the OpenAI GPT-6 Astra Hackathon.',
    url: 'https://fireground.meerkatops.app',
    siteName: 'Fireground',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${sourceSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
