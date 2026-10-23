import type { ReactNode } from 'react';
import { AuthFrame } from '../../components/auth-frame.tsx';
import { Brand } from '../../components/brand.tsx';
import { SITE } from '../site-content.ts';

/** A moldura das páginas públicas do pré-cadastro: a mesma das telas de entrada, sem o cabeçalho da landing. */
export function MatriculaFrame({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <AuthFrame>
      <main className="grid w-full max-w-md gap-8 px-4 pt-16 pb-10 lg:py-10">
        <Brand />
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" data-slot="eyebrow-dot" />
            {SITE.matricula.eyebrow}
          </p>
          <h1 className="text-4xl font-medium">{title}</h1>
          {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
        </div>
        {children}
      </main>
    </AuthFrame>
  );
}
