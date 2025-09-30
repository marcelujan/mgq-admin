import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "MGQ Admin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-zinc-900 text-zinc-100">{children}</body>
    </html>
  );
}
