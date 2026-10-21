import type { ReactNode } from 'react';
import { SITE } from '../app/site-content.ts';

/**
 * A moldura das telas de entrada (login e 2FA), no estilo da landing: no computador, a foto da academia
 * em preto e branco à esquerda com o título grande; no celular, só o conteúdo. A foto é decorativa.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <div aria-hidden="true" className="relative isolate hidden overflow-hidden lg:m-4 lg:block lg:rounded-2xl" data-slot="auth-photo">
        <img
          src={SITE.hero.src}
          alt=""
          width={SITE.hero.width}
          height={SITE.hero.height}
          className="photo-mono absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black via-black/40 to-black/10" />
        <div className="flex h-full flex-col justify-end gap-3 p-10">
          <p className="inline-flex items-center gap-2 text-sm text-foreground">
            <span className="size-2 rounded-full bg-primary" data-slot="eyebrow-dot" />
            {SITE.eyebrow}
          </p>
          <p className="text-7xl leading-none font-medium tracking-tight">
            {SITE.tagline[0]}
            <br />
            {SITE.tagline[1]}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center">{children}</div>
    </div>
  );
}
