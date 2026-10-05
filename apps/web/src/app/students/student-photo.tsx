'use client';

import { useEffect, useRef, useState } from 'react';
import { initialsOf } from '../../lib/students.ts';

/**
 * A foto do aluno, ou o círculo com as iniciais quando ele não tem foto ou a imagem não carrega
 * (a URL vale 5 minutos e expira com a página aberta). As iniciais ficam num pseudo-elemento, que
 * não entra no texto da célula nem da ficha; o rótulo acessível é "Sem foto".
 */
export function StudentPhoto({
  name,
  photoUrl,
  shape,
}: {
  name: string;
  photoUrl: string | null | undefined;
  /** `thumb` é a miniatura redonda da lista; `ficha` é a foto 3:4 da ficha, com o círculo menor no lugar. */
  shape: 'thumb' | 'ficha';
}) {
  const [broken, setBroken] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setBroken(false);
  }, [photoUrl]);

  // a imagem pode falhar antes de a página hidratar, e então `onError` nunca dispara
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setBroken(true);
  }, [photoUrl]);

  if (!photoUrl || broken) {
    return (
      <span
        role="img"
        aria-label="Sem foto"
        data-initials={initialsOf(name)}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground before:content-[attr(data-initials)] ${
          shape === 'thumb' ? 'size-8 text-xs' : 'size-24 text-2xl'
        }`}
      />
    );
  }
  return (
    // a URL é assinada e passa pela origem do web: não há o que o otimizador de imagens do Next faria aqui
    <img
      ref={image}
      src={photoUrl}
      alt={shape === 'ficha' ? `Foto de ${name}` : ''}
      onError={() => setBroken(true)}
      className={shape === 'thumb' ? 'size-8 shrink-0 rounded-full object-cover' : 'h-40 w-30 rounded-md object-cover'}
    />
  );
}
