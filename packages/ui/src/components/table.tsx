import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

/**
 * A tabela do tema escuro: cartão com raio de 16 px, cabeçalho em camadas e linhas com a borda do tema.
 * Rola na horizontal dentro de si no celular; `relative` segura também o texto `sr-only` das células,
 * que sem isso escaparia da rolagem e alargaria a página (dukfit-app, AC 45).
 * Refino visual (door 7): a linha responde ao ponteiro com `--muted` a 50%.
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full min-w-0 overflow-x-auto rounded-xl border">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return <th className={cn('bg-muted px-3 py-2.5 text-xs font-medium tracking-wide text-muted-strong uppercase', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t transition-colors first:border-t-0 hover:bg-muted/50', className)} {...props} />;
}

export function TableCell({ className, numeric = false, ...props }: ComponentProps<'td'> & { /** Coluna numérica: à direita e tabular (door 7). */ numeric?: boolean }) {
  return <td className={cn('px-3 py-2.5 align-middle', numeric && 'text-right tabular-nums', className)} {...props} />;
}
