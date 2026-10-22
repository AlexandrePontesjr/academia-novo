import { type ComponentProps, useId } from 'react';
import { cn } from '../cn.ts';

/** Um bloco de esqueleto: decoração que pulsa em CSS (`skeleton-pulse`, 1,4 s) e o leitor de tela ignora. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn('rounded-2xl bg-muted', className)} {...props} />;
}

/**
 * A espera de uma tela (motion, door 3; AD-101): o leitor de tela ouve "Carregando…" uma vez, e os
 * blocos dentro dele repetem a geometria do que vai chegar.
 */
export function PageSkeleton({ className, children, ...props }: ComponentProps<'div'>) {
  const label = useId();
  return (
    <div role="status" aria-busy="true" aria-labelledby={label} data-slot="page-skeleton" className={className} {...props}>
      <span id={label} className="sr-only">
        Carregando…
      </span>
      {children}
    </div>
  );
}
