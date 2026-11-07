import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

const alertVariants = cva('rounded-xl border px-4 py-3 text-sm', {
  variants: {
    variant: {
      // o alerta padrão é uma superfície em camadas, com o texto secundário do tema (AC 13)
      default: 'border-border bg-muted text-muted-strong',
      destructive: 'border-status-bad bg-status-bad/10 text-status-bad',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
