import type { MyProfile, StudentPayment } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, servePhotoFile, sessionOf, test } from './support/fake-api.ts';
import { PHOTO_PATH, PHOTO_URL, pngFile } from './support/photo.ts';

const PENDING_PHOTO_PATH = '/api/photo-files/018f0000-0000-7000-8000-000000000998/medium';
const LOAD_ERROR = 'Não foi possível carregar seus dados agora. Tente de novo em instantes.';

function profileOf(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    name: 'Ana Souza',
    cpf: '52998224725',
    birthDate: '2000-01-01',
    email: 'ana@example.com',
    phone: '11912345678',
    address: 'Rua das Flores, 10',
    emergencyContactName: 'Bia Lima',
    emergencyContactPhone: '11933334444',
    status: 'active',
    photoUrl: null,
    pendingPhoto: null,
    ...overrides,
  };
}

function periodOf(n: number, startsAt: string, status: StudentPayment['status']): StudentPayment {
  return {
    enrollmentId: `018f0000-0000-7000-8000-00000000050${n}`,
    plan: { id: '018f0000-0000-7000-8000-000000000600', name: `Plano ${n}`, period: 'monthly' },
    startsAt,
    endsAt: startsAt.replace(/-\d\d$/, '-28'),
    priceCents: 9990,
    dueDate: startsAt,
    status,
    payment: null,
  };
}

function serve(api: FakeApi, profile: MyProfile = profileOf(), items: StudentPayment[] = []) {
  api.session = sessionOf('student', { name: profile.name, email: profile.email! });
  api.on('GET', '/api/me/profile', { status: 200, body: profile });
  api.on('GET', '/api/me/payments', { status: 200, body: { items } });
}

const field = (page: Page, name: string) => page.getByLabel(name, { exact: true });

test('minha_conta_profile_photo_and_periods_newest_first', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  serve(api, profileOf({ photoUrl: PHOTO_URL }), [
    periodOf(1, '2026-02-01', 'overdue'),
    periodOf(2, '2026-04-01', 'pending'),
    periodOf(3, '2026-03-01', 'paid'),
  ]);

  await page.goto('/minha-conta');

  await expect(page.getByText('Ana Souza', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Foto de Ana Souza' })).toHaveAttribute('src', PHOTO_URL);
  await expect(field(page, 'Telefone')).toHaveValue('(11) 91234-5678');
  await expect(field(page, 'Endereço')).toHaveValue('Rua das Flores, 10');
  await expect(field(page, 'Contato de emergência (nome)')).toHaveValue('Bia Lima');
  await expect(field(page, 'Contato de emergência (telefone)')).toHaveValue('(11) 93333-4444');

  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).getByRole('columnheader')).toHaveText(['Plano', 'Período', 'Vencimento', 'Situação']);
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['Plano 2', '01/04/2026 a 28/04/2026', '01/04/2026', 'Pendente']);
  await expect(rows.nth(2).getByRole('cell')).toHaveText(['Plano 3', '01/03/2026 a 28/03/2026', '01/03/2026', 'Pago']);
  await expect(rows.nth(3).getByRole('cell')).toHaveText(['Plano 1', '01/02/2026 a 28/02/2026', '01/02/2026', 'Atrasado']);

  // sem foto, o espaço vazio do componente de foto
  serve(api, profileOf());
  await page.goto('/minha-conta');
  await expect(page.getByRole('img', { name: 'Sem foto' })).toBeVisible();
});

