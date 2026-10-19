import Link from 'next/link';

/** A rota desconhecida na identidade escura (AC 19): o proxy passa a requisição com sessão, e o Next chega aqui. */
export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-sm gap-4 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço acessado não existe.</p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Voltar ao início
      </Link>
    </main>
  );
}
