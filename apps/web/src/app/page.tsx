import { ArrowRightIcon, ArrowUpRightIcon, BoltIcon, CheckIcon, ClockIcon, DumbbellIcon, HeartIcon, InstagramIcon, LayersIcon, PinIcon } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GalleryCarousel } from '../components/landing/gallery-carousel.tsx';
import { PlansPricing } from '../components/landing/plans-pricing.tsx';
import { Wordmark } from '../components/wordmark.tsx';
import { readSession } from '../lib/session.ts';
import { SITE } from './site-content.ts';

// o nonce do CSP e o CTA dependem da requisição: a página não pode ser estática
export const dynamic = 'force-dynamic';

const CONTAINER = 'mx-auto w-full max-w-7xl px-4 lg:px-8';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
const ICONS = { check: CheckIcon, layers: LayersIcon, dumbbell: DumbbellIcon, heart: HeartIcon, clock: ClockIcon, bolt: BoltIcon };

/** O rótulo pequeno da referência: o ponto amarelo antes do nome da seção. */
function Eyebrow({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="inline-flex items-center gap-2 text-sm text-foreground">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" data-slot="eyebrow-dot" />
      {children}
    </p>
  );
}

/** O botão amarelo da referência: o texto e o círculo preto com a seta no fim. */
function ArrowCta({ href, children, external }: { href: string; children: ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? EXTERNAL : {})}
      className="inline-flex h-12 w-fit items-center gap-3 rounded-full bg-primary pr-1.5 pl-6 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
      <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-black text-primary">
        <ArrowRightIcon className="size-4" />
      </span>
    </a>
  );
}

/**
 * Uma seção da landing: o rótulo à esquerda e o título grande à direita, como na referência. A região
 * se chama pelo rótulo.
 */
