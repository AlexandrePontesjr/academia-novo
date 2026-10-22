'use client';

import { enter, MOTION } from '@academia/ui';
import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

/** Vira `true` depois da primeira montagem no navegador: só as navegações seguintes animam. */
let hydrated = false;

/**
 * O `<main>` da Shell com a entrada de página (motion, door 2; AD-100): opacidade 0→1 e 8 px → 0 (12 px
 * a partir de 1024 px) em 200 ms. O primeiro documento, a impressão e o movimento reduzido não animam;
 * cabeçalho, abas e barra lateral ficam fora e não se movem.
 */
export function PageTransition({ className, children }: { className: string; children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [distance] = useState(() =>
    typeof window !== 'undefined' && hydrated
      ? window.matchMedia('(min-width: 1024px)').matches
        ? MOTION.distanceDesktop
        : MOTION.distance
      : null,
  );
  useEffect(() => {
    hydrated = true;
  }, []);

  if (pathname.endsWith('/print')) return <main className={className}>{children}</main>;
  if (distance === null || reduce) {
    return (
      <motion.main className={className} data-motion="page">
        {children}
      </motion.main>
    );
  }
  return (
    <motion.main
      className={className}
      data-motion="page"
      variants={enter(distance)}
      initial="hidden"
      animate="shown"
      transition={{ duration: MOTION.base, ease: MOTION.ease }}
    >
      {children}
    </motion.main>
  );
}
