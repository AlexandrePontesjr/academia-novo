import type { Role } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import {
  historyItemOf,
  listItemOf,
  reportItemOf,
  reportOf,
  serveSearch,
  statusOf,
  statusPath,
} from './support/check-ins.ts';
import { card, serveDashboard, under } from './support/dashboard.ts';
import { expect, type FakeApi, problem, sessionOf, test, userOf } from './support/fake-api.ts';
import {
  enrollmentOf,
  planOf,
  serveFicha,
  servePlans,
  STUDENT_ID,
  studentOf,
  stateOf,
} from './support/plans.ts';
import {
  openPaymentOf,
  paymentsStateOf,
  periodOf,
  serveOpenPayments,
  servePayments,
} from './support/payments.ts';
import { attachment, staffExportOf, staffExportPath, studentExportOf, studentExportPath } from './support/privacy.ts';
import { serveStaffAs, staffOf, STAFF_ID } from './support/staff.ts';

/**
 * A prova da identidade visual (`.specs/features/identidade-visual`): os valores computados que o
 * plano fixa, lidos de um Chromium real sobre o build de produção. Não há assert de classe: o que
 * importa é a cor, o raio e a estrutura que o navegador resolve.
 */

const DARK = 'rgb(10, 10, 10)';
const LIGHT = 'rgb(245, 245, 245)';
const CARD = 'rgb(20, 20, 20)';
const HEADER = 'rgb(31, 31, 31)';
const BORDER = 'rgb(38, 38, 38)';
const INPUT = 'rgb(42, 42, 42)';
const LIME = 'rgb(205, 247, 32)';
const RED = 'rgb(220, 38, 38)';
const DANGER = 'rgb(248, 113, 113)';

const PLAN_ID = planOf().id;
const STUDENT = studentOf();
const STAFF = staffOf();
const ONE_ENROLLMENT = enrollmentOf();
const ONE_PERIOD = periodOf();

/** Alimenta a API falsa com tudo o que as 24 telas leem, para um perfil. */
function serveWorld(api: FakeApi, role: Role) {
  servePlans(api, stateOf({ plans: [planOf()], enrollments: { [STUDENT_ID]: [ONE_ENROLLMENT] } }));
  serveFicha(api, role, STUDENT, stateOf({ plans: [planOf()], enrollments: { [STUDENT_ID]: [ONE_ENROLLMENT] } }));
  servePayments(api, STUDENT_ID, paymentsStateOf({ periods: { [STUDENT_ID]: [ONE_PERIOD] } }));
  serveStaffAs(api, role, { staff: [STAFF], users: [userOf(1)] });
  serveOpenPayments(api, role, [openPaymentOf()]);
  serveDashboard(api, role);

  api.on('GET', '/api/students', {
    status: 200,
    body: { items: [listItemOf(1), listItemOf(2)], nextCursor: null },
  });
  api.on('GET', `/api/students/${STUDENT_ID}/check-ins`, {
    status: 200,
    body: { items: [historyItemOf(1)], nextCursor: null },
  });
  api.on('GET', statusPath(STUDENT_ID), { status: 200, body: statusOf(STUDENT_ID) });
  api.on('GET', studentExportPath, attachment(studentExportOf(), `aluno-${STUDENT_ID}.json`));
  api.on('GET', staffExportPath, attachment(staffExportOf(), `funcionario-${STAFF_ID}.json`));
  api.on('GET', '/api/check-ins', { status: 200, body: reportOf({ total: 1, items: [reportItemOf(2)] }) });
  api.on('GET', '/api/audit-logs', { status: 200, body: { items: [], nextCursor: null } });
  api.on('GET', '/api/privacy-settings', {
    status: 200,
    body: { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 },
  });
  api.session = sessionOf(role);
}

/** O CSS computado de um elemento, com o valor cru e o sRGB resolvido (o Chromium serializa `oklch`). */
async function styleOf(locator: Locator, property: string, pseudo?: string) {
  return locator.evaluate(
    (element, args) => {
      const style = getComputedStyle(element, args.pseudo ?? null);
      const raw = style.getPropertyValue(args.property);
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = raw;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { raw, rgb: `rgb(${r}, ${g}, ${b})` };
    },
    { property, pseudo },
  );
}

