import '@academia/ui/globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

// A grotesca da referência, self-hosted para o `font-src 'self'` do CSP (AD-091, door 2).
const manrope = localFont({
  src: '../fonts/manrope-variable.woff2',
  weight: '400 800',
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gestão de Academia',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
