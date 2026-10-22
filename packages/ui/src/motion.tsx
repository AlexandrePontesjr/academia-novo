'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

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

/** A entrada de um bloco: some e fica `distance` px abaixo, depois aparece no lugar. */
export const enter = (distance: number) => ({
  hidden: { opacity: 0, y: distance },
  shown: { opacity: 1, y: 0 },
});

/** A configuração de movimento da árvore inteira: respeita o movimento reduzido do sistema, sem elemento próprio. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>
      {children}
    </MotionConfig>
  );
}