const flat = (value: string) => value.replace(/\s+/g, ' ').trim();

interface Screen {
  path: string;
  /** `false` nas telas sem o shell (login e cadastro do 2FA). */
  shell: boolean;
  /** Os h1/h2/h3 de `main`, na ordem do DOM (o h1 do shell fica no header). */
  headings: string[];
  columns?: string[];
  labels?: string[];
  texts?: string[];
}

const SCREENS: Screen[] = [
  {
    path: '/login',
    shell: false,
    headings: ['Entrar'],
    labels: ['E-mail', 'Senha'],
    texts: ['Entrar'],
  },
  {
    path: '/login/two-factor',
    shell: false,
    headings: ['Verificação em duas etapas'],
    labels: ['Código de 6 dígitos'],
    texts: ['Verificar', 'Usar código de recuperação'],
  },
  {
    path: '/two-factor/setup',
    shell: false,
    headings: ['Ativar verificação em duas etapas'],
    labels: ['Senha'],
    texts: ['Confirme sua senha para gerar o QR code.'],
  },
  {
    path: '/',
    shell: true,
    headings: [
      'Painel',
      'Alunos',
      'Check-ins de hoje',
      'Matrículas',
      'Vencimentos nos próximos 7 dias',
      'Pagamentos',
      'Matrículas ativas por plano',
    ],
    columns: ['Aluno', 'Plano', 'Vence em', 'Plano', 'Matrículas ativas'],
    texts: ['Olá, Marina Duarte.', 'Ver alunos', 'Ver presenças de hoje'],
  },
  {
    path: '/students',
    shell: true,
    headings: ['Alunos'],
    columns: ['Nome', 'CPF', 'Telefone', 'Situação'],
    labels: ['Buscar por nome, CPF ou telefone', 'Situação'],
    texts: ['Novo aluno', 'Buscar', 'Limpar'],
  },
  {
    path: '/students/new',
    shell: true,
    headings: ['Novo aluno'],
    labels: [
      'Nome completo',
      'CPF',
      'Data de nascimento',
      'Sexo',
      'E-mail',
      'Telefone',
      'Endereço',
      'Contato de emergência (nome)',
      'Contato de emergência (telefone)',
      'Observações de saúde',
    ],
    texts: ['Salvar'],
  },
  {
    path: `/students/${STUDENT_ID}`,
    shell: true,
    headings: ['Rafaela Prado Cunha', 'Responsável e consentimentos', 'Matrículas', 'Pagamentos', 'Presenças', 'Privacidade'],
    columns: [
      'Plano',
      'Início',
      'Vencimento',
      'Valor',
      'Situação',
      'Período',
      'Pagar até',
      'Valor',
      'Situação',
      'Data',
      'Hora',
      'Registrado por',
    ],
    texts: ['Editar', 'Inativar'],
  },
  {
    path: `/students/${STUDENT_ID}/edit`,
    shell: true,
    headings: ['Editar aluno'],
    labels: [
      'Nome completo',
      'CPF',
      'Data de nascimento',
      'Sexo',
      'E-mail',
      'Telefone',
      'Endereço',
      'Contato de emergência (nome)',
      'Contato de emergência (telefone)',
      'Observações de saúde',
    ],
    texts: ['Salvar'],
  },
  {
    path: '/staff',
    shell: true,
    headings: ['Funcionários'],
    columns: ['Nome', 'Cargo', 'Setor', 'Situação'],
    texts: ['Novo funcionário'],
  },
  {
    path: '/staff/new',
    shell: true,
    headings: ['Novo funcionário'],
    labels: ['Nome completo', 'CPF', 'Cargo', 'Setor', 'Data de admissão', 'Telefone', 'E-mail'],
    texts: ['Salvar'],
  },
  {
    path: `/staff/${STAFF_ID}`,
    shell: true,
    headings: ['Rafaela Prado Cunha', 'Acesso ao sistema', 'Privacidade'],
    labels: ['Usuário vinculado'],
    texts: ['Sem usuário vinculado'],
  },
  {
    path: `/staff/${STAFF_ID}/edit`,
    shell: true,
    headings: ['Editar funcionário'],
    labels: ['Nome completo', 'CPF', 'Cargo', 'Setor', 'Data de admissão', 'Telefone', 'E-mail'],
    texts: ['Salvar'],
  },
  {
    path: '/plans',
    shell: true,
    headings: ['Planos'],
    columns: ['Nome', 'Periodicidade', 'Valor', 'Regras de acesso', 'Situação'],
    texts: ['Novo plano'],
  },
  {
    path: '/plans/new',
    shell: true,
    headings: ['Novo plano'],
    labels: ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso'],
    texts: ['Salvar'],
  },
  {
    path: `/plans/${PLAN_ID}/edit`,
    shell: true,
    headings: ['Editar plano'],
    labels: ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso'],
    texts: ['Salvar', 'Inativar'],
  },
  {
    path: '/payments',
    shell: true,
    headings: ['Pagamentos'],
    columns: ['Aluno', 'Plano', 'Período', 'Pagar até', 'Valor', 'Situação'],
    labels: ['Situação'],
  },
  {
    path: '/check-ins',
    shell: true,
    headings: ['Presenças'],
    columns: ['Data', 'Hora', 'Aluno', 'Registrado por'],
    labels: ['De', 'Até'],
    texts: ['Total no período: 1'],
  },
  {
    path: '/check-in',
    shell: true,
    headings: ['Check-in'],
    labels: ['Nome ou CPF'],
    texts: ['Buscar'],
  },
  {
    path: '/audit',
    shell: true,
    headings: ['Auditoria'],
    labels: ['De', 'Até', 'Usuário', 'Ação', 'IP'],
    texts: ['Nenhum registro encontrado.'],
  },
  {
    path: '/users',
    shell: true,
    headings: ['Usuários'],
    columns: ['Nome', 'E-mail', 'Perfil', 'Situação', '2FA', 'Ações'],
    texts: ['Novo usuário'],
  },
  {
    path: '/privacy',
    shell: true,
    headings: ['Privacidade'],
    labels: ['Anonimizar alunos inativos há mais de', 'Desligado', 'Guardar versões de foto por'],
    texts: ['Salvar'],
  },
  {
    path: '/account',
    shell: true,
    headings: ['Trocar senha', 'Verificação em duas etapas'],
    labels: ['Senha atual', 'Nova senha'],
  },
  {
    path: `/students/${STUDENT_ID}/print`,
    shell: true,
    headings: [
      'Dados do aluno: Rafaela Prado Cunha',
      'Dados pessoais',
      'Responsáveis',
      'Consentimentos',
      'Matrículas',
      'Pagamentos',
      'Presenças',
      'Fotos',
    ],
    columns: [
      'Nome',
      'CPF',
      'Telefone',
      'Parentesco',
      'Cadastrado em',
      'Finalidade',
      'Versão do termo',
      'Texto do termo',
      'Concedido por',
      'Concedido em',
      'Revogado em',
      'Plano',
      'Início',
      'Vencimento',
      'Valor',
      'Cancelada em',
      'Período que começa em',
      'Confirmado em',
      'Desfeito em',
      'Dia',
      'Registrada em',
    ],
    texts: ['Imprimir'],
  },
  {
    path: `/staff/${STAFF_ID}/print`,
    shell: true,
    headings: ['Dados do funcionário: Rafaela Prado Cunha', 'Dados pessoais', 'Usuário', 'Fotos'],
    texts: ['Imprimir'],
  },
];

