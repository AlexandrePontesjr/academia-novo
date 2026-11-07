'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Os três lugares em que um link do menu aparece: a barra inferior, a lateral e o menu "Mais". */
export type NavVariant = 'tab' | 'side' | 'menu';

const VARIANTS: Record<NavVariant, string> = {
  // a aba da referência: só o ícone, o texto fica para a leitura de tela
  tab: 'flex size-12 items-center justify-center rounded-full text-muted-foreground',
  side: 'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground',
  menu: 'flex items-center gap-3 rounded-full px-4 py-3 text-foreground hover:bg-muted',
};

/** Um link do menu: o da rota aberta fica com o fundo em camadas e o ícone no acento (dukfit-app, AC 5). */
export function NavLink({
  href,
  prefetch,
  icon,
  variant = 'side',
  children,
}: {
  href: string;
  prefetch?: false;
  icon?: ReactNode;
  variant?: NavVariant;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      {...(prefetch === false ? { prefetch: false } : {})}
      className={`${VARIANTS[variant]}${active ? ' bg-muted text-foreground' : ''}`}
      aria-current={active ? 'page' : undefined}
      data-variant={variant}
    >
      {icon && (
        <span className={active ? 'text-primary' : undefined} data-slot="nav-icon">
          {icon}
        </span>
      )}
      <span className={variant === 'tab' ? 'sr-only' : undefined}>{children}</span>
    </Link>
  );
}
