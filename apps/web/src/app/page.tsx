import { ArrowUpRightIcon, InstagramIcon } from '@academia/ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { ActionBar } from '../components/landing/action-bar.tsx';
import { DevelopPair } from '../components/landing/develop-pair.tsx';
import { HeroEnter } from '../components/landing/hero-enter.tsx';
import { PlaceDocument } from '../components/landing/place-document.tsx';
import { PlansPricing } from '../components/landing/plans-pricing.tsx';
import { RULE_LINK } from '../components/landing/rule-link.ts';
import { SiteHeader } from '../components/landing/site-header.tsx';
import { readSession } from '../lib/session.ts';
import { SITE } from './site-content.ts';

// o nonce do CSP e o CTA dependem da requisição: a página não pode ser estática
export const dynamic = 'force-dynamic';

// as metas do lugar (refino visual, C14): o tipo da página vem de `SITE.kind`
export const metadata: Metadata = {
  other: { 'page-type': SITE.kind, 'site-kind': 'other', 'page-kind': SITE.kind },
};

const CONTAINER = 'mx-auto w-full max-w-7xl px-4 lg:px-8';
const HEAD = 'grid gap-4 lg:grid-cols-[1fr_2fr] lg:items-end lg:gap-8';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
const ROUTES = ['google', 'waze', 'uber'] as const;
const HOURS = `${SITE.hours.days}, ${SITE.hours.opens}–${SITE.hours.closes}`;