const AUTHENTICATED = SCREENS.filter(
  (screen) => screen.path !== '/login' && screen.path !== '/login/two-factor',
);

/** Abre a tela com a sessão que ela espera; devolve a resposta do documento. */
async function open(page: Page, api: FakeApi, path: string) {
  if (path.startsWith('/login')) api.session = undefined;
  else if (!api.session) api.session = sessionOf('admin');
  return page.goto(path);
}

test('every_authenticated_screen_uses_the_dark_background_and_foreground', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');
  expect(AUTHENTICATED).toHaveLength(22);

  for (const screen of AUTHENTICATED) {
    await open(page, api, screen.path);
    const body = page.locator('body');
    expect((await styleOf(body, 'background-color')).rgb, screen.path).toBe(DARK);
    expect((await styleOf(body, 'color')).rgb, screen.path).toBe(LIGHT);
  }
});

test('primary_button_is_the_lime_pill_with_dark_label', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');

  const submit = page.getByRole('button', { name: 'Entrar', exact: true });
  await expect(submit).toBeVisible();
  expect((await styleOf(submit, 'background-color')).rgb).toBe(LIME);
  expect((await styleOf(submit, 'color')).rgb).toBe(DARK);
  expect((await styleOf(submit, 'border-radius')).raw).toBe('9999px');
});

