import type { SessionResponse } from '@academia/contracts';
import type { ReactNode } from 'react';
import { canCheckIn } from '../lib/check-ins.ts';
import { canReadPayments } from '../lib/payments.ts';
import { canReadPlans } from '../lib/plans.ts';
import { ROLE_LABELS } from '../lib/roles.ts';
import { canAccessStaff } from '../lib/staff.ts';
import { NavLink } from './nav-link.tsx';
import { SignOutButton } from './sign-out-button.tsx';

/** Cabeçalho comum às páginas de quem já entrou: quem é, o perfil, a navegação e a saída. */
export function Shell({ session, children }: { session: SessionResponse; children: ReactNode }) {
  const { user } = session;
  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card pb-4">
        <div>
          <h1 className="text-xl font-semibold">Gestão de Academia</h1>
          <p className="text-sm text-muted-foreground">
            <span>{user.name}</span> · <span>{ROLE_LABELS[user.role]}</span>
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <NavLink href="/">Início</NavLink>
          <NavLink href="/students">Alunos</NavLink>
          {canCheckIn(user.role) && (
            <NavLink href="/check-in" prefetch={false}>
              Check-in
            </NavLink>
          )}
          {canCheckIn(user.role) && (
            <NavLink href="/check-ins" prefetch={false}>
              Presenças
            </NavLink>
          )}
          {canReadPlans(user.role) && (
            <NavLink href="/plans" prefetch={false}>
              Planos
            </NavLink>
          )}
          {canReadPayments(user.role) && (
            <NavLink href="/payments" prefetch={false}>
              Pagamentos
            </NavLink>
          )}
          {canAccessStaff(user.role) && (
            // abrir `/staff` é uma leitura auditada: o menu não pode pré-carregá-la
            <NavLink href="/staff" prefetch={false}>
              Funcionários
            </NavLink>
          )}
          {user.role === 'admin' && <NavLink href="/users">Usuários</NavLink>}
          {user.role === 'admin' && <NavLink href="/audit">Auditoria</NavLink>}
          {user.role === 'admin' && (
            <NavLink href="/privacy" prefetch={false}>
              Privacidade
            </NavLink>
          )}
          <NavLink href="/account">Minha conta</NavLink>
          <SignOutButton />
        </nav>
      </header>
      <main className="grid gap-6">{children}</main>
    </div>
  );
}
