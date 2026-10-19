import type { Page, Response } from '@playwright/test';
import { expect, sessionOf, test } from './support/fake-api.ts';

/** O `Content-Security-Policy` de uma resposta de página, ou o erro do teste. */
function policyOf(response: Response | null): string {
  expect(response, 'resposta da página').not.toBeNull();
  const policy = response!.headers()['content-security-policy'];
  expect(policy, 'Content-Security-Policy').toBeDefined();
  return policy!;
}

/** O `nonce` da política literal: o valor que os scripts inline do documento têm de repetir. */
function nonceOf(policy: string): string {
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce, 'nonce no Content-Security-Policy').toBeTruthy();
  return nonce!;
}

/** A política literal da door 2, com o nonce da requisição. */
const policyWith = (nonce: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;

/** Os `nonce` dos scripts inline do documento (os que não têm `src`); o atributo é oculto, vale a propriedade. */
function inlineNonces(page: Page) {
  return page.$$eval('script', (scripts) =>
    scripts.filter((script) => !script.src).map((script) => script.nonce),
  );
}

test('csp_header_carries_a_nonce_that_every_inline_script_reuses', async ({ page }) => {
  const response = await page.goto('/login');
  const policy = policyOf(response);
  const nonce = nonceOf(policy);

  expect(policy).toBe(policyWith(nonce));
  const nonces = await inlineNonces(page);
  expect(nonces.length, 'scripts inline no documento').toBeGreaterThan(0);
  for (const value of nonces) expect(value).toBe(nonce);
});

test('two_requests_get_two_different_nonces_on_both_login_pages', async ({ page }) => {
  for (const path of ['/login', '/login/two-factor']) {
    const first = nonceOf(policyOf(await page.goto(path)));
    const second = nonceOf(policyOf(await page.goto(path)));
    expect(first, path).not.toBe(second);
  }
});

test('chromium_opens_login_and_students_without_csp_violations', async ({ page, api }) => {
  // o navegador anota cada `securitypolicyviolation` desde antes do primeiro script da página
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber} sample=${event.sample?.slice(0, 120)}`,
      );
    });
  });
  const violations = () =>
    page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
  const visit = async (path: string) => {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    return violations();
  };

  // a primeira tela: /login, sem sessão
  expect(await visit('/login')).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true })).toBeVisible();

  // entra: a API falsa passa a ter sessão, e o login recarrega a aplicação no painel
  api.session = sessionOf('reception');
  api.on('POST', '/api/auth/login', { status: 200, body: { status: 'authenticated' } });
  api.on('GET', '/api/students', { status: 200, body: { items: [], nextCursor: null } });
  await page.getByLabel('E-mail').fill('marina@exemplo.com');
  await page.getByLabel('Senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(await violations()).toEqual([]);

  // a segunda tela: a lista de alunos, servida pela API falsa
  expect(await visit('/students')).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Alunos', exact: true })).toBeVisible();
});