test('cards_are_layered_surfaces_with_sixteen_radius', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/');

  const alunos = card(page, 'Alunos');
  expect((await styleOf(alunos, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(alunos, 'border-top-color')).rgb).toBe(BORDER);
  expect((await styleOf(alunos, 'border-bottom-color')).rgb).toBe(BORDER);
  expect((await styleOf(alunos, 'border-radius')).raw).toBe('16px');
});

test('shell_header_and_active_link_match_the_identity', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/students');

  const header = page.locator('header');
  expect((await styleOf(header, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(header, 'border-bottom-color')).rgb).toBe(BORDER);

  const navigation = page.getByRole('navigation');
  expect((await styleOf(navigation.getByRole('link', { name: 'Alunos', exact: true }), 'color')).rgb).toBe(LIME);
  expect((await styleOf(navigation.getByRole('link', { name: 'Início', exact: true }), 'color')).rgb).not.toBe(LIME);

  await page.goto('/');
  expect(
    (await styleOf(navigation.getByRole('link', { name: 'Início', exact: true }), 'color')).rgb,
  ).toBe(LIME);
});

test('login_page_keeps_its_copy_on_the_dark_identity', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');

  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeVisible();
  const submit = page.getByRole('button', { name: 'Entrar', exact: true });
  expect((await styleOf(submit, 'background-color')).rgb).toBe(LIME);
  expect((await styleOf(submit, 'border-radius')).raw).toBe('9999px');
  expect((await styleOf(page.locator('body'), 'background-color')).rgb).toBe(DARK);
});

test('manrope_is_the_loaded_body_font_from_the_web_origin', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.toLowerCase()).toContain('manrope');
  expect(family).toContain('system-ui');

  const first = family.split(',')[0]!.trim();
  const loaded = await page.evaluate(
    (name) => ({ regular: document.fonts.check(`400 16px ${name}`), bold: document.fonts.check(`800 16px ${name}`) }),
    first,
  );
  expect(loaded).toEqual({ regular: true, bold: true });

  // o arquivo vem da própria origem do web, nunca de um CDN
  const fontUrls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\.woff2?($|\?)/.test(name)),
  );
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const url of fontUrls) expect(new URL(url).origin).toBe('http://127.0.0.1:3100');
});

test('light_scheme_preference_does_not_change_the_dark_palette', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/students');

  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toBe('dark');
  expect((await styleOf(page.locator('body'), 'background-color')).rgb).toBe(DARK);
  expect((await styleOf(page.locator('body'), 'color')).rgb).toBe(LIGHT);
});

test('dashboard_uses_the_identity_hierarchy', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/');

  const alunos = card(page, 'Alunos');
  expect((await styleOf(alunos.locator('h3'), 'color')).rgb).toBe(LIGHT);
  expect((await styleOf(alunos, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(under(alunos, 'Ativos'), 'font-variant-numeric')).raw).toBe('tabular-nums');
  expect((await styleOf(alunos.getByRole('link', { name: 'Ver alunos', exact: true }), 'color')).rgb).toBe(LIME);
});

