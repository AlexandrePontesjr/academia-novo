'use client';

import { MOTION } from '@academia/ui';
import { type ReactNode, useEffect, useState } from 'react';

const REDUCE = '(prefers-reduced-motion: reduce)';
const EASE = `cubic-bezier(${MOTION.ease.join(', ')})`;

/**
 * A entrada do herói (refino visual, door 6): opacidade 0→1 e y 12→0 em 300 ms com a curva do
 * `MOTION`, uma vez ao montar. Com movimento reduzido a transição não roda e o herói já está no estado
 * final - a preferência é lida no navegador, porque o servidor não a conhece.
 */
export function HeroEnter({ className, children }: { className: string; children: ReactNode }) {
  const [entered, setEntered] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(REDUCE);
    if (media.matches) {
      setReduce(true);
      setEntered(true);
      return;
    }
    // dois quadros: o primeiro pinta o estado inicial, o segundo solta a transição
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const transition = reduce
    ? 'none'
    : `opacity ${MOTION.long}s ${EASE}, transform ${MOTION.long}s ${EASE}`;

  return (
    <div
      data-slot="hero-content"
      className={className}
      style={{ opacity: entered ? 1 : 0, transform: entered ? 'none' : `translateY(${MOTION.distanceDesktop}px)`, transition }}
    >
      {children}
    </div>
  );
}
