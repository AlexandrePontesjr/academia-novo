import { createUserRequestSchema, loginRequestSchema } from '@academia/contracts';
import { Body, Controller, Post } from '@nestjs/common';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/access.ts';
import { Input } from '../src/validation.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

@Controller('api/test')
class ValidationProbeController {
  @Post('nested')
  @Public()
  @Input(z.object({ address: z.object({ zip: z.string() }) }))
  nested(@Body() body: unknown) {
    return body;
  }

  @Post('user')
  @Public()
  @Input(createUserRequestSchema)
  user(@Body() body: unknown) {
    return body;
  }
}

let stack: Stack;

beforeAll(async () => {
  stack = await startStack([ValidationProbeController]);
}, 180_000);

afterAll(() => stack?.close());

test('invalid_body_422_one_error_per_field', async () => {
  const invalid = { email: 'x' };
  const defaults = loginRequestSchema.safeParse(invalid, { error: z.locales.en().localeError });
  const englishByPath = new Map(
    (defaults.error?.issues ?? []).map((issue) => [
      issue.path.join('.'),
      // a mensagem que o Zod daria para o mesmo erro, sem o texto que o schema define
      z.locales.en().localeError(issue as never),
    ]),
  );

  const response = await stack.client().post('/api/auth/login', invalid);
  const body = await problem(response);

  expect(response.status).toBe(422);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  expect(body.code).toBe('validation_failed');
  expect(body.errors?.map((error) => error.path).sort()).toEqual(['email', 'password']);
  for (const error of body.errors!) {
    expect(error.message, error.path).toMatch(/\S/);
    expect(englishByPath.has(error.path)).toBe(true);
    expect(error.message, error.path).not.toBe(englishByPath.get(error.path));
    expect(error.message, error.path).not.toMatch(/^(Invalid|Required|Too small|Too big)/);
  }
});

test('nested_path_uses_dot_notation', async () => {
  const response = await stack.client().post('/api/test/nested', { address: { zip: 5 } });
  const body = await problem(response);

  expect(response.status).toBe(422);
  expect(body.errors?.map((error) => error.path)).toEqual(['address.zip']);
});

test('errors_never_echo_client_values', async () => {
  const markers = {
    name: 4410231977,
    email: 'marcador-email-7f3a',
    role: 'marcador-role-91c2',
    password: 'marc-55e8',
  };

  const response = await stack.client().post('/api/test/user', markers);
  const text = await response.text();

  expect(response.status).toBe(422);
  expect((JSON.parse(text) as { errors: unknown[] }).errors).toHaveLength(4);
  for (const value of Object.values(markers)) {
    expect(text).not.toContain(String(value));
  }
});

test('unreadable_body_stays_400', async () => {
  const response = await stack
    .client()
    .request('POST', '/api/auth/login', { body: '{"email": "a@exemplo.com", "password":' , headers: { 'Content-Type': 'application/json' } });

  expect(response.status).toBe(400);
  expect((await problem(response)).code).toBe('bad_request');
});

test('every_route_with_body_answers_422', async () => {
  const { client } = await stack.session('admin');
  const target = await stack.seed();
  const routes: Array<[method: string, path: string, body: unknown]> = [
    ['POST', '/api/auth/login', {}],
    ['POST', '/api/auth/two-factor/verify', {}],
    ['PUT', '/api/auth/password', {}],
    ['POST', '/api/auth/two-factor/enable', {}],
    ['POST', '/api/auth/two-factor/confirm', {}],
    ['POST', '/api/auth/two-factor/disable', {}],
    ['POST', '/api/users', {}],
    // todos os campos são opcionais: um deles com o tipo errado
    ['PATCH', `/api/users/${target.id}`, { active: 'sim' }],
    ['PUT', `/api/users/${target.id}/password`, {}],
  ];
  expect(routes).toHaveLength(9);

  for (const [method, path, body] of routes) {
    const response = await client.request(method, path, { body });
    const parsed = await problem(response);

    expect(response.status, `${method} ${path}`).toBe(422);
    expect(parsed.code, `${method} ${path}`).toBe('validation_failed');
    expect(parsed.errors?.length, `${method} ${path}`).toBeGreaterThan(0);
  }
});
