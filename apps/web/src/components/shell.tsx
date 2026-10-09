import type { SessionResponse } from '@academia/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { canReadPayments } from '../lib/payments.ts';
import { canReadPlans } from '../lib/plans.ts';
import { ROLE_LABELS } from '../lib/roles.ts';
import { canAccessStaff } from '../lib/staff.ts';
import { SignOutButton } from './sign-out-button.tsx';

/** Cabeçalho comum às páginas de quem já entrou: quem é, o perfil, a navegação e a saída. */
export function Shell({ session, children }: { session: SessionResponse; children: ReactNode }) {
  const { user } = session;
  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Gestão de Academia</h1>
          <p className="text-sm text-muted-foreground">
            <span>{user.name}</span> · <span>{ROLE_LABELS[user.role]}</span>
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/">Início</Link>
          <Link href="/students">Alunos</Link>
          {canReadPlans(user.role) && (
            <Link href="/plans" prefetch={false}>
              Planos
            </Link>
          )}
          {canReadPayments(user.role) && (
            <Link href="/payments" prefetch={false}>
              Pagamentos
            </Link>
          )}
          {canAccessStaff(user.role) && (
            // abrir `/staff` é uma leitura auditada: o menu não pode pré-carregá-la
            <Link href="/staff" prefetch={false}>
              Funcionários
            </Link>
          )}
          {user.role === 'admin' && <Link href="/users">Usuários</Link>}
          {user.role === 'admin' && <Link href="/audit">Auditoria</Link>}
          <Link href="/account">Minha conta</Link>
          <SignOutButton />
        </nav>
      </header>
      <main className="grid gap-6">{children}</main>
    </div>
  );
}
