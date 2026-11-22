import './global.scss';
import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'pocket3d',
  description:
    'Publish a 3D model from your terminal or AI agent and get a link anyone can open.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b10',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-textColor font-sans antialiased">{children}</body>
    </html>
  );
}
