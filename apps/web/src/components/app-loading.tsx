import { PageSkeleton, Skeleton } from '@academia/ui';

/**
 * O esqueleto de uma tela interna enquanto o servidor busca os dados (motion, door 3): a geometria da
 * Shell (avatar de 44 px, coluna de 256 px a partir de 1024 px, barra inferior abaixo disso), o título
 * de 30 px e quatro blocos de 96 px, na mesma largura e nos mesmos recuos do `main` de verdade.
 */
export function AppLoading() {
  return (
    <PageSkeleton className="min-h-dvh lg:pl-64">
      <div data-slot="skeleton-shell">
        <div
          className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:grid lg:w-64 lg:content-start lg:gap-3 lg:border-r lg:px-4 lg:pt-20"
          data-slot="skeleton-side"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 px-4 pt-6 pb-2 lg:mx-auto lg:max-w-6xl lg:px-8 lg:pt-8">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-[50%]" data-slot="skeleton-avatar" />
            <Skeleton className="h-10 w-36" />
          </div>
          <Skeleton className="size-11 rounded-[50%]" />
        </div>
        <div className="fixed inset-x-4 bottom-4 z-30 h-16 lg:hidden" data-slot="skeleton-bottom-bar">
          <Skeleton className="h-full rounded-[9999px]" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pt-4 pb-32 lg:px-8 lg:pb-12" data-slot="skeleton-content">
        <div className="h-[30px]" data-slot="skeleton-title">
          <Skeleton className="h-full w-48 rounded-xl" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24" data-slot="skeleton-panel">
            <Skeleton className="h-full" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
