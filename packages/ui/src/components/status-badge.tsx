import type { ReactNode } from 'react';
import { cn } from '../cn.ts';

/**
 * O mapa literal da situação por (entidade, situação), a door 7 do refino visual: a variante de cor
 * vem de `--status-*`, e o texto vem do mapa de negócio de quem consome (nunca um literal daqui).
 */
export const STATUS_VARIANTS = {
  student: { active: 'ok', inactive: 'idle', suspended: 'warn' },
  enrollment: { active: 'ok', scheduled: 'idle', expired: 'warn', cancelled: 'idle' },
  payment: { paid: 'ok', pending: 'warn', overdue: 'bad', cancelled: 'idle' },
  'check-in': { allowed: 'ok', blocked: 'bad' },
  staff: { active: 'ok', inactive: 'idle' },
  lead: { new: 'warn', contacted: 'idle', converted: 'ok', discarded: 'idle' },
  portal: { active: 'ok', pending: 'warn', none: 'idle', disabled: 'idle' },
  user: { active: 'ok', inactive: 'idle' },
  plan: { active: 'ok', inactive: 'idle' },
} as const;

export type StatusEntity = keyof typeof STATUS_VARIANTS;
export type StatusOf<E extends StatusEntity> = keyof (typeof STATUS_VARIANTS)[E];

const TONE = {
  ok: 'bg-status-ok-surface text-status-ok',
  warn: 'bg-status-warn-surface text-status-warn',
  bad: 'bg-status-bad-surface text-status-bad',
  idle: 'bg-status-idle-surface text-status-idle',
} as const;

/** A situação em pílula: o tom vem do mapa literal e o texto é o rótulo de negócio de quem a monta. */
export function StatusBadge<E extends StatusEntity>({
  variant,
  status,
  className,
  children,
}: {
  /** A entidade da situação: `student`, `payment`, `check-in`, ... (door 7). */
  variant: E;
  status: StatusOf<E>;
  className?: string;
  /** O rótulo do mapa de negócio (`STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, ...). */
  children: ReactNode;
}) {
  const tone = STATUS_VARIANTS[variant][status] as keyof typeof TONE;
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap', TONE[tone], className)}
    >
      {children}
    </span>
  );
}
