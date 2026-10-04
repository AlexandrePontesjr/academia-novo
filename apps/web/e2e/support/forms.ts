import type { Page } from '@playwright/test';
import { type FakeApi, sessionOf, userOf } from './fake-api.ts';

export interface FormCase {
  name: string;
  /** A rota que o envio chama. */
  route: [method: string, path: string];
  /** O botão de envio. */
  submit: string;
  /** Um campo do formulário e o `path` que a API usa para ele. */
  field: { label: string; path: string };
  /** Abre a tela e preenche o formulário com valores que passam na validação do navegador. */
  open: (page: Page, api: FakeApi) => Promise<void>;
}

/** Os cinco formulários com envio. O teste define o que a rota de cada um responde. */
export const FORMS: FormCase[] = [
  {
    name: 'login',
    route: ['POST', '/api/auth/login'],
    submit: 'Entrar',
    field: { label: 'E-mail', path: 'email' },
    open: async (page, api) => {
      api.session = undefined;
      await page.goto('/login');
      await page.getByLabel('E-mail').fill('marina@exemplo.com');
      await page.getByLabel('Senha').fill('senha-de-teste-123');
    },
  },
  {
    name: 'segundo fator',
    route: ['POST', '/api/auth/two-factor/verify'],
    submit: 'Verificar',
    field: { label: 'Código de 6 dígitos', path: 'code' },
    open: async (page, api) => {
      api.session = undefined;
      await page.goto('/login/two-factor');
      await page.getByLabel('Código de 6 dígitos').fill('123456');
    },
  },
  {
    name: 'cadastro do 2FA',
    route: ['POST', '/api/auth/two-factor/enable'],
    submit: 'Continuar',
    field: { label: 'Senha', path: 'password' },
    open: async (page, api) => {
      api.session = sessionOf('admin', { twoFactorEnabled: false });
      await page.goto('/two-factor/setup');
      await page.getByLabel('Senha').fill('senha-de-teste-123');
    },
  },
  {
    name: 'usuário',
    route: ['POST', '/api/users'],
    submit: 'Criar usuário',
    field: { label: 'Nome', path: 'name' },
    open: async (page, api) => {
      api.session = sessionOf('admin');
      api.on('GET', '/api/users', { status: 200, body: { users: [userOf(1)] } });
      await page.goto('/users');
      await page.getByRole('button', { name: 'Novo usuário' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Nome').fill('Nova Pessoa');
      await dialog.getByLabel('E-mail').fill('nova@exemplo.com');
      await dialog.getByLabel('Senha').fill('senha-de-teste-123');
    },
  },
  {
    name: 'troca de senha',
    route: ['PUT', '/api/auth/password'],
    submit: 'Trocar senha',
    field: { label: 'Nova senha', path: 'newPassword' },
    open: async (page, api) => {
      api.session = sessionOf('reception');
      await page.goto('/account');
      await page.getByLabel('Senha atual').fill('senha-de-teste-123');
      await page.getByLabel('Nova senha').fill('senha-nova-de-teste-456');
    },
  },
];