function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-eyebrow`} className={`grid scroll-mt-8 gap-10 lg:gap-14 ${CONTAINER}`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr] lg:gap-8" data-slot="section-head">
        <Eyebrow id={`${id}-eyebrow`}>{eyebrow}</Eyebrow>
        <h2 className="text-3xl leading-tight font-medium sm:text-4xl lg:text-5xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Uma foto da academia em preto e branco, sempre com tamanho, `alt` e carregamento preguiçoso. */
function Photo({ photo, className }: { photo: { src: string; alt: string; width: number; height: number }; className?: string }) {
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading="lazy"
      className={`photo-mono w-full rounded-2xl object-cover${className ? ` ${className}` : ''}`}
    />
  );
}

/** O selo circular que gira ao lado da foto do "Sobre": o texto corre num círculo em volta do logo. */
function Badge() {
  return (
    <div aria-hidden="true" className="relative size-32 rounded-full bg-black p-1 lg:size-36" data-slot="about-badge">
      <svg viewBox="0 0 100 100" className="spin-slow size-full text-primary">
        <defs>
          <path id="badge-circle" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
        </defs>
        <text fill="currentColor" fontSize="8.4" fontWeight="600" letterSpacing="1.6">
          <textPath href="#badge-circle">{SITE.about.badge}</textPath>
        </text>
      </svg>
      <img src={SITE.logo.small} alt="" width={48} height={48} loading="lazy" className="absolute inset-0 m-auto size-12" />
    </div>
  );
}

/**
 * A landing pública da DukFit (dukfit-app S4, dukfit-landing), no estilo da referência visual de
 * 2026-10-21: apresenta a academia a qualquer visitante, sem shell. Só o CTA do cabeçalho depende da
 * sessão: a equipe com sessão vai direto ao painel.
 */
export default async function LandingPage() {
  const { session } = await readSession(await headers());
  const { hours } = SITE;
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <main className="grid gap-24 lg:gap-36">
        <section aria-labelledby="hero-title" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden" data-slot="hero">
          <img
            src={SITE.hero.src}
            alt={SITE.hero.alt}
            width={SITE.hero.width}
            height={SITE.hero.height}
            fetchPriority="high"
            className="photo-mono absolute inset-0 -z-20 h-full w-full object-cover"
            data-slot="hero-photo"
          />
          {/* o véu liso garante o contraste do título em qualquer pixel; o degradê escurece a base */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgb(0_0_0/0.6)]" data-slot="hero-overlay" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black via-transparent to-transparent" />

          <header className={`flex items-center justify-between gap-4 py-5 ${CONTAINER}`}>
            <a href="#" className="flex items-center gap-3">
              <img src={SITE.logo.src} alt={SITE.logo.alt} width={40} height={40} className="size-10" data-slot="hero-logo" />
              <Wordmark />
            </a>
            <nav aria-label={SITE.labels.nav} className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur lg:flex">
              {SITE.nav.map((item) => (
                <a key={item.href} href={item.href} className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                  {item.label}
                </a>
              ))}
            </nav>
            <Link
              href={session ? '/dashboard' : '/login'}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {session ? SITE.cta.member : SITE.cta.guest}
            </Link>
          </header>

          <div className={`grid flex-1 content-end gap-10 pt-16 pb-10 lg:grid-cols-[1fr_auto] lg:items-end lg:pb-14 ${CONTAINER}`}>
            <div className="order-2 grid max-w-xs gap-6 lg:order-1">
              <p className="text-sm text-muted-foreground">{SITE.intro}</p>
              <p className="flex items-center gap-3" data-slot="proof">
                <span aria-hidden="true" className="flex shrink-0 -space-x-3">
                  {SITE.gallery.slice(0, 3).map((photo) => (
                    <img key={photo.caption} src={photo.src} alt="" width={36} height={36} data-slot="hero-avatar" className="photo-mono size-9 rounded-full border-2 border-black object-cover" />
                  ))}
                </span>
                <strong className="text-2xl font-medium text-primary">{SITE.proof.value}</strong>
                <span className="text-xs text-muted-foreground">{SITE.proof.label}</span>
              </p>
              <a href="#academia" className="hidden w-fit items-center gap-3 text-sm text-muted-foreground hover:text-foreground lg:inline-flex">
                <span aria-hidden="true" className="h-px w-8 bg-current" />
                {SITE.scroll}
              </a>
            </div>
            <div className="order-1 grid gap-8 lg:order-2">
              <Eyebrow>{SITE.eyebrow}</Eyebrow>
              <h1 id="hero-title" className="text-[clamp(4rem,13vw,10rem)] leading-[0.9] font-medium tracking-tighter">
                {SITE.tagline.map((line, index) => (
                  <span key={line} className="block" data-slot="tagline-line">
                    {line}
                    {index < SITE.tagline.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </h1>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <ArrowCta href="#planos">{SITE.cta.join}</ArrowCta>
                <a href="#localizacao" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary">
                  {SITE.cta.visit}
                  <ArrowUpRightIcon className="size-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="relative isolate">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-24 -z-10 h-[36rem] bg-[radial-gradient(ellipse_at_top,rgb(252_244_60/0.16),transparent_65%)]"
          />
          <Section id="academia" {...SITE.sections.about}>
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-8">
              <div className="relative">
                <Photo photo={SITE.about.photo} className="aspect-[4/3]" />
                <div className="absolute -right-2 -bottom-10 lg:-right-14">
                  <Badge />
                </div>
              </div>
              <div className="grid content-start gap-10">
                <p className="text-xl leading-snug sm:text-2xl">{SITE.about.lead}</p>
                <div className="grid gap-6 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-10">
                  <p>{SITE.about.text}</p>
                  <p>
                    <strong className="font-medium text-foreground">{SITE.about.highlight.title}.</strong> {SITE.about.highlight.text}
                  </p>
                </div>
              </div>
            </div>
          </Section>
        </div>

        <Section id="modalidades" {...SITE.sections.structure}>
          <ul className="lg:ml-[33.333%]" data-slot="highlights">
            {SITE.structure.map((item, index) => (
              <li
                key={item.title}
                className={`group relative grid gap-2 border-b py-6 first:border-t ${index === 0 ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}`}
                data-slot="structure-card"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-3xl font-medium uppercase sm:text-4xl lg:text-5xl">{item.title}</h3>
                  {index === 0 ? <ArrowUpRightIcon className="size-6" /> : <ArrowRightIcon className="size-6" />}
                </div>
                <p className="max-w-md text-sm text-muted-foreground">{item.text}</p>
                {index === 0 && (
                  <img
                    src={SITE.gallery[0].src}
                    alt=""
                    width={160}
                    height={120}
                    loading="lazy"
                    className="photo-mono pointer-events-none absolute top-2 right-24 hidden h-24 w-36 rotate-6 rounded-xl border-2 border-black object-cover shadow-2xl lg:block"
                  />
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="diferenciais" {...SITE.sections.why}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Photo photo={SITE.why.photo} className="aspect-square lg:aspect-auto lg:h-full" />
            <ul className="grid gap-4 sm:grid-cols-2" data-slot="why">
              {SITE.why.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.title} className="grid min-h-44 content-between gap-6 rounded-2xl border bg-card p-5" data-slot="why-card">
                    <Icon className="size-6 text-primary" />
                    <div className="grid gap-2">
                      <h3 className="text-lg leading-snug font-medium">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">{item.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>

        <Section id="estrutura" {...SITE.sections.gallery}>
          <GalleryCarousel />
        </Section>

        <Section id="planos" {...SITE.sections.plans}>
          <PlansPricing />
        </Section>

        <Section id="localizacao" {...SITE.sections.location}>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="relative isolate grid min-h-[28rem] content-end overflow-hidden rounded-2xl border p-4 sm:p-6">
              <img
                src={SITE.gallery[2].src}
                alt=""
                width={SITE.gallery[2].width}
                height={SITE.gallery[2].height}
                loading="lazy"
                className="photo-mono absolute inset-0 -z-20 h-full w-full object-cover"
              />
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/30 to-transparent" />
              <div className="grid max-w-md gap-5 rounded-2xl border border-white/10 bg-black/70 p-5 backdrop-blur" data-slot="location-card">
                <span className="flex items-center gap-3">
                  <img src={SITE.logo.small} alt="" width={40} height={40} loading="lazy" className="size-10" />
                  <span className="grid">
                    <span className="font-medium">{SITE.legalName}</span>
                    <span className="text-xs text-muted-foreground">{SITE.neighborhood}</span>
                  </span>
                </span>
                <address className="flex gap-3 not-italic">
                  <PinIcon className="mt-0.5 size-5 text-primary" />
                  <span>
                    {SITE.address.street}
                    <br />
                    {SITE.address.district}
                  </span>
                </address>
                <dl className="flex flex-wrap gap-8 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{SITE.labels.hours}</dt>
                    <dd className="font-medium">{`${hours.days}, ${hours.opens}–${hours.closes}`}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{SITE.labels.neighborhood}</dt>
                    <dd className="font-medium">{SITE.neighborhood}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="grid content-start gap-4">
              <div className="grid grid-cols-2 gap-4">
                {[SITE.gallery[1], SITE.gallery[3]].map((photo) => (
                  <figure key={photo.caption} className="relative isolate aspect-[3/4] overflow-hidden rounded-2xl border">
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      className="photo-mono absolute inset-0 -z-10 h-full w-full object-cover"
                    />
                    <figcaption className="p-4 text-sm font-medium text-primary">{photo.caption}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="grid gap-3 rounded-2xl border bg-card p-5" data-slot="routes">
                <p className="text-sm text-muted-foreground">{SITE.cta.visit}</p>
                <div className="flex flex-wrap gap-3">
                  {(['google', 'waze', 'uber'] as const).map((route, index) => (
                    <a
                      key={route}
                      href={SITE.routes[route]}
                      {...EXTERNAL}
                      className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors ${
                        index === 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-muted'
                      }`}
                    >
                      {SITE.routeLabels[route]}
                      <ArrowUpRightIcon className="size-4" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        <section id="horario" aria-labelledby="horario-eyebrow" className="relative isolate overflow-hidden" data-slot="closing">
          <img
            src={SITE.hero.src}
            alt=""
            width={SITE.hero.width}
            height={SITE.hero.height}
            loading="lazy"
            className="photo-mono absolute inset-0 -z-20 h-full w-full object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/70" />
          <div className={`grid min-h-[34rem] content-center justify-items-center gap-6 py-20 text-center ${CONTAINER}`}>
            <Eyebrow id="horario-eyebrow">{SITE.sections.hours.eyebrow}</Eyebrow>
            <h2 className="max-w-4xl text-4xl leading-tight font-medium sm:text-5xl lg:text-7xl">{SITE.closing.title}</h2>
            <p className="flex items-center gap-2 text-lg text-primary">
              <ClockIcon className="size-5" />
              {SITE.sections.hours.title}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">{SITE.closing.text}</p>
            <ArrowCta href={SITE.routes.google} external>
              {SITE.cta.visit}
            </ArrowCta>
          </div>
        </section>
      </main>

      <footer className={`grid gap-12 pt-16 pb-10 ${CONTAINER}`}>
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-end">
          <div className="grid gap-6">
            <p className="text-lg">
              © {year} {SITE.name}.
              <br />
              {SITE.rights}
            </p>
            <a href={SITE.instagram.url} {...EXTERNAL} className="inline-flex w-fit items-center gap-2 text-sm hover:text-primary">
              <InstagramIcon className="size-4" />
              {SITE.instagram.handle}
              <ArrowUpRightIcon className="size-4" />
            </a>
          </div>
          <div className="grid gap-4 lg:justify-items-end">
            <p aria-hidden="true" className="text-[clamp(4.5rem,22vw,13rem)] leading-[0.8] font-medium tracking-tighter text-primary" data-slot="footer-wordmark">
              {SITE.name}
            </p>
            <nav aria-label={SITE.labels.footerNav} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {SITE.nav.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-foreground">
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
        <div className="grid gap-6 border-t pt-8 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="grid gap-1">
            <p className="text-lg font-medium">{SITE.newsletter.title}</p>
            <p className="text-sm text-muted-foreground">{SITE.newsletter.text}</p>
          </div>
          <a
            href={SITE.instagram.url}
            {...EXTERNAL}
            className="inline-flex h-12 w-fit items-center gap-3 rounded-full border bg-card pr-1.5 pl-5 text-sm hover:border-primary"
          >
            <span className="text-muted-foreground">{SITE.instagram.handle}</span>
            <span className="inline-flex h-9 items-center rounded-full bg-primary px-5 font-medium text-primary-foreground">{SITE.newsletter.cta}</span>
          </a>
        </div>
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <img src={SITE.logo.small} alt={SITE.logo.alt} width={32} height={32} loading="lazy" className="size-8" />
          {SITE.footer}
        </p>
      </footer>
    </div>
  );
}
