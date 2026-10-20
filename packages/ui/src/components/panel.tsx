import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn.ts';

/** A superfície da referência: cartão #141414, borda do tema e raio de 24 px (dukfit-app, de-para). */
export const PANEL = 'rounded-3xl border bg-card p-5';

/** O botão quadrado ↗ do canto do `Panel`: 32 px, borda #262626, ícone no texto secundário. */
export const PANEL_ARROW =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary';

/**
 * Um cartão com título por nome (a região se chama como o título) e, opcionalmente, a ação do canto -
 * o link ↗ que o app monta com o `Link` dele.
 */
export function Panel({
  id,
  title,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-4', PANEL, className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 id={id} className="text-xl font-semibold">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Um bloco de métrica ("Target Weight" da referência): rótulo lime, número de 24 px, legenda opcional. */
export function MetricTile({ label, value, caption }: { label: string; value: ReactNode; caption?: string }) {
  return (
    <div className="grid content-start gap-2 rounded-2xl bg-[#1a1a1a] p-4" data-slot="metric-tile">
      <dt className="text-xs font-medium text-primary">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** A pílula flutuante ("45 Min" da referência): fundo #1f1f1f, ponto lime, rótulo e valor. */
export function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm" data-slot="stat-pill">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" data-slot="stat-pill-dot" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const LIME = '#cdf720';
const ORANGE = '#f59e0b';
const OFF = '#404040';

/** Quantas das `ticks` marcas acendem: a proporção de `value` sobre o maior valor, nunca dividindo por zero. */
export const litTicks = (ticks: number, value: number, max: number) => Math.round((ticks * value) / Math.max(1, max));

/**
 * O medidor semicircular da referência ("Training Schedule"): `ticks` marcas da esquerda para a
 * direita, as `litTicks` primeiras no acento, o resto apagado; o valor e a pílula ficam no centro.
 */
export function Gauge({
  value,
  max,
  pill,
  label,
  display,
  ticks = 40,
}: {
  value: number;
  max: number;
  pill: ReactNode;
  label: string;
  /** O que o centro mostra no lugar do número, como o horário da landing. */
  display?: ReactNode;
  ticks?: number;
}) {
  const lit = litTicks(ticks, value, max);
  const lines = Array.from({ length: ticks }, (_, index) => {
    const angle = Math.PI - (Math.PI * index) / (ticks - 1);
    const long = index % 5 === 0;
    const outer = 92;
    const inner = long ? 74 : 80;
    return {
      x1: 100 + inner * Math.cos(angle),
      y1: 100 - inner * Math.sin(angle),
      x2: 100 + outer * Math.cos(angle),
      y2: 100 - outer * Math.sin(angle),
      on: index < lit,
    };
  });
  return (
    <div className="relative mx-auto grid w-full max-w-xs justify-items-center" data-slot="gauge">
      <svg viewBox="0 0 200 104" className="w-full" role="img" aria-label={label}>
        <defs>
          <radialGradient id="gauge-glow" cx="50%" cy="100%" r="60%">
            <stop offset="0%" stopColor={LIME} stopOpacity="0.28" />
            <stop offset="100%" stopColor={LIME} stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M30 100 A70 70 0 0 1 170 100 Z" fill="url(#gauge-glow)" />
        {lines.map((line, index) => (
          <line
            key={index}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.on ? LIME : OFF}
            strokeWidth="2.5"
            strokeLinecap="round"
            data-slot="gauge-tick"
          />
        ))}
      </svg>
      <div className="-mt-12 grid justify-items-center gap-3">
        <p className="text-4xl font-semibold tabular-nums" data-slot="gauge-value">
          {display ?? value}
        </p>
        <p className="rounded-full bg-muted px-4 py-1.5 text-sm text-muted-foreground tabular-nums" data-slot="gauge-pill">
          {pill}
        </p>
      </div>
    </div>
  );
}

/** A cor da barra pela regra do de-para: topo (≥ 90% do máximo) lime, abaixo laranja, zero cinza. */
export function barColor(count: number, max: number) {
  if (count === 0) return OFF;
  return count >= 0.9 * max ? LIME : ORANGE;
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** O dia da semana abreviado de um `aaaa-mm-dd`, sem fuso: o dia é o do calendário. */
export const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;

/**
 * As barras semanais da referência ("Weekly Consistency"): uma coluna por dia, do mais antigo ao mais
 * novo, o número no topo e três barras finas com a altura proporcional ao maior dia.
 */
export function WeekBars({ days, label, ...props }: { days: Array<{ day: string; count: number }>; label: string } & ComponentProps<'ol'>) {
  const max = Math.max(0, ...days.map((item) => item.count));
  return (
    <ol aria-label={label} className="grid grid-cols-7 gap-2 rounded-2xl bg-[#1a1a1a] p-3" {...props}>
      {days.map(({ day, count }) => {
        const color = barColor(count, max);
        const height = max === 0 ? 6 : Math.max(6, Math.round((100 * count) / max));
        return (
          <li key={day} className="grid justify-items-center gap-2" data-slot="week-column" data-day={day}>
            <span className="text-xs tabular-nums" style={{ color }} data-slot="week-count">
              {count}
            </span>
            <div className="flex h-36 items-end gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((bar) => (
                <div key={bar} className="flex h-full w-1.5 items-end rounded-full bg-[#262626]">
                  <div className="w-full rounded-full" style={{ height: `${height}%`, backgroundColor: color }} data-slot="week-bar" />
                </div>
              ))}
            </div>
            <span className="text-[0.7rem] text-muted-foreground" data-slot="week-day">
              {weekdayOf(day)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
