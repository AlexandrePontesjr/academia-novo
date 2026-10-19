'use client';

import { Input, Label } from '@academia/ui';
import { type ComponentProps, type ReactNode, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string;
  /** O ícone à esquerda do campo, como na tela "Welcome Back" da referência (dukfit-app, AC 41). */
  icon?: ReactNode;
  registration: UseFormRegisterReturn;
}

/** Rótulo, campo e a mensagem de erro dele, ligada ao campo por `aria-describedby`. */
export function TextField({ label, error, icon, registration, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...(icon ? { className: 'pl-10' } : {})}
          {...input}
          {...registration}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-[#f87171]">
          {error}
        </p>
      )}
    </div>
  );
}
