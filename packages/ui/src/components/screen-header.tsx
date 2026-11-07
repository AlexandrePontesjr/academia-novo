import type { ReactNode } from 'react';

/**
 * O cabeçalho de conteúdo de uma tela (door 7 do refino visual): o olho de 14 px com o ponto do
 * acento, o título `h2` de 30 px em peso médio, a meta opcional e as ações à direita; abaixo de
 * 768 px as ações empilham sob o título. O componente não aplica gutter: ele vive na largura do
 * `main`, e é dela que saem as bordas esquerda e direita.
 */
export function ScreenHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between" data-slot="screen-header">
      <div className="grid min-w-0 gap-1">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-slot="screen-header-eyebrow">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" data-slot="eyebrow-dot" />
            {eyebrow}
          </p>
        )}
        <h2 className="text-[30px] leading-tight font-medium" data-slot="screen-header-title">
          {title}
        </h2>
        {meta && (
          <p className="text-sm text-muted-foreground" data-slot="screen-header-meta">
            {meta}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-3" data-slot="screen-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
