import './globals.css';
export const metadata = { title: 'MGq Price Admin', description: 'Lista y reglas de precios' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es"><head><link rel="manifest" href="/manifest.webmanifest" /><meta name="theme-color" content="#111827" /></head><body className="min-h-screen">{children}</body></html>);
}