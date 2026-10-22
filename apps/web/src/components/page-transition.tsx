'use client';

import { enter, MOTION, useEntrance } from '@academia/ui';
import { motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * O `<main>` da Shell com a entrada de página (motion, door 2; AD-100): opacidade 0→1 e 8 px → 0 (12 px
 * a partir de 1024 px) em 200 ms. O primeiro documento, a impressão e o movimento reduzido não animam;
 * cabeçalho, abas e barra lateral ficam fora e não se movem.
 */
export function PageTransition({ className, children }: { className: string; children: ReactNode }) {
  const pathname = usePathname();
  const distance = useEntrance();

  if (pathname.endsWith('/print')) return <main className={className}>{children}</main>;
  if (distance === null) {
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
