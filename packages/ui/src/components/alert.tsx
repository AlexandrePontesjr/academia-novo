import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

const alertVariants = cva('rounded-xl border px-4 py-3 text-sm', {
  variants: {
    variant: {
      // o alerta padrão é uma superfície em camadas, com o texto secundário do tema (AC 13)
      default: 'border-border bg-muted text-[#d4d4d4]',
      destructive: 'border-[#f87171] bg-[#f87171]/10 text-[#f87171]',
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
