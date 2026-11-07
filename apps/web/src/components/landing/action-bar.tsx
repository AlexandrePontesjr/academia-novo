'use client';

import { useEffect, useState } from 'react';
import { SITE } from '../../app/site-content.ts';

/**
 * A ação fixa do celular (refino visual, door 5): um link de 44 px no rodapé da tela, visível só depois
 * que o CTA do herói saiu da viewport e enquanto nenhum CTA de seção aparece - uma ação principal por
 * tela. Escondida a partir de 1024 px e na impressão.
 */
export function ActionBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heroCta = document.querySelector('[data-slot="hero-cta"]');
    if (!heroCta) return;
    const sectionCtas = [...document.querySelectorAll('[data-slot="section-cta"]')];
    const seen = new Map<Element, boolean>();
    const update = () => {
      const heroGone = seen.get(heroCta) === false;
      const sectionShown = sectionCtas.some((cta) => seen.get(cta) === true);
      setVisible(heroGone && !sectionShown);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      update();
    });
    observer.observe(heroCta);
    for (const cta of sectionCtas) observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      data-slot="action-bar"
      href={SITE.hero.cta.href}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      className={`fixed inset-x-0 bottom-0 z-50 h-11 items-center justify-center bg-primary text-sm font-medium text-primary-foreground print:hidden lg:hidden ${
        visible ? 'flex' : 'hidden'
      }`}
    >
      {SITE.hero.cta.label}
    </a>
  );
}
