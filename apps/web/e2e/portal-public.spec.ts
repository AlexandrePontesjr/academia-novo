import { expect, type FakeApi, problem, type Reply, test } from './support/fake-api.ts';

/** O `429` com o `Retry-After` dado. */
function blocked(retryAfter: number): Reply {
  const reply = problem(429, 'too_many_attempts');
  if (reply === 'hang' || 'bytes' in reply) throw new Error('resposta inesperada');
  return { ...reply, headers: { ...reply.headers, 'Retry-After': String(retryAfter) } };
}

const FIRST_ACCESS_SENT =
  'Se o CPF e o e-mail forem de um aluno com cadastro, enviamos um link para o e-mail da ficha. Ele vale por 24 horas. Se você já tem senha, use Esqueci minha senha.';

test('first_access_page_states', async ({ page, api }) => {
  await page.goto('/primeiro-acesso');
  await expect(page.getByLabel('CPF', { exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir acesso', exact: true })).toBeVisible();

  const fill = async () => {
    await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
    await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
    await page.getByRole('button', { name: 'Pedir acesso', exact: true }).click();
  };

  // 202: a mensagem única
  api.on('POST', '/api/portal/first-access', { status: 202 });
  await fill();
  await expect(page.getByText(FIRST_ACCESS_SENT, { exact: true })).toBeVisible();
  const sent = api.requests.filter((request) => request.method === 'POST' && request.path === '/api/portal/first-access');
  expect(sent).toHaveLength(1);
  expect(Object.keys(sent[0]!.body as object).sort()).toEqual(['cpf', 'email']);

  // 422 em `cpf`: a mensagem junto do campo
  api.on('POST', '/api/portal/first-access', problem(422, 'validation_failed', [{ path: 'cpf', message: 'CPF recusado pela API.' }]));
  await page.goto('/primeiro-acesso');
  await fill();
  await expect(page.getByLabel('CPF', { exact: true })).toHaveAccessibleDescription('CPF recusado pela API.');

  // 429 com `Retry-After: 120`
  api.on('POST', '/api/portal/first-access', blocked(120));
  await page.goto('/primeiro-acesso');
  await fill();
  await expect(page.getByText('Muitas tentativas. Tente novamente em 2 minutos.', { exact: true })).toBeVisible();
});

const consumeCalls = (api: FakeApi) =>
  api.requests.filter((request) => request.method === 'POST' && request.path === '/api/password-tokens/consume');

test('set_password_page_posts_only_on_submit', async ({ page, api }) => {
  api.on('POST', '/api/password-tokens/consume', { status: 204 });
  await page.goto('/definir-senha?token=t1');

  await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirmar senha', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Definir senha', exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(consumeCalls(api)).toEqual([]);

  // 11 caracteres: a mensagem junto do campo, sem chamada
  await page.getByLabel('Nova senha', { exact: true }).fill('a'.repeat(11));
  await page.getByLabel('Confirmar senha', { exact: true }).fill('a'.repeat(11));
  await page.getByRole('button', { name: 'Definir senha', exact: true }).click();
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveAccessibleDescription(/\S/);
  expect(consumeCalls(api)).toEqual([]);

  // a confirmação diferente: a mensagem junto dela, sem chamada
  await page.getByLabel('Nova senha', { exact: true }).fill('senha-do-aluno-123');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-do-aluno-124');
  await page.getByRole('button', { name: 'Definir senha', exact: true }).click();
  await expect(page.getByLabel('Confirmar senha', { exact: true })).toHaveAccessibleDescription(/\S/);
  expect(consumeCalls(api)).toEqual([]);

  // o envio válido manda o token da URL e a senha, nada mais
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-do-aluno-123');
  await page.getByRole('button', { name: 'Definir senha', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  const [call] = consumeCalls(api);
  expect(JSON.stringify(call!.body)).toBe(JSON.stringify({ token: 't1', password: 'senha-do-aluno-123' }));
});

test('set_password_success_and_invalid_link_messages', async ({ page, api }) => {
  const submit = async () => {
    await page.getByLabel('Nova senha', { exact: true }).fill('senha-do-aluno-123');
    await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-do-aluno-123');
    await page.getByRole('button', { name: 'Definir senha', exact: true }).click();
  };

  // 204: o login com a mensagem
  api.on('POST', '/api/password-tokens/consume', { status: 204 });
  await page.goto('/definir-senha?token=t1');
  await submit();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByText('Senha definida. Entre com seu e-mail e a nova senha.', { exact: true })).toBeVisible();

  // 422 em `token`: o link não vale mais, com os dois caminhos
  api.on(
    'POST',
    '/api/password-tokens/consume',
    problem(422, 'validation_failed', [{ path: 'token', message: 'Este link não vale mais. Peça outro em Primeiro acesso ou em Esqueci minha senha.' }]),
  );
  await page.goto('/definir-senha?token=t1');
  await submit();
  await expect(
    page.getByText('Este link não vale mais. Peça outro em Primeiro acesso ou em Esqueci minha senha.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Primeiro acesso', exact: true })).toHaveAttribute('href', '/primeiro-acesso');
  await expect(page.getByRole('link', { name: 'Esqueci minha senha', exact: true })).toHaveAttribute('href', '/esqueci-senha');

  // 422 em `password`: a mensagem junto de "Nova senha"
  api.on('POST', '/api/password-tokens/consume', problem(422, 'validation_failed', [{ path: 'password', message: 'Senha recusada pela API.' }]));
  await page.goto('/definir-senha?token=t1');
  await submit();
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveAccessibleDescription('Senha recusada pela API.');
});

test('forgot_password_page_states', async ({ page, api }) => {
  const send = async () => {
    await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
    await page.getByRole('button', { name: 'Enviar link', exact: true }).click();
  };

  api.on('POST', '/api/password-reset', { status: 202 });
  await page.goto('/esqueci-senha');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await send();
  await expect(page.getByText('Se o e-mail for de um aluno com acesso, enviamos um link. Ele vale por 1 hora.', { exact: true })).toBeVisible();

  api.on('POST', '/api/password-reset', blocked(120));
  await page.goto('/esqueci-senha');
  await send();
  await expect(page.getByText('Muitas tentativas. Tente novamente em 2 minutos.', { exact: true })).toBeVisible();
});
