import type { Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, servePhotoFile, test } from './support/fake-api.ts';
import {
  ajustar,
  choose,
  CROP_FRAME,
  decode,
  dropOn,
  framedRedBlue,
  frameRatio,
  ID,
  isBlue,
  isGreen,
  isRed,
  PHOTO_ID,
  PHOTO_PATH,
  PHOTO_URL,
  photoRequests,
  pngFile,
  type Point,
  redLeftBlueRight,
  serveFicha,
  serveMutableFicha,
  studentOf,
  type TestFile,
  uploadOf,
  WRITERS,
} from './support/photo.ts';

const AREA = 'Arraste uma foto aqui ou escolha um arquivo';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TOO_SMALL = 'A foto precisa ter pelo menos 300×400 pixels.';
const UNREADABLE = 'Use um arquivo JPEG, PNG ou WebP.';
const CREATED = { status: 201, body: { id: PHOTO_ID, version: 1, createdAt: '2026-10-05T02:30:00.000Z' } };
const PHOTO_ROUTE = `/api/students/${ID}/photo`;

const saveButton = (page: Page) => ajustar(page).getByRole('button', { name: 'Salvar foto', exact: true });
const zoomOf = (page: Page) => ajustar(page).getByLabel('Zoom', { exact: true });

async function expectFrame3by4(page: Page, message: string) {
  const ratio = await frameRatio(ajustar(page));
  expect(ratio, message).toBeGreaterThanOrEqual(0.74);
  expect(ratio, message).toBeLessThanOrEqual(0.76);
}

/** A ficha de um aluno sem foto, com a API aceitando o envio, e o arquivo já escolhido. */
async function openWithFile(page: Page, api: FakeApi, file: TestFile, role: Role = 'reception', way: 'escolher' | 'largar' = 'escolher') {
  api.requests.length = 0;
  serveFicha(api, role, studentOf({ photoUrl: null }));
  api.on('POST', PHOTO_ROUTE, CREATED);
  await page.goto(`/students/${ID}`);
  if (way === 'escolher') await choose(page, 'Enviar foto', file);
  else await dropOn(page, AREA, file);
  await expect(ajustar(page)).toBeVisible();
}

/** Aciona "Salvar foto" e devolve o JPEG que a API recebeu, decodificado pelo teste. */
async function saveAndDecode(page: Page, api: FakeApi, points: readonly Point[] = []) {
  const before = photoRequests(api).length;
  await saveButton(page).click();
  await expect.poll(() => photoRequests(api).length).toBe(before + 1);
  const upload = uploadOf(photoRequests(api)[before]!);
  return { upload, image: await decode(page, upload.parts[0]!.bytes, points) };
}

test('choosing_or_dropping_opens_ajustar_foto_with_3_4_frame_and_sends_nothing', async ({ page, api }) => {
  for (const role of WRITERS) {
    api.requests.length = 0;
    serveFicha(api, role, studentOf({ photoUrl: null }));

    await page.goto(`/students/${ID}`);

    await expect(page.getByText(AREA), role).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar foto', exact: true }), role).toBeVisible();

    // escolher o arquivo pelo botão
    expect(await choose(page, 'Enviar foto', pngFile(900, 1200)), role).toEqual(TYPES);
    await expect(ajustar(page), `${role}: escolher`).toBeVisible();
    await expect(ajustar(page).locator('img'), `${role}: escolher`).toBeVisible();
    await expectFrame3by4(page, `${role}: escolher`);
    expect(photoRequests(api), `${role}: escolher`).toHaveLength(0);

    await page.goto(`/students/${ID}`);

    // largar o arquivo na área
    await dropOn(page, AREA, pngFile(900, 1200, 'largada.png'));
    await expect(ajustar(page), `${role}: largar`).toBeVisible();
    await expect(ajustar(page).locator('img'), `${role}: largar`).toBeVisible();
    await expectFrame3by4(page, `${role}: largar`);
    expect(photoRequests(api), `${role}: largar`).toHaveLength(0);
  }
});