/** Uma seção do lugar: o rótulo e o título na cabeça, o conteúdo na mesma coluna, uma tela de altura. */
function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-eyebrow`}
      className={`flex min-h-dvh scroll-mt-24 flex-col justify-center gap-10 py-20 lg:gap-14 ${CONTAINER}`}
    >
      <div className={HEAD} data-slot="section-head">
        <p id={`${id}-eyebrow`} className="text-sm text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="max-w-3xl text-3xl leading-tight font-medium sm:text-4xl lg:text-5xl">{title}</h2>
      </div>
      <div className="grid content-start gap-8" data-slot="section-body">
        {children}
      </div>
    </section>
  );
}

/** A régua de 1 px da borda do tema: o separador de tudo o que a landing empilha. */
function Rule() {
  return <div aria-hidden="true" data-slot="rule" className="border-t" />;
}

/**
 * A landing pública da DukFit (refino visual, S2): a academia como um lugar de Flores, Manaus - o que
 * é, onde fica, como chegar e quanto custa, com as quatro fotos reais, cada uma uma vez. Sem shell;
 * só o CTA do cabeçalho depende da sessão.
 */
export default async function LandingPage() {
  const { session } = await readSession(await headers());
  const year = new Date().getFullYear();
  const visit = SITE.sections.visit;
  const about = SITE.sections.about;
  const structure = SITE.sections.structure;
  const plans = SITE.sections.plans;
  const closing = SITE.sections.closing;

  return (
    <div className="min-h-dvh">
      <PlaceDocument kind={SITE.kind} />
      <SiteHeader session={Boolean(session)} />
      <main>
        <section aria-labelledby="hero-title" className="relative isolate flex min-h-dvh items-end overflow-hidden" data-slot="hero">
          <img
            data-slot="photo"
            data-photo="hero"
            src={SITE.hero.src}
            alt={SITE.hero.alt}
            width={SITE.hero.width}
            height={SITE.hero.height}
            fetchPriority="high"
            className="photo-mono absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full ${CONTAINER}`}>
            <HeroEnter className="flex w-full flex-col gap-6 pt-28 pb-14 lg:gap-8 lg:pb-24">
              <h1 id="hero-title" className="max-w-5xl text-[clamp(2.5rem,5.2vw,5.5rem)] leading-[1.02] font-medium text-foreground">
                {SITE.hero.title}
              </h1>
              <p data-slot="hero-subline" className="max-w-xl text-base leading-relaxed text-foreground sm:text-lg">{SITE.hero.subline}</p>
              <a
                data-slot="hero-cta"
                href={SITE.hero.cta.href}
                className="pressable inline-flex h-12 w-fit items-center justify-center gap-3 rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:-translate-y-px"
              >
                {SITE.hero.cta.label}
                <ArrowUpRightIcon className="size-4" />
              </a>
            </HeroEnter>
          </div>
        </section>

        <Section id={visit} eyebrow={SITE.visit.eyebrow} title={SITE.visit.title}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
            <a
              data-slot="visit-address"
              href={SITE.routes.google}
              className={`block max-w-3xl text-[clamp(3rem,5vw,4.5rem)] leading-[1.05] font-medium ${RULE_LINK}`}
            >
              {SITE.address.street}
              <br />
              {SITE.address.district}
            </a>
            <div className="grid content-start gap-8">
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">{SITE.labels.hours}</p>
                <p data-slot="visit-hours" className="text-2xl leading-snug font-medium">
                  {HOURS}
                </p>
              </div>
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">{SITE.visit.routesLabel}</p>
                <ul className="grid">
                  {ROUTES.map((route) => (
                    <li key={route}>
                      <a
                        data-slot="route-link"
                        href={SITE.routes[route]}
                        {...EXTERNAL}
                        className="flex h-11 items-center justify-between gap-4 border-t text-base leading-6 font-medium transition-colors hover:text-primary"
                      >
                        {SITE.routeLabels[route]}
                        <ArrowUpRightIcon className="size-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section id={about} eyebrow={SITE.about.eyebrow} title={SITE.about.title}>
          {/* a composição `story` da door 3: a foto 4:3 ao lado do texto, nunca atrás dele */}
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16" data-slot="story">
            <div className="grid content-start gap-8" data-slot="story-text">
              <p className="text-xl leading-snug sm:text-2xl">{SITE.about.lead}</p>
              <p className="text-base leading-relaxed text-muted-foreground">{SITE.about.text}</p>
              <Rule />
              <div className="grid gap-2">
                <p className="text-lg font-medium">{SITE.about.highlight.title}</p>
                <p className="text-base leading-relaxed text-muted-foreground">{SITE.about.highlight.text}</p>
              </div>
              <p className="flex items-baseline gap-3">
                <strong className="text-4xl font-medium text-primary">{SITE.about.proof.value}</strong>
                <span className="text-sm text-muted-foreground">{SITE.about.proof.label}</span>
              </p>
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">{SITE.about.listTitle}</p>
                <ul className="grid">
                  {SITE.why.map((item) => (
                    <li key={item.title} className="grid gap-1 border-t py-4" data-slot="why-item">
                      <h3 className="text-lg leading-snug font-medium">{item.title}</h3>
                      <p className="text-base leading-6 text-muted-foreground">{item.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <a data-slot="photo-link" href={`#${visit}`} className="group block overflow-hidden">
              <figure data-slot="photo-frame" className="aspect-[4/3] overflow-hidden">
                <img
                  data-slot="photo"
                  src={SITE.about.photo.src}
                  alt={SITE.about.photo.alt}
                  width={SITE.about.photo.width}
                  height={SITE.about.photo.height}
                  loading="lazy"
                  className="photo-mono h-full w-full object-cover transition-transform duration-300 group-hover:[transform:scale(1.03)] motion-reduce:transition-none"
                />
              </figure>
            </a>
          </div>
        </Section>

        <Section id={structure} eyebrow={SITE.structure.eyebrow} title={SITE.structure.title}>
          <DevelopPair photos={SITE.structure.photos} />
          <ul className="grid gap-0 lg:grid-cols-3">
            {SITE.structure.items.map((item) => (
              <li key={item.title} className="grid content-start gap-2 border-t py-6 lg:pr-10" data-slot="structure-item">
                <h3 className="text-xl font-medium">{item.title}</h3>
                <p className="text-base leading-6 text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id={plans} eyebrow={SITE.plans.eyebrow} title={SITE.plans.title}>
          <PlansPricing />
        </Section>

        <section
          id={closing}
          aria-labelledby="fecho-title"
          data-slot="closing"
          className="flex min-h-dvh scroll-mt-24 items-center bg-primary py-20 text-primary-foreground"
        >
          <div className={CONTAINER}>
            <div className="grid gap-8" data-slot="section-body">
              <h2 id="fecho-title" className="max-w-3xl text-4xl leading-tight font-medium sm:text-5xl lg:text-7xl">
                {SITE.closing.title}
              </h2>
              <p className="max-w-xl text-base leading-relaxed">{SITE.closing.text}</p>
              <a
                data-slot="section-cta"
                href={SITE.hero.cta.href}
                className="pressable inline-flex h-12 w-fit items-center justify-center rounded-full bg-primary-foreground px-8 text-sm font-medium text-primary hover:-translate-y-px"
              >
                {SITE.hero.cta.label}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={`grid gap-10 py-14 ${CONTAINER}`}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <div className="grid gap-3">
            <img data-slot="footer-logo" src={SITE.logo.src} alt={SITE.logo.alt} width={96} height={96} className="size-10" />
            <a data-slot="footer-address" href={SITE.routes.google} className="text-3xl leading-tight font-medium hover:text-primary">
              {SITE.address.street}
              <br />
              {SITE.address.district}
            </a>
            <p className="text-base text-muted-foreground">{HOURS}</p>
          </div>
          <div className="grid content-start gap-6">
            <nav aria-label={SITE.labels.footerNav} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {SITE.nav.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-primary">
                  {item.label}
                </a>
              ))}
            </nav>
            <p className="max-w-sm text-sm text-muted-foreground">{SITE.newsletter.text}</p>
            <a
              data-slot="footer-newsletter"
              href={SITE.instagram.url}
              {...EXTERNAL}
              className="inline-flex w-fit items-center gap-2 text-sm font-medium hover:text-primary"
            >
              <InstagramIcon className="size-4" />
              {SITE.newsletter.cta}
            </a>
          </div>
        </div>
        <div className="grid gap-2 border-t pt-6 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center">
          <p>{`© ${year} ${SITE.name}. ${SITE.rights}`}</p>
          <p>{SITE.footer}</p>
        </div>
      </footer>

      <ActionBar />
    </div>
  );
}
