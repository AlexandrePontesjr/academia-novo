import { expect, sessionOf, test, userOf } from './support/fake-api.ts';

test('server_render_forwards_client_ip_and_user_agent', async ({ browser, api, baseURL }) => {
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: [userOf(1)] } });
  const context = await browser.newContext({
    baseURL,
    userAgent: 'teste/1.0',
    extraHTTPHeaders: { 'X-Forwarded-For': '203.0.113.7' },
  });
  try {
    const page = await context.newPage();

    await page.goto('/users');

    await expect(page.getByRole('table')).toBeVisible();
    for (const path of ['/api/auth/session', '/api/users']) {
      const calls = api.requests.filter((request) => request.method === 'GET' && request.path === path);
      expect(calls.length, path).toBeGreaterThanOrEqual(1);
      for (const call of calls) {
        expect(call.headers['user-agent'], path).toBe('teste/1.0');
        expect(call.headers['x-forwarded-for'], path).toBe('203.0.113.7');
      }
    }
  } finally {
    await context.close();
  }
});
