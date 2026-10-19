import type { SessionResponse } from '@academia/contracts';
import { CheckInIcon } from '@academia/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { canCheckIn } from '../lib/check-ins.ts';
import { ROLE_LABELS } from '../lib/roles.ts';
import { BottomNav, MoreMenu, SideNav } from './nav.tsx';
import { SignOutButton } from './sign-out-button.tsx';
import { Wordmark } from './wordmark.tsx';

/** As iniciais do avatar: a primeira letra do primeiro e do último nome, em maiúscula (AC 2). */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts.at(-1)![0]! : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * O shell DukFit de quem já entrou (dukfit-app, de-para): no celular, o cabeçalho com avatar e a barra
 * inferior de cinco abas; a partir de 1024 px, a barra lateral com todos os links. `alert` acende o
 * ponto lime do botão de menu (só o painel o passa).
 */
export function Shell({ session, alert, children }: { session: SessionResponse; alert?: string; children: ReactNode }) {
  const { user } = session;
  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      <header className="lg:contents print:hidden">
        <h1 className="max-lg:sr-only print:hidden lg:fixed lg:top-0 lg:left-0 lg:z-40 lg:flex lg:h-20 lg:w-64 lg:items-center lg:px-6">
          <Wordmark />
        </h1>
        <aside
          className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:justify-between lg:border-r lg:bg-card lg:px-4 lg:pt-20 lg:pb-6 print:hidden"
          data-slot="side-nav"
        >
          <SideNav role={user.role} />
          <SignOutButton />
        </aside>
        <div className="flex items-center justify-between gap-4 px-4 pt-6 pb-2 lg:mx-auto lg:max-w-6xl lg:px-8 lg:pt-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-[50%] bg-muted text-sm font-semibold text-foreground"
              data-slot="avatar"
            >
              {initialsOf(user.name)}
            </span>
            <p className="grid">
              <span className="font-semibold">{user.name}</span>
              <span className="text-sm text-muted-foreground">Perfil: {ROLE_LABELS[user.role]}</span>
            </p>
          </div>
          <MoreMenu role={user.role} trigger="header" {...(alert ? { alert } : {})} />
        </div>
        <BottomNav role={user.role} />
      </header>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pt-4 pb-32 lg:px-8 lg:pb-12">{children}</main>
      {canCheckIn(user.role) && (
        <Link
          href="/check-in"
          prefetch={false}
          aria-label="Registrar check-in"
          className="fixed right-4 bottom-28 z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg lg:right-8 lg:bottom-8 print:hidden"
          data-slot="fab"
        >
          <CheckInIcon className="size-6" />
        </Link>
      )}
    </div>
  );
}
