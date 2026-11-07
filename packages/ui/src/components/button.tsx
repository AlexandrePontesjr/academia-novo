import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

const buttonVariants = cva(
  // `pressable`: o toque encolhe o botão a 0,98 em 150 ms, pelo CSS do tema (motion, door 5)
  'pressable button-lift inline-flex items-center justify-center gap-2 rounded-[9999px] text-sm font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // todo botão é pill, como na referência; a ação primária leva o amarelo do acento
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border-control bg-transparent hover:bg-secondary',
        ghost: 'hover:bg-secondary',
        link: 'text-primary underline underline-offset-4',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** A ação está em andamento: o botão fica desabilitado, com `aria-busy` e o spinner de 16 px. */
  busy?: boolean;
}

export function Button({ className, variant, size, asChild = false, busy = false, type = 'button', disabled, children, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      type={type}
      disabled={disabled || busy}
      {...(busy ? { 'aria-busy': true } : {})}
      {...props}
    >
      {busy && (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-spin" data-slot="spinner">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