test('zoom_1_to_3_and_two_rotate_buttons_keep_the_frame_3_4', async ({ page, api }) => {
  await openWithFile(page, api, pngFile(1800, 2400));

  const zoom = zoomOf(page);
  await expect(zoom).toHaveAttribute('min', '1');
  await expect(zoom).toHaveAttribute('max', '3');
  await expect(zoom).toHaveValue('1');
  const left = ajustar(page).getByRole('button', { name: 'Girar à esquerda', exact: true });
  const right = ajustar(page).getByRole('button', { name: 'Girar à direita', exact: true });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expectFrame3by4(page, 'antes de girar');

  for (const [button, name] of [
    [left, 'esquerda'],
    [left, 'esquerda de novo'],
    [right, 'direita'],
    [right, 'direita de novo'],
    [right, 'direita uma terceira vez'],
  ] as const) {
    await button.click();
    await expectFrame3by4(page, name);
  }
});

test('untouched_save_sends_one_600x800_jpeg_file_part_red_left_blue_right', async ({ page, api }) => {
  // a moldura lateral fica fora da região; a de cima e a de baixo ficam dentro
  const EDGES: Point[] = [
    [0.05, 0.5],
    [0.95, 0.5],
    [0.25, 0.05],
    [0.75, 0.95],
  ];

  for (const role of WRITERS) {
    for (const way of ['escolher', 'largar'] as const) {
      const name = `${role}, ${way}`;
      await openWithFile(page, api, framedRedBlue(), role, way);

      const { upload, image } = await saveAndDecode(page, api, EDGES);

      expect(upload.contentType, name).toMatch(/^multipart\/form-data; boundary=/);
      expect(upload.parts, name).toHaveLength(1);
      expect(upload.parts[0]!.name, name).toBe('file');
      expect(upload.parts[0]!.filename, name).toBe('foto.jpg');
      expect([...upload.parts[0]!.bytes.subarray(0, 3)], name).toEqual([0xff, 0xd8, 0xff]);
      expect([image.width, image.height], name).toEqual([600, 800]);
      expect(isRed(image.atWidth25), `${name}: 25% da largura: ${image.atWidth25}`).toBe(true);
      expect(isBlue(image.atWidth75), `${name}: 75% da largura: ${image.atWidth75}`).toBe(true);
      const [left, right, top, bottom] = image.points;
      expect(isRed(left!), `${name}: 5% da largura: ${left}`).toBe(true);
      expect(isBlue(right!), `${name}: 95% da largura: ${right}`).toBe(true);
      expect(isGreen(top!), `${name}: 5% da altura: ${top}`).toBe(true);
      expect(isGreen(bottom!), `${name}: 95% da altura: ${bottom}`).toBe(true);

      // exatamente uma requisição de foto, também depois de a tela se acomodar
      await expect(ajustar(page), name).toHaveCount(0);
      expect(photoRequests(api), name).toHaveLength(1);
    }
  }
});

test('zoom_2_save_sends_the_central_300x400_without_the_green_frame', async ({ page, api }) => {
  await openWithFile(page, api, framedRedBlue());
  await zoomOf(page).fill('2');
  await expect(zoomOf(page)).toHaveValue('2');

  // a região é a central de 300×400 (x de 250 a 550, y de 200 a 600): nenhuma moldura entra
  const { image } = await saveAndDecode(page, api, [
    [0.05, 0.05],
    [0.95, 0.95],
  ]);

  expect([image.width, image.height]).toEqual([300, 400]);
  expect(isRed(image.atWidth25), `25% da largura: ${image.atWidth25}`).toBe(true);
  expect(isBlue(image.atWidth75), `75% da largura: ${image.atWidth75}`).toBe(true);
  const [topLeft, bottomRight] = image.points;
  expect(isRed(topLeft!), `canto de cima à esquerda: ${topLeft}`).toBe(true);
  expect(isBlue(bottomRight!), `canto de baixo à direita: ${bottomRight}`).toBe(true);
});

