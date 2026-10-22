'use client';

import { CloseIcon, Dialog, DialogClose, DialogContent, DialogTitle, InstagramIcon, MenuIcon, Stagger, StaggerItem } from '@academia/ui';
import Link from 'next/link';
import { type MouseEvent, useEffect, useState } from 'react';
import { SITE } from '../../app/site-content.ts';
import { Wordmark } from '../wordmark.tsx';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Vai à âncora `href` da própria página depois de o menu fechar (o diálogo prende a rolagem enquanto aberto). */
function scrollTo(href: string) {
  window.history.pushState(null, '', href);
  requestAnimationFrame(() => document.querySelector(href)?.scrollIntoView());
}

/** O link da sessão: a equipe com sessão vai ao painel, quem não tem vai ao login. */
function SessionCta({ session, className }: { session: boolean; className: string }) {
  return (
    <Link href={session ? '/dashboard' : '/login'} className={className}>
      {session ? SITE.cta.member : SITE.cta.guest}
    </Link>
  );
}

/**
 * O menu do celular (motion, door 7): um diálogo em tela cheia com as seções em links grandes, em
 * cascata, os CTAs e o Instagram. Escolher uma seção fecha o menu e rola até ela.
 */
function SiteMenu({ session, open, onOpenChange }: { session: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const go = (href: string) => (event: MouseEvent) => {
    event.preventDefault();
    onOpenChange(false);
    scrollTo(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="site-menu"
        aria-describedby={undefined}
        className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-10 overflow-y-auto rounded-none border-0 bg-background px-4 pt-3 pb-10"
      >
        <div className="flex h-16 items-center justify-end">
          <DialogTitle className="sr-only">{SITE.menu.title}</DialogTitle>
          <DialogClose aria-label={SITE.menu.close} className="flex size-11 items-center justify-center rounded-full border bg-card">
            <CloseIcon />
          </DialogClose>
        </div>
        <nav aria-label={SITE.labels.nav}>
          <Stagger className="grid gap-2">
            {SITE.nav.map((item, index) => (
              <StaggerItem key={item.href} index={index}>
                <a href={item.href} onClick={go(item.href)} className="block py-1 text-4xl font-medium uppercase hover:text-primary">
                  {item.label}
                </a>
              </StaggerItem>
            ))}
          </Stagger>
        </nav>
        <div className="mt-auto grid gap-4">
          <a
            href="#planos"
            onClick={go('#planos')}
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            {SITE.cta.join}
          </a>
          <SessionCta session={session} className="inline-flex h-12 items-center justify-center rounded-full border px-6 font-medium" />
          <a href={SITE.instagram.url} {...EXTERNAL} className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <InstagramIcon className="size-4" />
            {SITE.instagram.handle}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O cabeçalho flutuante da landing (motion, door 7; AD-105): fixo no topo da página inteira,
 * transparente sobre o hero e com fundo depois de 24 px de rolagem. A partir de 1024 px mostra as
 * seções, com a da tela marcada; abaixo disso, o botão "Abrir menu".
 */
export function SiteHeader({ session }: { session: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState<string>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY >= 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    // a seção da tela é a primeira que cruza a faixa logo abaixo do cabeçalho
    const sections = SITE.nav.map((item) => document.querySelector<HTMLElement>(item.href)).filter((section) => section !== null);
    const inBand = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target);
          else inBand.delete(entry.target);
        }
        const first = sections.find((section) => inBand.has(section));
        setCurrent(first ? `#${first.id}` : undefined);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className="fixed inset-x-4 top-3 z-40 flex h-16 items-center justify-between gap-3 rounded-full border border-transparent px-3 transition-[background-color,border-color] duration-200 data-scrolled:border-[rgb(255_255_255/0.1)] data-scrolled:bg-[rgb(0_0_0/0.72)] data-scrolled:backdrop-blur-[12px] lg:inset-x-8 lg:px-4"
      data-slot="site-header"
      {...(scrolled ? { 'data-scrolled': '' } : {})}
    >
      <a href="#" className="flex min-w-0 items-center gap-3">
        <img src={SITE.logo.src} alt={SITE.logo.alt} width={40} height={40} className="size-10" data-slot="hero-logo" />
        <Wordmark className="max-sm:sr-only" />
      </a>
      <nav aria-label={SITE.labels.nav} className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur lg:flex">
        {SITE.nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            {...(current === item.href ? { 'aria-current': 'location' as const } : {})}
            className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground aria-[current=location]:bg-white/10 aria-[current=location]:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <SessionCta
          session={session}
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/90 sm:px-5"
        />
        <button
          type="button"
          aria-label={SITE.menu.open}
          aria-expanded={open}
          aria-controls="site-menu"
          className="flex size-11 items-center justify-center rounded-full border bg-card lg:hidden"
          onClick={() => setOpen(true)}
        >
          <MenuIcon />
        </button>
      </div>
      <SiteMenu session={session} open={open} onOpenChange={setOpen} />
    </header>
  );
}