test('lime_accent_only_on_primary_actions_links_and_focus', async ({ page, api }) => {
  serveWorld(api, 'admin');

  const scan = async () =>
    page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const rgb = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return `${r},${g},${b}`;
      };
      const backgrounds: string[] = [];
      const texts: string[] = [];
      for (const element of [document.body, ...Array.from(document.querySelectorAll('body *'))]) {
        const style = getComputedStyle(element);
        if (rgb(style.backgroundColor) === '205,247,32') backgrounds.push(element.tagName);
        if (rgb(style.color) === '205,247,32') texts.push(element.tagName);
      }
      return { backgrounds, texts };
    });

  await open(page, api, '/login');
  const login = await scan();
  expect(login.backgrounds.length).toBeGreaterThan(0);
  for (const tag of login.backgrounds) expect(['BUTTON', 'A']).toContain(tag);

  await open(page, api, '/students');
  const students = await scan();
  expect(students.backgrounds.length).toBeGreaterThan(0);
  for (const tag of students.backgrounds) expect(['BUTTON', 'A']).toContain(tag);
  for (const tag of students.texts) expect(tag).toBe('A');

  await open(page, api, '/');
  const dashboard = await scan();
  expect(dashboard.texts.length).toBeGreaterThan(0);
  for (const tag of dashboard.texts) expect(tag).toBe('A');
  for (const tag of dashboard.backgrounds) expect(['BUTTON', 'A']).toContain(tag);
});

test('tables_use_the_header_body_and_border_values', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/students');

  const table = page.getByRole('main').locator('table');
  const head = table.getByRole('columnheader').first();
  expect((await styleOf(head, 'background-color')).rgb).toBe(HEADER);
  expect((await styleOf(head, 'color')).rgb).toBe('rgb(212, 212, 212)');
  expect((await styleOf(table.locator('tbody td').first(), 'color')).rgb).toBe(LIGHT);

  const second = table.locator('tbody tr').nth(1);
  expect((await styleOf(second, 'border-top-color')).rgb).toBe(BORDER);
  expect((await styleOf(table.locator('xpath=..'), 'border-radius')).raw).toBe('16px');
});

test('form_controls_use_the_dark_surface_and_the_lime_focus', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');

  const email = page.getByLabel('E-mail');
  expect((await styleOf(email, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(email, 'border-top-color')).rgb).toBe(INPUT);
  expect((await styleOf(email, 'color')).rgb).toBe(LIGHT);

  await email.evaluate((element) => element.setAttribute('placeholder', 'exemplo@academia.com'));
  expect((await styleOf(email, 'color', '::placeholder')).rgb).toBe('rgb(138, 138, 138)');

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
  expect((await styleOf(email, 'outline-color')).rgb).toBe(LIME);
  expect((await styleOf(email, 'outline-width')).raw).toBe('2px');
  expect((await styleOf(email, 'outline-offset')).raw).toBe('2px');
  expect((await styleOf(email, 'outline-style')).raw).toBe('solid');

  await open(page, api, '/students');
  const select = page.getByLabel('Situação', { exact: true });
  expect((await styleOf(select, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(select, 'border-top-color')).rgb).toBe(INPUT);
  expect((await styleOf(select, 'color')).rgb).toBe(LIGHT);
});

test('invalid_control_and_error_text_use_the_red', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  const email = page.getByLabel('E-mail');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  expect((await styleOf(email, 'border-top-color')).rgb).toBe(DANGER);
  const message = page.getByText('Informe um e-mail válido.', { exact: true });
  await expect(message).toBeVisible();
  expect((await styleOf(message, 'color')).rgb).toBe(DANGER);
  expect((await styleOf(page.getByLabel('Senha'), 'border-top-color')).rgb).toBe(DANGER);
});

test('alert_variants_use_the_dark_and_destructive_values', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/students?anonymized=1');

  const notice = page.getByRole('main').locator('[role="alert"]');
  await expect(notice).toBeVisible();
  expect((await styleOf(notice, 'background-color')).rgb).toBe(HEADER);
  expect((await styleOf(notice, 'color')).rgb).toBe('rgb(212, 212, 212)');

  api.on('GET', '/api/students', problem(500, 'internal_error'));
  await page.goto('/students');
  const failure = page.getByRole('main').locator('[role="alert"]');
  await expect(failure).toBeVisible();
  expect((await styleOf(failure, 'color')).rgb).toBe(DANGER);
  expect((await styleOf(failure, 'border-top-color')).rgb).toBe(DANGER);
});