test('minha_conta_without_enrollment_message', async ({ page, api }) => {
  serve(api);

  await page.goto('/minha-conta');

  await expect(page.getByText('Você ainda não tem matrícula registrada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('minha_conta_load_error_and_retry', async ({ page, api }) => {
  serve(api);
  api.on('GET', '/api/me/profile', problem(500, 'internal_error'));
  await page.goto('/minha-conta');
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();

  serve(api);
  api.on('GET', '/api/me/payments', problem(503, 'service_unavailable'));
  await page.goto('/minha-conta');
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toBeVisible();

  serve(api);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();

  await expect(field(page, 'Telefone')).toHaveValue('(11) 91234-5678');
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0);
});

test('minha_conta_one_column_at_390', async ({ page, api }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  serve(api, profileOf(), [periodOf(1, '2026-02-01', 'overdue'), periodOf(2, '2026-04-01', 'pending')]);

  await page.goto('/minha-conta');
  await expect(page.getByRole('table')).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBe(clientWidth);

  const sections = await page.locator('main section').evaluateAll((all) => all.map((section) => section.getBoundingClientRect().toJSON() as DOMRect));
  expect(sections).toHaveLength(3);
  for (let at = 1; at < sections.length; at += 1) expect(sections[at]!.top).toBeGreaterThanOrEqual(sections[at - 1]!.bottom);
});

test('contact_form_saves_and_shows_field_errors', async ({ page, api }) => {
  serve(api);
  await page.goto('/minha-conta');
  await expect(field(page, 'Telefone')).toBeVisible();

  // e-mail e CPF são texto, e só os quatro campos têm `input`
  await expect(page.getByText('ana@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('529.982.247-25', { exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveCount(0);
  await expect(page.getByLabel('CPF')).toHaveCount(0);
  const labels = await page.locator('main form input').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).labels?.[0]?.textContent),
  );
  expect(labels).toEqual(['Telefone', 'Endereço', 'Contato de emergência (nome)', 'Contato de emergência (telefone)']);

  api.on('PATCH', '/api/me/profile', {
    status: 200,
    body: profileOf({ address: 'Av. Central, 100' }),
  });
  await field(page, 'Endereço').fill('Av. Central, 100');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByText('Dados atualizados.', { exact: true })).toBeVisible();
  await expect(field(page, 'Endereço')).toHaveValue('Av. Central, 100');
  const sent = api.requests.filter((request) => request.method === 'PATCH' && request.path === '/api/me/profile');
  expect(sent.map((request) => request.body)).toEqual([{ address: 'Av. Central, 100' }]);

  api.on(
    'PATCH',
    '/api/me/profile',
    problem(422, 'validation_failed', [
      { path: 'phone', message: 'Telefone recusado pela API.' },
      { path: 'address', message: 'Endereço recusado pela API.' },
    ]),
  );
  await field(page, 'Telefone').fill('123');
  await field(page, 'Endereço').fill('x');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(field(page, 'Telefone')).toHaveAccessibleDescription('Telefone recusado pela API.');
  await expect(field(page, 'Endereço')).toHaveAccessibleDescription('Endereço recusado pela API.');
});

test('pending_photo_message_hides_upload', async ({ page, api }) => {
  servePhotoFile(api, PENDING_PHOTO_PATH);
  const pendingPhoto = {
    id: '018f0000-0000-7000-8000-000000000998',
    version: 2,
    createdAt: '2026-10-30T12:00:00.000Z',
    url: `${PENDING_PHOTO_PATH}?exp=2000000000&sig=assinatura`,
  };
  serve(api, profileOf({ pendingPhoto }));

  await page.goto('/minha-conta');

  await expect(page.getByText('Aguardando aprovação da recepção.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Foto aguardando aprovação' })).toHaveAttribute('src', pendingPhoto.url);
  await expect(page.getByRole('button', { name: 'Enviar foto', exact: true })).toHaveCount(0);

  serve(api);
  await page.goto('/minha-conta');
  await expect(page.getByText('Aguardando aprovação da recepção.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar foto', exact: true })).toBeVisible();

  // o arquivo escolhido abre o recorte 3:4, e salvar envia `POST /api/me/photo`
  api.on('POST', '/api/me/photo', problem(409, 'pending_photo_exists'));
  await page.locator('input[type="file"]').setInputFiles(pngFile(600, 800));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Salvar foto', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar foto', exact: true }).click();

  await expect(dialog.getByText('Você já enviou uma foto que aguarda aprovação da recepção.', { exact: true })).toBeVisible();
  const sent = api.requests.filter((request) => request.method === 'POST' && request.path === '/api/me/photo');
  expect(sent).toHaveLength(1);
  expect((sent[0]!.body as { parts: Array<{ name: string }> }).parts.map((part) => part.name)).toEqual(['file']);
});