test('rotation_right_left_and_twice_moves_the_colours_by_90_degrees', async ({ page, api }) => {
  // os dois pontos de borda ficam a 5% e a 95% do eixo que o giro deixou sem moldura
  const ACROSS: Point[] = [
    [0.05, 0.25],
    [0.95, 0.75],
  ];
  const ALONG: Point[] = [
    [0.05, 0.5],
    [0.95, 0.5],
  ];
  const cases = [
    { name: 'direita uma vez', clicks: ['Girar à direita'], first: 'atHeight25', second: 'atHeight75', firstIs: isRed, secondIs: isBlue, edges: ACROSS },
    { name: 'esquerda uma vez', clicks: ['Girar à esquerda'], first: 'atHeight25', second: 'atHeight75', firstIs: isBlue, secondIs: isRed, edges: ACROSS },
    { name: 'direita duas vezes', clicks: ['Girar à direita', 'Girar à direita'], first: 'atWidth25', second: 'atWidth75', firstIs: isBlue, secondIs: isRed, edges: ALONG },
  ] as const;

  for (const { name, clicks, first, second, firstIs, secondIs, edges } of cases) {
    await openWithFile(page, api, framedRedBlue());
    for (const button of clicks) await ajustar(page).getByRole('button', { name: button, exact: true }).click();

    const { image } = await saveAndDecode(page, api, edges);

    expect([image.width, image.height], name).toEqual([600, 800]);
    expect(firstIs(image[first]), `${name}: ${first} é ${image[first]}`).toBe(true);
    expect(secondIs(image[second]), `${name}: ${second} é ${image[second]}`).toBe(true);
    const [nearFirst, nearSecond] = image.points;
    expect(firstIs(nearFirst!), `${name}: borda junto de ${first} é ${nearFirst}`).toBe(true);
    expect(secondIs(nearSecond!), `${name}: borda junto de ${second} é ${nearSecond}`).toBe(true);
  }
});

test('output_capped_at_1200x1600_and_never_enlarged_five_sources', async ({ page, api }) => {
  const cases: Array<[source: [number, number], sent: [number, number]]> = [
    [[3000, 4000], [1200, 1600]],
    [[1203, 1604], [1200, 1600]],
    [[1200, 1600], [1200, 1600]],
    [[900, 1200], [900, 1200]],
    [[300, 400], [300, 400]],
  ];

  for (const [[width, height], sent] of cases) {
    await openWithFile(page, api, redLeftBlueRight(width, height));

    const { image } = await saveAndDecode(page, api);

    expect([image.width, image.height], `${width}×${height}`).toEqual(sent);
    expect(isRed(image.atWidth25), `${width}×${height}: 25% da largura: ${image.atWidth25}`).toBe(true);
    expect(isBlue(image.atWidth75), `${width}×${height}: 75% da largura: ${image.atWidth75}`).toBe(true);
  }
});

test('zoom_stops_where_the_region_is_300x400_four_sources', async ({ page, api }) => {
  const cases: Array<[source: [number, number], sent: [number, number]]> = [
    [[600, 800], [300, 400]],
    [[450, 600], [300, 400]],
    [[300, 400], [300, 400]],
    [[1800, 2400], [600, 800]],
  ];

  for (const [[width, height], sent] of cases) {
    await openWithFile(page, api, redLeftBlueRight(width, height));
    // o máximo que o diálogo permite: a tecla End leva o controle ao fim do curso
    await zoomOf(page).focus();
    await page.keyboard.press('End');

    const { image } = await saveAndDecode(page, api);

    expect([image.width, image.height], `${width}×${height}`).toEqual(sent);
    expect(isRed(image.atWidth25), `${width}×${height}: 25% da largura: ${image.atWidth25}`).toBe(true);
    expect(isBlue(image.atWidth75), `${width}×${height}: 75% da largura: ${image.atWidth75}`).toBe(true);
  }
});

test('too_small_in_every_rotation_shows_message_without_save', async ({ page, api }) => {
  serveFicha(api, 'reception', studentOf({ photoUrl: null }));

  for (const [width, height] of [
    [299, 400],
    [300, 399],
    [399, 299],
    [200, 200],
  ] as const) {
    await page.goto(`/students/${ID}`);
    await choose(page, 'Enviar foto', pngFile(width, height));

    await expect(page.getByText(TOO_SMALL, { exact: true }), `${width}×${height}`).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar foto' }), `${width}×${height}`).toHaveCount(0);
  }

  await page.goto(`/students/${ID}`);
  await choose(page, 'Enviar foto', pngFile(300, 400));

  await expect(saveButton(page)).toBeVisible();
  await expect(page.getByText(TOO_SMALL, { exact: true })).toHaveCount(0);
});

