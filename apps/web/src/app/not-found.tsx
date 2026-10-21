import { ArrowRightIcon } from '@academia/ui';
import Link from 'next/link';

/** A rota desconhecida na identidade escura (AC 19): o proxy passa a requisição com sessão, e o Next chega aqui. */
export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-md gap-5 p-6 pt-24">
      <p className="text-8xl font-medium tracking-tight text-primary">404</p>
      <h1 className="text-3xl font-medium">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço acessado não existe.</p>
      <Link
        href="/"
        className="inline-flex h-12 w-fit items-center gap-3 rounded-full bg-primary pr-1.5 pl-6 font-medium text-primary-foreground hover:bg-primary/90"
      >
        Voltar ao início
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-black text-primary">
          <ArrowRightIcon className="size-4" />
        </span>
      </Link>
    </main>
  );
}
