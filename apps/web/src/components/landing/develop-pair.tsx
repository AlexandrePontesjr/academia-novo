'use client';

import { MOTION } from '@academia/ui';
import { useEffect, useRef, useState } from 'react';

type Photo = { src: string; alt: string; width: number; height: number };

const REDUCE = '(prefers-reduced-motion: reduce)';
const EASE = `cubic-bezier(${MOTION.ease.join(', ')})`;
const DURATION = `${MOTION.long * 2}s`;

function PhotoFrame({ photo }: { photo: Photo }) {
  return (
    <img
      data-slot="photo"
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading="lazy"
      className="photo-mono h-full w-full object-cover"
    />
  );
}

/**
 * O par da `#estrutura` (refino visual, door 6): duas fotos do mesmo tamanho, com os topos alinhados,
 * que se desenvolvem uma vez na primeira entrada da seção - escala 1.06→1 e recorte em 600 ms, dentro
 * do limite de 900 ms. Com movimento reduzido o par já está no estado final.
 */
export function DevelopPair({ photos }: { photos: readonly Photo[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [developed, setDeveloped] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (window.matchMedia(REDUCE).matches) {
      setReduce(true);
      setDeveloped(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDeveloped(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const transition = reduce ? 'none' : `transform ${DURATION} ${EASE}, clip-path ${DURATION} ${EASE}`;
  const style = {
    transform: developed ? 'none' : 'scale(1.06)',
    clipPath: developed ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)',
    transition,
  };

  return (
    <div ref={ref} className="grid gap-6 sm:grid-cols-2">
      {photos.map((photo) => (
        <figure key={photo.src} data-slot="structure-photo" data-moment="picture-develops" className="aspect-[4/3] overflow-hidden" style={style}>
          <PhotoFrame photo={photo} />
        </figure>
      ))}
    </div>
  );
}
