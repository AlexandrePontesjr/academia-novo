import { CheckIcon } from '@academia/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * O desfecho de um pedido do portal (refino visual, S3): um cartão com o ícone de 24 px, o título e
 * a mensagem única preservada, e o caminho de volta ao login. Substitui o parágrafo solto que a tela
 * mostrava antes.
 */
export function AuthSuccess({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid justify-items-start gap-3 rounded-2xl border bg-card p-5" data-slot="auth-success">
      <CheckIcon className="size-6 text-primary" />
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
      <Link href="/login" className="text-primary underline underline-offset-4">
        Voltar ao login
      </Link>
    </section>
  );
}
