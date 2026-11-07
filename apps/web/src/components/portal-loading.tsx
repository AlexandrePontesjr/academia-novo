import { PageSkeleton, Skeleton } from '@academia/ui';

/**
 * O esqueleto do portal do aluno (refino visual, AC 43): o cabeçalho da tela, o bloco de identidade
 * e três cartões, na mesma coluna, na mesma largura e nos mesmos recuos do `/minha-conta` carregado.
 * Esta tela não tem barra lateral nem barra inferior, então o esqueleto também não as desenha.
 */
export function PortalLoading() {
  return (
    <PageSkeleton className="min-h-dvh">
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-16 pb-10 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-[9999px]" />
        </div>
        <div className="grid gap-4" data-slot="skeleton-identity">
          <div className="grid gap-1">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-[30px] w-56 rounded-xl" />
            <Skeleton className="h-3.5 w-32 rounded-md" />
          </div>
          <div className="grid gap-3">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-32 w-24 rounded-md md:h-40 md:w-30" />
          </div>
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40" data-slot="skeleton-card" />
        ))}
      </main>
    </PageSkeleton>
  );
}
