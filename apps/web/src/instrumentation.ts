/** Roda uma vez quando o servidor sobe: sem ambiente válido, o web não inicia. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('./assert-env.ts');
    assertEnv();
  }
}
