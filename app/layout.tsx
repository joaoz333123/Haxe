import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rateio Fácil - Acerto de Contas',
  description: 'Aplicativo de rateio de despesas e acerto de contas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
