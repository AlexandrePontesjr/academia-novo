'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Um link da navegação do shell: o da rota aberta fica no acento (AC 4). */
export function NavLink({ href, prefetch, children }: { href: string; prefetch?: false; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      {...(prefetch === false ? { prefetch: false } : {})}
      className={active ? 'text-primary' : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