test('unreadable_file_shows_message_without_crop_frame_three_files', async ({ page, api }) => {
  serveFicha(api, 'reception', studentOf({ photoUrl: null }));
  // bytes pseudoaleatórios, sempre os mesmos
  let seed = 20261005;
  const noise = Buffer.from(Array.from({ length: 4096 }, () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 256));
  const cases: Array<[name: string, open: () => Promise<unknown>]> = [
    [
      'texto escolhido como foto.jpg',
      () => choose(page, 'Enviar foto', { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('isto é um texto, não uma imagem\n'.repeat(40)) }),
    ],
    [
      'PDF largado',
      () => dropOn(page, AREA, { name: 'documento.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n') }),
    ],
    ['bytes aleatórios escolhidos como foto.png', () => choose(page, 'Enviar foto', { name: 'foto.png', mimeType: 'image/png', buffer: noise })],
  ];

  for (const [name, open] of cases) {
    api.requests.length = 0;
    await page.goto(`/students/${ID}`);

    await open();

    await expect(page.getByText(UNREADABLE, { exact: true }), name).toBeVisible();
    await expect(page.locator(CROP_FRAME), name).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar foto' }), name).toHaveCount(0);
    expect(photoRequests(api), name).toHaveLength(0);
  }
});

test('file_save_posts_without_photo_and_puts_with_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  const cases = [
    { name: 'sem foto', photoUrl: null, button: 'Enviar foto', method: 'POST', other: 'PUT' },
    { name: 'com foto', photoUrl: PHOTO_URL, button: 'Trocar foto', method: 'PUT', other: 'POST' },
  ];

  for (const { name, photoUrl, button, method, other } of cases) {
    api.requests.length = 0;
    serveFicha(api, 'reception', studentOf({ photoUrl }));
    // a API recebe e não responde: o que chega é o que "Salvar foto" enviou, sem passo nenhum depois
    api.on('POST', PHOTO_ROUTE, 'hang');
    api.on('PUT', PHOTO_ROUTE, 'hang');

    await page.goto(`/students/${ID}`);
    await choose(page, button, pngFile(900, 1200));
    await saveButton(page).click();

    await expect.poll(() => photoRequests(api).length, name).toBe(1);
    // nenhum outro diálogo entre "Salvar foto" e a requisição
    await expect(page.getByRole('dialog'), name).toHaveCount(1);
    await expect(ajustar(page), name).toBeVisible();
    expect(photoRequests(api).map((request) => request.method), name).toEqual([method]);
    expect(photoRequests(api).filter((request) => request.method === other), name).toHaveLength(0);
  }
});

test('save_button_disabled_with_enviando_while_waiting', async ({ page, api }) => {
  serveFicha(api, 'reception', studentOf({ photoUrl: null }));
  api.on('POST', PHOTO_ROUTE, 'hang');

  await page.goto(`/students/${ID}`);
  await choose(page, 'Enviar foto', pngFile(900, 1200));
  await saveButton(page).click();

  const busy = ajustar(page).getByRole('button', { name: 'Enviando…', exact: true });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();
  await expect(ajustar(page).locator('button:enabled', { hasText: 'Salvar foto' })).toHaveCount(0);
});

