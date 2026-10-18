import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freePort, prepareProductionStack, runBash, type ProductionStack } from './support.ts';

/** As quatro imagens de observabilidade, com tag e digest, como a door 6 as fixou. */
const IMAGES = {
  prometheus: 'prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e',
  alertmanager:
    'prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a',
  'node-exporter':
    'prom/node-exporter:v1.12.1@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0',
  'blackbox-exporter':
    'prom/blackbox-exporter:v0.29.0@sha256:9613f2884689b6fad9f1939f6a3b0388c93a022cfaededb19545b329b5c83dea',
} as const;

interface AlertmanagerPayload {
  status?: string;
  alerts?: Array<{ labels?: Record<string, string> }>;
}

describe('métricas e alertas', () => {
  let stack: ProductionStack;
  let deployed: { status: number | null; output: string };
  let sink: Server;
  let sinkPort: number;
  const received: AlertmanagerPayload[] = [];

  /** O webhook do Alertmanager: um servidor local que anota cada entrega (AC 30). */
  const sinkUrl = () => `http://host.docker.internal:${sinkPort}/alert`;
  const ready = async (url: string) => (await fetch(url)).status;
  const query = async (expression: string) => {
    const response = await fetch(
      `http://127.0.0.1:${stack.ports.PROMETHEUS_PORT}/api/v1/query?query=${encodeURIComponent(expression)}`,
    );
    expect(response.status, expression).toBe(200);
    const body = (await response.json()) as { data?: { result?: unknown[] } };
    return body.data?.result ?? [];
  };
  const waitFor = async (what: string, done: () => boolean | Promise<boolean>, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await done())) {
      if (Date.now() > deadline) throw new Error(`tempo esgotado: ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  };
  const config = () => {
    const result = stack.compose('-f compose.yaml -f compose.prod.yaml config --format json');
    expect(result.status, result.output.slice(-4000)).toBe(0);
    return JSON.parse(result.output.slice(result.output.indexOf('{'))) as {
      services: Record<string, { image?: string; ports?: Array<{ host_ip?: string; published?: string }> }>;
    };
  };

  beforeAll(async () => {
    sinkPort = await freePort();
    sink = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk));
      request.on('end', () => {
        try {
          received.push(JSON.parse(body) as AlertmanagerPayload);
        } catch {
          // entrega que não é JSON não interessa ao teste
        }
        response.writeHead(200);
        response.end();
      });
    });
    await new Promise<void>((resolve) => sink.listen(sinkPort, '0.0.0.0', resolve));

    stack = await prepareProductionStack('monitoring', { alertWebhookUrl: sinkUrl() });
    deployed = stack.deploy();
    expect(deployed.status, deployed.output.slice(-8000)).toBe(0);
    // a CA interna do caddy: as chamadas HTTPS da suíte confiam nela
    setGlobalDispatcher(
      new Agent({ connect: { ca: stack.ca() }, pipelining: 0, keepAliveTimeout: 1 }),
    );
  }, 1_200_000);

  afterAll(async () => {
    stack?.destroy();
    if (sink) await new Promise((resolve) => sink.close(resolve));
  }, 300_000);

  test('prod_observability_readies_targets_and_probes_are_up', async () => {
    expect(await ready(`http://127.0.0.1:${stack.ports.PROMETHEUS_PORT}/-/ready`)).toBe(200);
    expect(await ready(`http://127.0.0.1:${stack.ports.ALERTMANAGER_PORT}/-/ready`)).toBe(200);

    await waitFor(
      'alvos e sondas de pé',
      async () => {
        const targets = await query('up{job=~"caddy|node"}');
        const probes = await query('probe_success{job=~"blackbox-web|blackbox-api"}');
        return (
          targets.length === 2 &&
          targets.every((target) => (target as { value?: [number, string] }).value?.[1] === '1') &&
          probes.length === 2 &&
          probes.every((probe) => (probe as { value?: [number, string] }).value?.[1] === '1')
        );
      },
      180_000,
    );
  }, 240_000);

  test('prod_alert_rules_match_the_six_literals_and_promtool_accepts_them', () => {
    const alerts = readFileSync(join(stack.dir, 'deploy/monitoring/alerts.yml'), 'utf8');
    for (const literal of [
      'alert: CaddyDown',
      'up{job="caddy"} == 0',
      'alert: WebDown',
      'probe_success{job="blackbox-web"} == 0',
      'alert: ApiHealthDegraded',
      'probe_success{job="blackbox-api"} == 0',
      'for: 2m',
      'alert: DiskSpaceLow',
      'for: 15m',
      '< 15',
      'alert: BackupStale',
      'time() - backup_last_success_timestamp_seconds > 93600',
      'alert: Http5xxHigh',
      'code=~"5.."}[10m]',
      '> 0.05',
    ]) {
      expect(alerts, literal).toContain(literal);
    }

    const check = stack.compose(
      '-f compose.yaml -f compose.prod.yaml run --rm --no-deps --entrypoint promtool prometheus check rules /etc/prometheus/alerts.yml',
    );
    expect(check.status, check.output).toBe(0);
    const test = stack.compose(
      '-f compose.yaml -f compose.prod.yaml run --rm --no-deps --entrypoint promtool prometheus test rules /etc/prometheus/alerts.test.yml',
    );
    expect(test.status, test.output).toBe(0);
  }, 240_000);

  test('prod_stopped_api_fires_and_delivers_api_health_degraded', async () => {
    expect(stack.compose('stop api').status).toBe(0);
    try {
      // a sonda falha, a regra espera 2 min e o Alertmanager entrega no webhook: até 5 min
      await waitFor(
        'ApiHealthDegraded firing',
        async () => (await query('ALERTS{alertname="ApiHealthDegraded",alertstate="firing"}')).length === 1,
        300_000,
      );
      await waitFor('entrega no webhook', () => received.length > 0, 180_000);
      const delivery = received.find((payload) =>
        payload.alerts?.some((alert) => alert.labels?.alertname === 'ApiHealthDegraded'),
      );
      expect(delivery, 'payload do Alertmanager').toBeDefined();
      expect(delivery!.status).toBe('firing');
    } finally {
      stack.compose('start api');
      stack.compose('up -d --wait');
    }
  }, 600_000);

  test('prod_backup_stale_fires_with_a_marker_twenty_seven_hours_old', async () => {
    const metrics = join(stack.backupDir, 'metrics');
    mkdirSync(metrics, { recursive: true });
    writeFileSync(
      join(metrics, 'backup.prom'),
      [
        '# HELP backup_last_success_timestamp_seconds Instante do ultimo backup.',
        '# TYPE backup_last_success_timestamp_seconds gauge',
        `backup_last_success_timestamp_seconds ${Math.floor(Date.now() / 1000) - 27 * 60 * 60}`,
        '',
      ].join('\n'),
    );

    await waitFor(
      'BackupStale firing',
      async () => (await query('ALERTS{alertname="BackupStale",alertstate="firing"}')).length === 1,
      180_000,
    );
  }, 300_000);

  test('prod_monitoring_ports_stay_on_loopback_and_caddy_metrics_are_internal', async () => {
    const { services } = config();
    for (const name of ['prometheus', 'alertmanager']) {
      const ports = services[name]?.ports ?? [];
      expect(ports.length, name).toBeGreaterThan(0);
      for (const port of ports) expect(port.host_ip, name).toBe('127.0.0.1');
    }
    for (const name of ['node-exporter', 'blackbox-exporter']) {
      expect(services[name]?.ports ?? [], name).toEqual([]);
    }

    // as métricas do caddy só saem no site interno `:9180`
    const script = "const r = await fetch('http://caddy:9180/metrics'); console.log(r.status, (await r.text()).includes('caddy_http'));";
    const internal = stack.compose(`exec -T api node --input-type=module -e "${script}"`);
    expect(internal.status, internal.output).toBe(0);
    expect(internal.output).toContain('200 true');

    const publicSite = await fetch(`${stack.webOrigin}/metrics`, { redirect: 'manual' });
    expect(publicSite.status).not.toBe(200);
    expect(await publicSite.text()).not.toContain('caddy_http');
  });

  test('prod_deploy_renders_alertmanager_config_and_amtool_accepts_it', () => {
    const deploy = runBash('deploy/deploy.sh', stack.dir, stack.env);
    expect(deploy.status, deploy.output.slice(-4000)).toBe(0);

    const template = readFileSync(join(stack.dir, 'deploy/monitoring/alertmanager.yml.tmpl'), 'utf8');
    expect(template).toContain('__ALERT_WEBHOOK_URL__');
    const rendered = readFileSync(join(stack.dir, 'deploy/monitoring/alertmanager.yml'), 'utf8');
    expect(rendered).toContain(sinkUrl());
    expect(rendered).not.toContain('__ALERT_WEBHOOK_URL__');

    const checked = stack.compose(
      '-f compose.yaml -f compose.prod.yaml run --rm --no-deps --entrypoint amtool alertmanager check-config /etc/alertmanager/alertmanager.yml',
    );
    expect(checked.status, checked.output).toBe(0);
  }, 300_000);

  test('prod_monitoring_images_are_pinned_by_tag_and_digest', () => {
    const { services } = config();

    for (const [name, image] of Object.entries(IMAGES)) {
      expect(services[name]?.image, name).toBe(image);
      expect(services[name]?.image, name).toMatch(/^[^:]+:[^@]+@sha256:[0-9a-f]{64}$/);
    }
  });
});
