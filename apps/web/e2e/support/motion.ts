/* O que as provas da `motion` leem de um Chromium real: quadros amostrados, animações e o baseline (C39). */
import type { Locator, Page } from '@playwright/test';

export const MOBILE = { width: 390, height: 844 };
export const NARROW = { width: 360, height: 800 };
export const DESKTOP = { width: 1440, height: 900 };

/** Um quadro amostrado: o instante e o estilo computado de cada alvo, na ordem dos seletores. */
export interface Frame {
  t: number;
  targets: Array<Record<string, string> | null>;
}

const SAMPLED = ['opacity', 'transform', 'pointer-events', 'width', 'height', 'top', 'left', 'margin-top', 'padding-top', 'filter', 'clip-path'];

/**
 * Instala, antes da ação, um `requestAnimationFrame` que grava a cada quadro o estilo computado dos
 * alvos de cada seletor (o primeiro elemento que casa, ou `null` enquanto não existe) até `ms` depois
 * de começar (checks.md, Sampling). `all: true` grava todo elemento que casa, achatado na ordem do DOM.
 * `appear: true` conta os `ms` a partir do primeiro quadro em que o primeiro seletor existe (uma
 * navegação leva um tempo de rede antes de a tela nova montar) e só grava desse quadro em diante.
 */
export async function startSampling(
  page: Page,
  selectors: string[],
  options: { ms?: number; all?: boolean; appear?: boolean; extra?: string[] } = {},
) {
  await page.evaluate(
    ({ selectors, ms, all, appear, properties }) => {
      const frames: Array<{ t: number; targets: Array<Record<string, string> | null> }> = [];
      (window as unknown as { __frames: typeof frames }).__frames = frames;
      let start = appear ? undefined : performance.now();
      const limit = performance.now() + 5000;
      const read = (element: Element) => {
        const style = getComputedStyle(element);
        return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
      };
      const tick = () => {
        const t = performance.now();
        const targets = selectors.flatMap((selector) => {
          if (all) return [...document.querySelectorAll(selector)].map(read);
          const element = document.querySelector(selector);
          return [element ? read(element) : null];
        });
        if (start === undefined && document.querySelector(selectors[0]!)) start = t;
        if (start !== undefined) frames.push({ t, targets });
        if ((start === undefined || t - start < ms) && t < limit) requestAnimationFrame(tick);
        else (window as unknown as { __done: boolean }).__done = true;
      };
      (window as unknown as { __done: boolean }).__done = false;
      requestAnimationFrame(tick);
    },
    { selectors, ms: options.ms ?? 600, all: options.all ?? false, appear: options.appear ?? false, properties: [...SAMPLED, ...(options.extra ?? [])] },
  );
}

/** Espera o fim da amostragem e devolve os quadros. */
export async function framesOf(page: Page): Promise<Frame[]> {
  await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done === true, null, { timeout: 10_000 });
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

/** O deslocamento vertical de um `transform` computado (`none` é 0). */
export function translateYOf(transform: string) {
  if (transform === 'none' || !transform) return 0;
  const values = /matrix(3d)?\(([^)]+)\)/.exec(transform)?.[2]?.split(',').map(Number) ?? [];
  return transform.startsWith('matrix3d') ? values[13]! : values[5]!;
}

/** Espera a tela assentar: rede parada e nenhuma animação finita rodando. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running'),
  );
}

/** O nome do `animation-name` e a duração computados de um elemento. */
export async function animationOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
}

// C39 - o baseline de cópia, nomes e foco, gravado em `7471232` antes de qualquer código da feature

/** O que fica de fora do baseline da landing: o cabeçalho (antes no hero, depois o `site-header`) e o menu. */
const LANDING_EXCLUDED = 'header, [data-slot="site-header"], #site-menu';

export interface Baseline {
  text: string;
  aria: string;
  focus: string[];
}

/** O ano do rodapé da landing depende do dia em que a prova roda; as datas das telas vêm da API falsa. */
export function normalized(value: string, now = new Date()) {
  return value.replaceAll(`© ${now.getFullYear()}`, '© <ano>');
}

/** Lê a cópia do `main`, o snapshot ARIA e a sequência de foco de 40 Tabs da tela aberta. */
export async function baselineOf(page: Page, landing: boolean): Promise<Baseline> {
  const focus: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let press = 0; press < 80 && focus.length < 40; press += 1) {
    await page.keyboard.press('Tab');
    const entry = await page.evaluate((excluded) => {
      const element = document.activeElement;
      if (!element || element === document.body) return 'body';
      if (excluded && element.closest(excluded)) return null;
      const name = (element.getAttribute('aria-label') ?? (element as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      return [element.tagName.toLowerCase(), element.getAttribute('role') ?? '', name, element.getAttribute('href') ?? '', element.getAttribute('name') ?? ''].join('|');
    }, landing ? LANDING_EXCLUDED : '');
    if (entry !== null) focus.push(entry);
  }
  if (landing) {
    await page.evaluate((excluded) => document.querySelectorAll(excluded).forEach((element) => element.remove()), LANDING_EXCLUDED);
  }
  const text = await page.getByRole('main').evaluate((element) => (element as HTMLElement).innerText);
  const aria = await page.locator('body').ariaSnapshot();
  return { text: normalized(text), aria: normalized(aria), focus: focus.map((entry) => normalized(entry)) };
}