test('dialog_overlay_and_content_use_the_identity', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/users');
  await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();

  const overlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(overlay).toBeVisible();
  expect((await styleOf(overlay, 'background-color')).raw).toBe('rgba(0, 0, 0, 0.7)');

  const content = page.locator('[data-slot="dialog-content"]');
  await expect(content).toBeVisible();
  expect((await styleOf(content, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(content, 'border-top-color')).rgb).toBe(BORDER);
  expect((await styleOf(content, 'border-radius')).raw).toBe('16px');
});

test('check_in_badges_use_the_allowed_and_blocked_values', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const studentId = listItemOf(1).id;
  serveSearch(api, 'admin', [listItemOf(1)]);
  api.on('GET', statusPath(studentId), { status: 200, body: statusOf(studentId) });
  await page.goto('/check-in');

  const field = page.getByLabel('Nome ou CPF');
  await field.fill('Rafaela');
  await field.press('Enter');
  const allowed = page.getByText('Liberado', { exact: true });
  await expect(allowed).toBeVisible();
  expect((await styleOf(allowed, 'background-color')).raw).toBe('rgba(205, 247, 32, 0.15)');
  expect((await styleOf(allowed, 'color')).rgb).toBe(LIME);

  api.on('GET', statusPath(studentId), {
    status: 200,
    body: statusOf(studentId, { access: 'blocked', blockReasons: ['no_active_enrollment'], enrollment: null }),
  });
  await field.fill('Rafaela');
  await field.press('Enter');
  const blocked = page.getByText('Bloqueado', { exact: true });
  await expect(blocked).toBeVisible();
  expect((await styleOf(blocked, 'background-color')).raw).toBe('rgba(248, 113, 113, 0.15)');
  expect((await styleOf(blocked, 'color')).rgb).toBe(DANGER);
});

test('links_outside_the_nav_are_lime_with_four_pixel_offset', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/students');

  const link = page.getByRole('main').getByRole('link', { name: 'Aluno 1', exact: true });
  await expect(link).toBeVisible();
  expect((await styleOf(link, 'color')).rgb).toBe(LIME);
  expect((await styleOf(link, 'text-decoration-line')).raw).toBe('underline');
  expect((await styleOf(link, 'text-underline-offset')).raw).toBe('4px');
});

test('destructive_button_uses_the_red_surface_and_light_text', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto(`/students/${STUDENT_ID}`);

  const button = page.getByRole('button', { name: 'Inativar', exact: true });
  await expect(button).toBeVisible();
  expect((await styleOf(button, 'background-color')).rgb).toBe(RED);
  expect((await styleOf(button, 'color')).rgb).toBe('rgb(250, 250, 250)');
});

