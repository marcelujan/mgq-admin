import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MGq Admin',
  description: 'Panel de administración de MGq',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
