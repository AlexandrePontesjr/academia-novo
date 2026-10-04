import { expect, sessionOf, test } from './support/fake-api.ts';

const ENABLE = 'Ativar verificação em duas etapas';
const DISABLE = 'Desativar verificação em duas etapas';

test('account_offers_password_and_2fa_toggle', async ({ page, api }) => {
  const cases = [
    { twoFactorEnabled: false, offered: ENABLE, hidden: DISABLE },
    { twoFactorEnabled: true, offered: DISABLE, hidden: ENABLE },
  ];

  for (const { twoFactorEnabled, offered, hidden } of cases) {
    api.session = sessionOf('reception', { twoFactorEnabled });

    await page.goto('/account');

    await expect(page.getByLabel('Senha atual')).toBeVisible();
    await expect(page.getByLabel('Nova senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trocar senha', exact: true })).toBeVisible();
    await expect(page.getByText(offered, { exact: true }), offered).toBeVisible();
    await expect(page.getByText(hidden, { exact: true }), hidden).toHaveCount(0);
  }
});
