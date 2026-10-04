import { afterAll, beforeAll, expect, test } from 'vitest';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

// Entrada hostil em todo campo de texto, em todo `:id` e em todo corpo: a resposta pode ser
// qualquer recusa do contrato, nunca um `5xx`. Nasceu dos achados N1 a N3 da verificação.
test('hostile_input_never_answers_5xx', async () => {
  const admin = (await stack.session('admin')).client;
  const user = await stack.seed();
  const plain = await stack.signIn(user);
  const enrolledUser = await stack.seed();
  await stack.enrollTwoFactor(await stack.signIn(enrolledUser));
  const pending = stack.client();
  await pending.post('/api/auth/login', { email: enrolledUser.email, password: enrolledUser.password });
  const weird = ['a\u0000b', '\ud800', '😀'.repeat(50), 'x'.repeat(60_000), "' or 1=1 --", '%00', '\\'];
  const results: string[] = [];
  const note = async (name: string, response: Response) => {
    results.push(`${response.status} ${name}`);
    await response.text();
  };

  for (const value of weird) {
    const tag = JSON.stringify(value.slice(0, 8));
    await note(`verify code ${tag}`, await pending.post('/api/auth/two-factor/verify', { code: value }));
    await note(`verify backup ${tag}`, await pending.post('/api/auth/two-factor/verify', { backupCode: value }));
    await note(`login password ${tag}`, await stack.client().post('/api/auth/login', { email: user.email, password: value }));
    await note(`enable password ${tag}`, await plain.post('/api/auth/two-factor/enable', { password: value }));
    await note(`confirm code ${tag}`, await plain.post('/api/auth/two-factor/confirm', { code: value }));
    await note(`disable password ${tag}`, await plain.post('/api/auth/two-factor/disable', { password: value }));
    await note(`change current ${tag}`, await plain.put('/api/auth/password', { currentPassword: value, newPassword: 'senha-valida-123' }));
    await note(`create name ${tag}`, await admin.post('/api/users', { name: value, email: `p${results.length}@exemplo.com`, role: 'reception', password: 'senha-valida-123' }));
    await note(`create password ${tag}`, await admin.post('/api/users', { name: 'Nome', email: `q${results.length}@exemplo.com`, role: 'reception', password: `${value}-senha-valida`.slice(0, 100) }));
    await note(`patch name ${tag}`, await admin.patch(`/api/users/${user.id}`, { name: value }));
    await note(`reset password ${tag}`, await admin.put(`/api/users/${user.id}/password`, { password: `${value}-senha-valida`.slice(0, 100) }));
  }
  for (const segment of ['%E0%A4%A', '%00', 'a%2Fb', '%ED%A0%80', '..%2F..', 'x'.repeat(5000)]) {
    await note(`id ${segment.slice(0, 12)}`, await admin.patch(`/api/users/${segment}`, { name: 'X' }));
    await note(`id2 ${segment.slice(0, 12)}`, await admin.request('DELETE', `/api/users/${segment}/two-factor`));
  }
  for (const body of ['[]', 'null', '7', '"texto"', '{"email":{"a":1},"password":[1]}', '{"email":null}']) {
    await note(`login body ${body}`, await stack.client().request('POST', '/api/auth/login', { body, headers: { 'Content-Type': 'application/json' } }));
    await note(`users body ${body}`, await admin.request('POST', '/api/users', { body, headers: { 'Content-Type': 'application/json' } }));
  }

  expect(results.length).toBeGreaterThan(100);
  expect(results.filter((line) => line.startsWith('5'))).toEqual([]);
}, 120_000);
