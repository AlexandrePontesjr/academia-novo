import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

/** O campo de texto do tema escuro: superfície de cartão, borda de controle e o vermelho de erro da situação. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-border-control bg-card px-4 text-sm text-foreground disabled:opacity-50 aria-invalid:border-status-bad',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-xl border border-border-control bg-card px-4 text-sm text-foreground disabled:opacity-50 aria-invalid:border-status-bad',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium', className)} {...props} />;
}
