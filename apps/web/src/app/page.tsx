import { BoltIcon, ClockIcon, DumbbellIcon, PANEL, PhoneIcon, PinIcon } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Wordmark } from '../components/wordmark.tsx';
import { readSession } from '../lib/session.ts';
import { SITE } from './site-content.ts';

// o nonce do CSP e o CTA dependem da requisição: a página não pode ser estática
export const dynamic = 'force-dynamic';

const CTA = 'inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90';

/** O título de uma seção da landing, no peso das telas de onboarding da referência. */
function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-2xl font-bold sm:text-3xl">
      {children}
    </h2>
  );
}

/**
 * A landing pública da DukFit (dukfit-app, S4): apresenta a academia a qualquer visitante, sem shell.
 * Só o CTA depende da sessão: a equipe com sessão vai direto ao painel.
 */
export default async function LandingPage() {
  const { session } = await readSession(await headers());
  const whatsapp = `https://wa.me/${SITE.whatsapp.replace(/\D/g, '')}`;

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 lg:px-8">
        <Wordmark />
        <a href="#contato" className="text-sm text-muted-foreground hover:text-foreground">
          Contato
        </a>
      </div>

      <main className="mx-auto grid max-w-6xl gap-16 px-4 pb-16 lg:gap-24 lg:px-8">
        <section aria-labelledby="hero-title" className="relative grid gap-6 pt-8 lg:grid-cols-2 lg:items-center lg:pt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(205_247_32/0.22),transparent_65%)] lg:left-3/4"
          />
          <div className="grid gap-6">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              Academia de bairro
            </p>
            <h1 id="hero-title" className="text-4xl leading-tight font-extrabold sm:text-5xl lg:text-6xl">
              {SITE.tagline}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{SITE.intro}</p>
            <div className="flex flex-wrap gap-3">
              {session ? (
                <Link href="/dashboard" className={CTA}>
                  Ir para o painel
                </Link>
              ) : (
                <Link href="/login" className={CTA}>
                  Acesso da equipe
                </Link>
              )}
              <a href={whatsapp} className="inline-flex h-12 items-center justify-center rounded-full border px-6 font-semibold hover:bg-muted">
                Fale com a gente
              </a>
            </div>
          </div>
          <div aria-hidden="true" className={`hidden ${PANEL} lg:grid lg:justify-items-center lg:gap-4 lg:py-16`}>
            <span className="flex size-24 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
              <BoltIcon className="size-12" />
            </span>
            <p className="text-6xl font-extrabold tracking-tight">
              Duk<span className="text-primary">Fit</span>
            </p>
          </div>
        </section>

        <section aria-labelledby="highlights-title" className="grid gap-6">
          <SectionTitle id="highlights-title">Por que a DukFit</SectionTitle>
          <ul className="grid gap-4 lg:grid-cols-3" data-slot="highlights">
            {SITE.highlights.map((item, index) => (
              <li key={item.title} className={`grid content-start gap-3 ${PANEL}`}>
                <span className="text-sm font-semibold text-primary tabular-nums">0{index + 1}</span>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="modalities-title" className="grid gap-6">
          <SectionTitle id="modalities-title">Modalidades</SectionTitle>
          <ul className="flex flex-wrap gap-3">
            {SITE.modalities.map((modality) => (
              <li key={modality} className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2">
                <DumbbellIcon className="size-4 text-primary" />
                {modality}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="hours-title" className="grid gap-6">
          <SectionTitle id="hours-title">Horários</SectionTitle>
          <dl className="grid gap-3 md:grid-cols-3">
            {SITE.hours.map((slot) => (
              <div key={slot.days} className={`grid gap-2 ${PANEL}`}>
                <dt className="flex items-center gap-2 text-sm text-primary">
                  <ClockIcon className="size-4" />
                  {slot.days}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {slot.opens} - {slot.closes}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="contato" aria-labelledby="contact-title" className={`grid gap-4 ${PANEL}`}>
          <SectionTitle id="contact-title">Contato</SectionTitle>
          <p className="flex items-center gap-3">
            <PinIcon className="text-primary" />
            {SITE.address}
          </p>
          <p className="flex items-center gap-3">
            <PhoneIcon className="text-primary" />
            {SITE.phone}
          </p>
          <a href={whatsapp} className={`${CTA} w-full sm:w-fit`}>
            Chamar no WhatsApp
          </a>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {SITE.name} · {SITE.address}
      </footer>
    </div>
  );
}
