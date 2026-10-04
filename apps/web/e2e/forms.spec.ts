import { expect, problem, test } from './support/fake-api.ts';
import { FORMS } from './support/forms.ts';

const UNAVAILABLE = 'Serviço indisponível. Tente novamente em instantes.';

test('field_errors_shown_on_four_forms', async ({ page, api }) => {
  const forms = FORMS.filter((form) => ['login', 'cadastro do 2FA', 'usuário', 'troca de senha'].includes(form.name));
  expect(forms).toHaveLength(4);

  for (const form of forms) {
    const message = `Mensagem da API para ${form.field.path}`;
    api.on(...form.route, problem(422, 'validation_failed', [{ path: form.field.path, message }]));
    await form.open(page, api);

    await page.getByRole('button', { name: form.submit, exact: true }).click();

    // a mensagem fica ligada ao campo indicado em `path`, e só a ele
    await expect(page.getByLabel(form.field.label, { exact: true }), form.name).toHaveAccessibleDescription(message);
    await expect(page.getByText(message, { exact: true }), form.name).toHaveCount(1);
  }
});

test('unavailable_api_message_on_five_screens', async ({ page, api }) => {
  test.setTimeout(120_000);
  expect(FORMS).toHaveLength(5);

  let combinations = 0;
  for (const form of FORMS) {
    for (const [mode, reply] of [
      ['pendurada', 'hang'],
      ['500', problem(500, 'internal_error')],
    ] as const) {
      api.on(...form.route, reply);
      await form.open(page, api);
      const url = page.url();

      await page.getByRole('button', { name: form.submit, exact: true }).click();

      await expect(page.getByText(UNAVAILABLE, { exact: true }), `${form.name}, API ${mode}`).toBeVisible({
        timeout: 8000,
      });
      expect(page.url(), `${form.name}, API ${mode}`).toBe(url);
      combinations += 1;
    }
  }
  expect(combinations).toBe(10);
});

test('submit_disabled_while_pending_on_five_forms', async ({ page, api }) => {
  expect(FORMS).toHaveLength(5);

  for (const form of FORMS) {
    api.on(...form.route, 'hang');
    await form.open(page, api);
    const submit = page.getByRole('button', { name: form.submit, exact: true });
    await expect(submit, form.name).toBeEnabled();

    await submit.click();

    await expect(submit, form.name).toBeDisabled();
    // a requisição chegou à API e ainda não tem resposta
    expect(api.requests.some((request) => request.method === form.route[0] && request.path === form.route[1]), form.name).toBe(true);
  }
});
