import { ArrowUpRightIcon, ClockIcon, Gauge, PANEL, PinIcon } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '../components/wordmark.tsx';
import { readSession } from '../lib/session.ts';
import { SITE } from './site-content.ts';

// o nonce do CSP e o CTA dependem da requisição: a página não pode ser estática
export const dynamic = 'force-dynamic';

const CTA = 'inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90';
const OUTLINE = 'inline-flex h-12 items-center justify-center gap-2 rounded-full border px-5 font-semibold hover:bg-muted';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Uma seção da landing: o rótulo pequeno (o nome da região) e o título forte, como no projeto anterior. */
function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-eyebrow`} className="grid gap-6">
      <div className="grid gap-2">
        <p id={`${id}-eyebrow`} className="inline-flex items-center gap-2 text-sm text-primary">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          {eyebrow}
        </p>
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Uma foto da academia, sempre com tamanho, `alt` e carregamento preguiçoso fora da primeira dobra. */
function Photo({ photo, className }: { photo: { src: string; alt: string; width: number; height: number }; className?: string }) {
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading="lazy"
      className={`h-full w-full rounded-3xl object-cover${className ? ` ${className}` : ''}`}
    />
  );
}

/** Quantas horas um horário de `HH:MM` a `HH:MM` fica aberto. */
const openHours = ({ opens, closes }: { opens: string; closes: string }) => {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return (minutes(closes) - minutes(opens)) / 60;
};

/**
 * A landing pública da DukFit (dukfit-app S4, dukfit-landing): apresenta a academia a qualquer
 * visitante, sem shell. Só o CTA depende da sessão: a equipe com sessão vai direto ao painel.
 */
export default async function LandingPage() {
  const { session } = await readSession(await headers());
  const { hours } = SITE;

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <main className="grid gap-16 pb-16 lg:gap-24">
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden" data-slot="hero">
          <img
            src={SITE.hero.src}
            alt={SITE.hero.alt}
            width={SITE.hero.width}
            height={SITE.hero.height}
            fetchPriority="high"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            data-slot="hero-photo"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgb(10_10_10/0.78)]" data-slot="hero-overlay" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-6 lg:px-8 lg:pb-20">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-3">
                <img src={SITE.logo.src} alt={SITE.logo.alt} width={56} height={56} className="size-14" data-slot="hero-logo" />
                <Wordmark />
              </span>
              {session ? (
                <Link href="/dashboard" className={CTA}>
                  Ir para o painel
                </Link>
              ) : (
                <Link href="/login" className={CTA}>
                  Acesso da equipe
                </Link>
              )}
            </div>
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
              <div className="grid gap-6">
                <p className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                  {SITE.eyebrow}
                </p>
                <h1 id="hero-title" className="text-5xl leading-tight font-extrabold sm:text-6xl lg:text-7xl">
                  {SITE.tagline.map((line, index) => (
                    <span key={line} className={`block${index === 1 ? ' text-primary' : ''}`} data-slot="tagline-line">
                      {line}
                      {index < SITE.tagline.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </h1>
                <p className="flex items-center gap-3" data-slot="proof">
                  <strong className="text-3xl font-extrabold text-primary">{SITE.proof.value}</strong>
                  <span className="max-w-40 text-sm text-muted-foreground">{SITE.proof.label}</span>
                </p>
              </div>
              <div className="grid gap-4">
                <p className="text-lg">{SITE.intro}</p>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ClockIcon className="size-4 text-primary" />
                  {hours.days}, {hours.opens}–{hours.closes}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-6xl gap-16 px-4 lg:gap-24 lg:px-8">
          <Section id="academia" eyebrow="Sobre a Dukfit" title={SITE.about.title}>
            <p className="max-w-prose text-lg text-muted-foreground">{SITE.about.text}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Photo photo={SITE.about.photos[0]} className="aspect-square" />
              <div className={`grid content-center gap-3 ${PANEL}`}>
                <h3 className="text-xl font-semibold">{SITE.about.highlight.title}</h3>
                <p className="text-muted-foreground">{SITE.about.highlight.text}</p>
              </div>
              <Photo photo={SITE.about.photos[1]} className="aspect-square" />
            </div>
          </Section>

          <Section id="encontra" eyebrow="O que você encontra" title="Estrutura para um treino completo.">
            <ul className="grid gap-4 lg:grid-cols-3" data-slot="highlights">
              {SITE.structure.map((item, index) => (
                <li key={item.title} className={`grid content-start gap-3 ${PANEL}`} data-slot="structure-card">
                  <span className="text-sm font-semibold text-primary tabular-nums">0{index + 1}</span>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.text}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="estrutura" eyebrow="Nossa estrutura" title="A Dukfit por dentro.">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {SITE.gallery.map((photo, index) => (
                <figure key={photo.caption} className="grid gap-2" data-slot="gallery-item">
                  <Photo photo={photo} className="aspect-[4/5]" />
                  <figcaption className="text-sm text-muted-foreground">
                    <span className="text-primary tabular-nums">0{index + 1}</span> {photo.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>

          <Section id="horario" eyebrow="Horário" title={`${hours.days}, das ${hours.opens} às ${hours.closes}.`}>
            {/* o medidor da referência ("Training Schedule"): as horas abertas do dia sobre 24 (de-para) */}
            <div className={PANEL}>
              <Gauge
                value={openHours(hours)}
                max={24}
                display={`${hours.opens} - ${hours.closes}`}
                pill={hours.days}
                label={`${hours.days}: aberto das ${hours.opens} às ${hours.closes}`}
              />
            </div>
          </Section>

          <Section id="localizacao" eyebrow="Onde estamos" title="Perto da sua rotina. Em Flores, Manaus.">
            <div className={`grid gap-6 ${PANEL}`}>
              <address className="flex gap-3 text-lg not-italic">
                <PinIcon className="mt-1 text-primary" />
                <span>
                  {SITE.address.street}
                  <br />
                  {SITE.address.district}
                </span>
              </address>
              <dl className="flex flex-wrap gap-8">
                <div>
                  <dt className="text-sm text-muted-foreground">Horário</dt>
                  <dd className="font-semibold">
                    {hours.days}, {hours.opens}–{hours.closes}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Bairro</dt>
                  <dd className="font-semibold">{SITE.neighborhood}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-3">
                <a href={SITE.routes.google} {...EXTERNAL} className={CTA}>
                  Google Maps
                </a>
                <a href={SITE.routes.waze} {...EXTERNAL} className={OUTLINE}>
                  Waze
                </a>
                <a href={SITE.routes.uber} {...EXTERNAL} className={OUTLINE}>
                  Uber
                </a>
              </div>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 lg:px-8">
          <span className="flex items-center gap-3">
            <img src={SITE.logo.small} alt={SITE.logo.alt} width={40} height={40} loading="lazy" className="size-10" />
            <span className="text-sm text-muted-foreground">{SITE.footer}</span>
          </span>
          <a href={SITE.instagram.url} {...EXTERNAL} className="inline-flex items-center gap-2 text-sm hover:text-primary">
            {SITE.instagram.handle}
            <ArrowUpRightIcon className="size-4" />
          </a>
        </div>
      </footer>
    </div>
  );
}