test('successful_save_closes_the_dialog_and_shows_the_new_photo', async ({ page, api }) => {
  const NEW_PATH = '/api/photo-files/018f0000-0000-7000-8000-000000000aaa/medium';
  const NEW_URL = `${NEW_PATH}?exp=2000000000&sig=assinatura-nova`;
  servePhotoFile(api, PHOTO_PATH);
  servePhotoFile(api, NEW_PATH);
  const photo = page.getByRole('img', { name: 'Foto de Marina Duarte' });

  // o primeiro envio, por POST
  const created = { photoUrl: null as string | null };
  serveMutableFicha(api, 'reception', created);
  api.on('POST', PHOTO_ROUTE, () => {
    created.photoUrl = PHOTO_URL;
    return CREATED;
  });

  await page.goto(`/students/${ID}`);
  await choose(page, 'Enviar foto', pngFile(900, 1200));
  await saveButton(page).click();

  await expect(ajustar(page)).toHaveCount(0);
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('src', PHOTO_URL);
  await expect(page.getByText(AREA)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar foto' })).toHaveCount(0);

  // a troca, por PUT
  const replaced = { photoUrl: PHOTO_URL as string | null };
  serveMutableFicha(api, 'reception', replaced);
  api.on('PUT', PHOTO_ROUTE, () => {
    replaced.photoUrl = NEW_URL;
    return { status: 201, body: { ...CREATED.body, version: 2 } };
  });

  await page.goto(`/students/${ID}`);
  await expect(photo).toHaveAttribute('src', PHOTO_URL);
  await choose(page, 'Trocar foto', pngFile(900, 1200));
  await saveButton(page).click();

  await expect(ajustar(page)).toHaveCount(0);
  await expect(photo).toHaveAttribute('src', NEW_URL);
});

test('six_save_errors_show_their_messages_and_keep_the_framing', async ({ page, api }) => {
  const GENERIC = 'Não foi possível enviar a foto. Tente novamente.';
  const cases: Array<[status: number, reply: ReturnType<typeof problem>, message: string]> = [
    [413, problem(413, 'payload_too_large'), 'A foto deve ter no máximo 5 MB.'],
    [415, problem(415, 'unsupported_media_type'), UNREADABLE],
    [422, problem(422, 'validation_failed', [{ path: 'file', message: TOO_SMALL }]), TOO_SMALL],
    [409, problem(409, 'photo_exists'), 'Este aluno já tem foto.'],
    [503, problem(503, 'storage_unavailable'), GENERIC],
    [500, problem(500, 'internal_error'), GENERIC],
  ];

  for (const [status, reply, message] of cases) {
    await openWithFile(page, api, pngFile(1800, 2400));
    api.on('POST', PHOTO_ROUTE, reply);
    await zoomOf(page).fill('2');
    await expect(zoomOf(page)).toHaveValue('2');

    const first = await saveAndDecode(page, api);

    await expect(ajustar(page).getByText(message, { exact: true }), String(status)).toBeVisible();
    await expect(ajustar(page).locator(CROP_FRAME), String(status)).toBeVisible();
    await expect(zoomOf(page), String(status)).toHaveValue('2');
    await expect(saveButton(page), String(status)).toBeEnabled();

    const second = await saveAndDecode(page, api);

    expect([second.image.width, second.image.height], String(status)).toEqual([first.image.width, first.image.height]);
    expect(photoRequests(api), String(status)).toHaveLength(2);
    await expect(ajustar(page), String(status)).toBeVisible();
  }
});

test('cancel_and_escape_send_nothing_and_leave_the_ficha_as_it_was', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  const file = pngFile(900, 1200);
  const closings: Array<[name: string, close: () => Promise<void>]> = [
    ['Cancelar', () => ajustar(page).getByRole('button', { name: 'Cancelar', exact: true }).click()],
    ['Escape', () => page.keyboard.press('Escape')],
  ];

  // aluno sem foto: a área de envio continua lá
  api.requests.length = 0;
  serveFicha(api, 'reception', studentOf({ photoUrl: null }));
  await page.goto(`/students/${ID}`);
  for (const [name, close] of closings) {
    // o mesmo arquivo, escolhido de novo depois de cancelar, abre o diálogo outra vez
    await choose(page, 'Enviar foto', file);
    await expect(ajustar(page), `sem foto, ${name}`).toBeVisible();

    await close();

    await expect(ajustar(page), `sem foto, ${name}`).toHaveCount(0);
    await expect(page.getByText(AREA), `sem foto, ${name}`).toBeVisible();
    expect(photoRequests(api), `sem foto, ${name}`).toHaveLength(0);
  }

  // aluno com foto: a mesma imagem continua lá
  serveFicha(api, 'reception', studentOf({ photoUrl: PHOTO_URL }));
  await page.goto(`/students/${ID}`);
  const photo = page.getByRole('img', { name: 'Foto de Marina Duarte' });
  await expect(photo).toHaveAttribute('src', PHOTO_URL);
  for (const [name, close] of closings) {
    await choose(page, 'Trocar foto', file);
    await expect(ajustar(page), `com foto, ${name}`).toBeVisible();

    await close();

    await expect(ajustar(page), `com foto, ${name}`).toHaveCount(0);
    await expect(photo, `com foto, ${name}`).toHaveAttribute('src', PHOTO_URL);
    expect(photoRequests(api), `com foto, ${name}`).toHaveLength(0);
  }
});

test('trocar_foto_beside_remover_foto_opens_chooser_with_three_types', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of WRITERS) {
    serveFicha(api, role, studentOf({ photoUrl: PHOTO_URL }));

    await page.goto(`/students/${ID}`);

    await expect(page.getByRole('button', { name: 'Trocar foto', exact: true }), role).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remover foto', exact: true }), role).toBeVisible();
    await expect(page.getByText(AREA), role).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviar foto' }), role).toHaveCount(0);

    expect(await choose(page, 'Trocar foto', pngFile(900, 1200)), role).toEqual(TYPES);
    await expect(ajustar(page), role).toBeVisible();
    await expectFrame3by4(page, role);
  }
});