test('every_screen_keeps_its_copy_and_arrangement', async ({ page, api }) => {
  test.setTimeout(240_000);
  serveWorld(api, 'admin');
  expect(SCREENS).toHaveLength(24);

  for (const screen of SCREENS) {
    const response = await open(page, api, screen.path);
    expect(response?.status(), screen.path).toBe(200);

    const main = page.getByRole('main');
    await expect(main, screen.path).toBeVisible();

    if (screen.shell) {
      const header = page.locator('header');
      await expect(header, screen.path).toHaveCount(1);
      await expect(header.getByRole('heading', { level: 1, name: 'Gestão de Academia' }), screen.path).toBeVisible();
      await expect(header.getByRole('navigation'), screen.path).toHaveCount(1);
      const beforeMain = await page.evaluate(() => {
        const header = document.querySelector('header');
        const main = document.querySelector('main');
        if (!header || !main) return false;
        return Boolean(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(beforeMain, screen.path).toBe(true);
    } else {
      await expect(page.locator('header'), screen.path).toHaveCount(0);
    }

    const headings = await main.locator('h1, h2, h3').allTextContents();
    expect(headings.map(flat), screen.path).toEqual(screen.headings);

    if (screen.columns) {
      const columns = await main.getByRole('columnheader').allTextContents();
      expect(columns.map(flat), screen.path).toEqual(screen.columns);
    }

    if (screen.labels) {
      const labels = await main.locator('label').allTextContents();
      expect(labels.map(flat), screen.path).toEqual(screen.labels);
    }

    for (const text of screen.texts ?? []) {
      await expect(main.getByText(text, { exact: true }).first(), `${screen.path}: ${text}`).toBeVisible();
    }
  }

  api.session = sessionOf('admin');
});

test('print_media_resets_the_palette_to_white_and_black', async ({ page, api }) => {
  serveWorld(api, 'admin');

  const printed = async () => {
    await page.emulateMedia({ media: 'print' });
    const background = (await styleOf(page.locator('body'), 'background-color')).rgb;
    const color = (await styleOf(page.locator('body'), 'color')).rgb;
    await page.emulateMedia({ media: 'screen' });
    return { background, color };
  };
  const expected = { background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' };

  await page.goto('/students');
  expect(await printed()).toEqual(expected);

  await page.goto(`/students/${STUDENT_ID}/print`);
  expect(await printed()).toEqual(expected);

  await page.goto(`/staff/${STAFF_ID}/print`);
  expect(await printed()).toEqual(expected);
});

test('unknown_route_renders_the_dark_not_found_page', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const response = await page.goto('/rota-que-nao-existe');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao início', exact: true })).toHaveAttribute('href', '/');
  expect((await styleOf(page.locator('body'), 'background-color')).rgb).toBe(DARK);
});

test('keyboard_focus_shows_the_lime_ring_with_two_pixel_offset', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');
  await page.keyboard.press('Tab');

  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');

  const email = page.getByLabel('E-mail');
  expect((await styleOf(email, 'outline-color')).rgb).toBe(LIME);
  expect((await styleOf(email, 'outline-width')).raw).toBe('2px');
  expect((await styleOf(email, 'outline-offset')).raw).toBe('2px');
});

test('contrast_ratios_meet_the_minimums', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await open(page, api, '/login');
  const ratios = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgb = (color: string) => {
      context.fillStyle = color.trim();
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (channels: number[]) => {
      const linear = channels.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const contrast = (one: number[], other: number[]) => {
      const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
      return (light! + 0.05) / (dark! + 0.05);
    };
    const token = (name: string) => rgb(root.getPropertyValue(name));
    return {
      body: contrast(token('--foreground'), token('--background')),
      muted: contrast(token('--muted-foreground'), token('--background')),
      primary: contrast(token('--primary-foreground'), token('--primary')),
    };
  });

  expect(ratios.body).toBeGreaterThanOrEqual(7);
  expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
  expect(ratios.primary).toBeGreaterThanOrEqual(7);
});

test('four_profiles_never_render_a_surface_lighter_than_the_limit', async ({ page, api }) => {
  test.setTimeout(300_000);
  serveWorld(api, 'admin');
  const roles: Role[] = ['admin', 'reception', 'hr_finance', 'instructor'];
  let visits = 0;

  for (const role of roles) {
    api.session = sessionOf(role);
    for (const screen of AUTHENTICATED) {
      await page.goto(screen.path);
      const scan = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const rgb = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return [r!, g!, b!] as const;
        };
        const luminance = (channels: readonly number[]) => {
          const linear = channels.map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
        };
        const opaque = (color: string) => {
          if (!color || color === 'transparent') return false;
          if (color.includes(' / ')) return false;
          if (color.startsWith('rgba(')) return /,\s*1\)$/.test(color);
          return color.startsWith('rgb') || color.startsWith('oklch') || color.startsWith('color');
        };
        const limit = luminance(rgb('#2a2a2a'));
        const offenders: Array<{ tag: string; color: string }> = [];
        for (const element of Array.from(document.querySelectorAll('body *'))) {
          const tag = element.tagName;
          if (['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PATH', 'PICTURE', 'SOURCE', 'BUTTON', 'A'].includes(tag)) continue;
          const color = getComputedStyle(element).backgroundColor;
          if (!opaque(color)) continue;
          if (luminance(rgb(color)) > limit + 0.0001) offenders.push({ tag, color });
        }
        const body = rgb(getComputedStyle(document.body).backgroundColor);
        return { body: `rgb(${body[0]}, ${body[1]}, ${body[2]})`, offenders: offenders.slice(0, 6) };
      });

      expect(scan.body, `${role} ${screen.path}`).toBe(DARK);
      expect(scan.offenders, `${role} ${screen.path}`).toEqual([]);
      visits += 1;
    }
  }

  expect(visits).toBe(roles.length * AUTHENTICATED.length);
});
