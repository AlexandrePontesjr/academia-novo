'use client';

import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { type HTMLAttributes, type ReactNode, useState, useSyncExternalStore } from 'react';
import { cn } from './cn.ts';

/**
 * Os tokens de movimento (motion, door 1; AD-099): toda animação lê daqui a duração (s), a curva e a
 * distância (px). `stagger` é o passo entre itens de uma cascata e `staggerMax` o último item que anda.
 */
export const MOTION = {
  micro: 0.15,
  base: 0.2,
  long: 0.3,
  ease: [0.2, 0.8, 0.2, 1],
  distance: 8,
  distanceDesktop: 12,
  stagger: 0.04,
  staggerMax: 8,
} as const;

/** A duração da entrada de um cartão ou de um item de lista (door 4). */
const ENTER = 0.22;

/** A entrada de um bloco: some e fica `distance` px abaixo, depois aparece no lugar. */
export const enter = (distance: number) => ({
  hidden: { opacity: 0, y: distance },
  shown: { opacity: 1, y: 0 },
});

const noSubscription = () => () => undefined;

/**
 * A distância da entrada de quem monta agora: 8 px, ou 12 px a partir de 1024 px; `null` quando não
 * há entrada - com movimento reduzido e no que veio no documento do servidor, que chega parado e
 * visível. `useSyncExternalStore` lê o valor do servidor na renderização do servidor e na hidratação
 * (também a de um trecho que chega depois por streaming), e o do navegador em quem monta depois:
 * navegação, busca, menu.
 */
export function useEntrance() {
  const reduce = useReducedMotion();
  const fromServer = useSyncExternalStore(noSubscription, () => false, () => true);
  const [distance] = useState(() =>
    fromServer ? null : window.matchMedia('(min-width: 1024px)').matches ? MOTION.distanceDesktop : MOTION.distance,
  );
  return reduce ? null : distance;
}

/** O atraso do item `index` de uma cascata: 40 ms por item até o 8º; do 9º em diante, o do 8º. */
const delayOf = (index: number) => MOTION.stagger * Math.min(index, MOTION.staggerMax - 1);

type EnterProps = Pick<HTMLAttributes<HTMLElement>, 'className' | 'id' | 'children' | 'aria-labelledby' | 'aria-label'> & {
  index: number;
  as?: 'div' | 'section' | 'li' | 'td';
  /** O `data-slot` do bloco, como as peças do tema são lidas pelas provas. */
  'data-slot'?: string;
};

/** Um bloco que entra uma vez ao montar, `index` × 40 ms depois do primeiro (door 4). */
function Enter({ index, as = 'div', children, ...props }: EnterProps) {
  const distance = useEntrance();
  const Tag = motion[as];
  if (distance === null) return <Tag {...props}>{children}</Tag>;
  return (
    <Tag
      {...props}
      variants={enter(distance)}
      initial="hidden"
      animate="shown"
      transition={{ duration: ENTER, ease: MOTION.ease, delay: delayOf(index) }}
    >
      {children}
    </Tag>
  );
}

/** A entrada de um cartão do painel (door 4). */
export const Reveal = (props: EnterProps) => <Enter {...props} />;

/** Um item de uma lista em cascata: o `index` dá o atraso, e do 9º em diante o atraso para de crescer. */
export const StaggerItem = (props: EnterProps) => <Enter as="li" {...props} />;

/** A célula de uma linha de tabela em cascata: a linha fica parada, o conteúdo da linha entra (door 4). */
export const StaggerCell = ({ className, ...props }: Omit<EnterProps, 'as'>) => (
  <Enter as="td" className={cn('px-3 py-2.5 align-middle', className)} {...props} />
);

/** A lista de uma cascata: os itens dela são `StaggerItem`. */
export function Stagger({ className, children }: { className?: string; children: ReactNode }) {
  return <ul className={className}>{children}</ul>;
}

/** A configuração de movimento da árvore inteira: respeita o movimento reduzido do sistema, sem elemento próprio. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>
      {children}
    </MotionConfig>
  );
}
