'use client';

import type { Role } from '@academia/contracts';
import {
  BadgeIcon,
  CardIcon,
  ChartIcon,
  CheckInIcon,
  Dialog,
  DialogContent,
  DialogTitle,
  HistoryIcon,
  HomeIcon,
  KeyIcon,
  LayersIcon,
  MenuIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from '@academia/ui';
import { type ReactNode, useState } from 'react';
import { canCheckIn } from '../lib/check-ins.ts';
import { canReadPayments } from '../lib/payments.ts';
import { canReadPlans } from '../lib/plans.ts';
import { canAccessStaff } from '../lib/staff.ts';
import { NavLink, type NavVariant } from './nav-link.tsx';
import { SignOutButton } from './sign-out-button.tsx';

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
  /** Abrir a rota é uma leitura auditada ou pesada: o menu não a pré-carrega. */
  prefetch?: false;
}

/** Todos os links que o perfil pode abrir, na ordem do menu completo. */
function itemsFor(role: Role): Item[] {
  const items: Array<Item | false> = [
    { href: '/dashboard', label: 'Início', icon: <HomeIcon /> },
    { href: '/students', label: 'Alunos', icon: <UsersIcon /> },
    canCheckIn(role) && { href: '/check-in', label: 'Check-in', icon: <CheckInIcon />, prefetch: false },
    canCheckIn(role) && { href: '/check-ins', label: 'Presenças', icon: <ChartIcon />, prefetch: false },
    canReadPlans(role) && { href: '/plans', label: 'Planos', icon: <LayersIcon />, prefetch: false },
    canReadPayments(role) && { href: '/payments', label: 'Pagamentos', icon: <CardIcon />, prefetch: false },
    // abrir `/staff` é uma leitura auditada: o menu não pode pré-carregá-la
    canAccessStaff(role) && { href: '/staff', label: 'Funcionários', icon: <BadgeIcon />, prefetch: false },
    role === 'admin' && { href: '/users', label: 'Usuários', icon: <KeyIcon /> },
    role === 'admin' && { href: '/audit', label: 'Auditoria', icon: <HistoryIcon /> },
    role === 'admin' && { href: '/privacy', label: 'Privacidade', icon: <ShieldIcon />, prefetch: false },
  ];
  return items.filter((item): item is Item => item !== false);
}

const ACCOUNT: Item = { href: '/account', label: 'Minha conta', icon: <UserIcon /> };

/** A prioridade das duas abas do meio da barra inferior (dukfit-app, AC 4). */
const TAB_PRIORITY = ['Check-in', 'Pagamentos', 'Planos', 'Presenças', 'Funcionários'];

/** As abas da barra inferior: Início, Alunos e as duas primeiras da prioridade que o perfil abre. */
function tabsFor(role: Role): Item[] {
  const items = itemsFor(role);
  const middle = TAB_PRIORITY.map((label) => items.find((item) => item.label === label))
    .filter((item): item is Item => item !== undefined)
    .slice(0, 2);
  return [items[0]!, items[1]!, ...middle];
}

const link = (item: Item, variant: NavVariant) => (
  <NavLink key={item.href} href={item.href} icon={item.icon} variant={variant} {...(item.prefetch === false ? { prefetch: false } : {})}>
    {item.label}
  </NavLink>
);

/** A barra lateral do computador: todos os links, com ícone, e a saída no rodapé (AC 7). */
export function SideNav({ role }: { role: Role }) {
  return (
    <nav aria-label="Menu principal" className="grid content-start gap-1">
      {itemsFor(role).map((item) => link(item, 'side'))}
      {link(ACCOUNT, 'side')}
    </nav>
  );
}

/** A barra inferior do celular: cinco abas, a última abre o menu "Mais" (AC 3, AC 4). */
export function BottomNav({ role }: { role: Role }) {
  return (
    <nav
      aria-label="Abas"
      className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-around rounded-3xl border bg-card px-2 py-2 lg:hidden print:hidden"
      data-slot="bottom-nav"
    >
      {tabsFor(role).map((item) => link(item, 'tab'))}
      <MoreMenu role={role} trigger="tab" />
    </nav>
  );
}

/**
 * O menu "Mais": um diálogo com todo link que o perfil abre, "Minha conta" e "Sair" (AC 6). Abre pela
 * aba "Mais" ou pelo botão quadrado do cabeçalho, que carrega o ponto lime quando há `alert`.
 */
export function MoreMenu({ role, trigger, alert }: { role: Role; trigger: 'tab' | 'header'; alert?: string }) {
  const [open, setOpen] = useState(false);
  const button =
    trigger === 'tab' ? (
      <button type="button" className="flex size-12 items-center justify-center rounded-2xl text-muted-foreground" onClick={() => setOpen(true)}>
        <MenuIcon />
        <span className="sr-only">Mais</span>
      </button>
    ) : (
      <button
        type="button"
        aria-label="Menu"
        aria-describedby={alert ? 'menu-alert' : undefined}
        className="relative flex size-11 items-center justify-center rounded-md border bg-card"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
        {alert && (
          <>
            <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-primary" data-slot="menu-dot" />
            <span id="menu-alert" className="sr-only">
              {alert}
            </span>
          </>
        )}
      </button>
    );
  return (
    <>
      {button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogTitle>Menu</DialogTitle>
          <nav aria-label="Mais opções" className="grid gap-1" onClick={() => setOpen(false)}>
            {itemsFor(role).map((item) => link(item, 'menu'))}
            {link(ACCOUNT, 'menu')}
          </nav>
          <SignOutButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
