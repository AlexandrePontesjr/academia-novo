'use client';

import { useEffect } from 'react';

/**
 * O tipo da página no `<html>` (refino visual, C14): o layout raiz é um só para o app inteiro e o Next
 * não escolhe atributo de `<html>` por rota, então a landing marca o documento como `place` quando
 * monta e desmarca ao sair. As metas da página vão no `metadata` do `page.tsx`.
 */
export function PlaceDocument({ kind }: { kind: string }) {
  useEffect(() => {
    document.documentElement.dataset.type = kind;
    return () => {
      delete document.documentElement.dataset.type;
    };
  }, [kind]);
  return null;
}
