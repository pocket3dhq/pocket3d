import './global.scss';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { ReactNode } from 'react';

// Self-hosted by next/font at build time: browsers never ask Google for them
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'pocket3d',
  description:
    'Publish a 3D model from your terminal or AI agent and get a link anyone can open.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // a meta value, not CSS: the same as --p3d-bg in colors.scss
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="bg-bg text-textColor font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
