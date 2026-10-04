'use client';

import { Input, Label } from '@academia/ui';
import { type ComponentProps, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
}

/** Rótulo, campo e a mensagem de erro dele, ligada ao campo por `aria-describedby`. */
export function TextField({ label, error, registration, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        {...registration}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
