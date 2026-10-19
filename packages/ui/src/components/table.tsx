import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

/** A tabela do tema escuro: cartão com raio de 16 px, cabeçalho em camadas e linhas com a borda do tema. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return <th className={cn('bg-muted px-3 py-2 font-medium text-[#d4d4d4]', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t first:border-t-0', className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}
