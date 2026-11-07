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

/** A marca de campo obrigatório, ao lado do rótulo e fora dele (o nome acessível não muda). */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-sm font-medium text-status-bad" data-slot="required-mark">
      *
    </span>
  );
}

/** O rótulo de um campo que não é `TextField` (um select, uma área de texto), com a marca do obrigatório. */
export function FieldLabel({ htmlFor, required = false, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      {required && <RequiredMark />}
    </div>
  );
}

/** Rótulo, campo e a mensagem de erro dele, ligada ao campo por `aria-describedby`. */
export function TextField({ label, error, icon, required, registration, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required && <RequiredMark />}
      </div>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <Input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...(icon ? { className: 'pl-10' } : {})}
          {...input}
          {...registration}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}
