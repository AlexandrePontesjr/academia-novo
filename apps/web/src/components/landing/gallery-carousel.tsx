'use client';

import { ArrowLeftIcon, ArrowRightIcon } from '@academia/ui';
import { useRef, useState } from 'react';
import { SITE } from '../../app/site-content.ts';

/**
 * As fotos da estrutura em carrossel, como os cartões de treinadores da referência: a lista rola na
 * horizontal com encaixe, as setas andam um cartão e os pontos mostram onde a rolagem está. Sem
 * JavaScript, a lista continua rolável com o dedo.
 */
export function GalleryCarousel() {
  const list = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);

  const step = () => list.current?.firstElementChild?.getBoundingClientRect().width ?? 0;
  const move = (direction: 1 | -1) => list.current?.scrollBy({ left: direction * (step() + 16), behavior: 'smooth' });
  const track = () => {
    const width = step();
    if (list.current && width > 0) setCurrent(Math.round(list.current.scrollLeft / (width + 16)));
  };

  return (
    <div className="grid gap-6">
      <ul
        ref={list}
        onScroll={track}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:scroll-px-0 lg:px-0"
        data-slot="gallery"
      >
        {SITE.gallery.map((photo) => (
          <li key={photo.caption} className="w-[80%] shrink-0 snap-start sm:w-[45%] lg:w-[calc((100%-2rem)/3)]" data-slot="gallery-item">
            <figure className="relative isolate aspect-[4/5] overflow-hidden rounded-2xl border">
              <img
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                className="photo-mono absolute inset-0 -z-10 h-full w-full object-cover"
              />
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-black/60 via-transparent to-black/30" />
              <figcaption className="p-5 text-lg font-medium text-primary">{photo.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label={SITE.galleryLabels.previous}
          className="flex size-11 items-center justify-center rounded-full border text-foreground hover:bg-muted"
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <span aria-hidden="true" className="flex gap-1.5" data-slot="gallery-dots">
          {SITE.gallery.map((photo, index) => (
            <span
              key={photo.caption}
              className={`h-1.5 rounded-full transition-all ${index === current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/50'}`}
            />
          ))}
        </span>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label={SITE.galleryLabels.next}
          className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
