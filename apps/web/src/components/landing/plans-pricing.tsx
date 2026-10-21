'use client';

import { BoltIcon, CheckIcon, DumbbellIcon, UsersIcon } from '@academia/ui';
import { useState } from 'react';
import { SITE } from '../../app/site-content.ts';

type Billing = keyof typeof SITE.plans.billing;

const ICONS = [DumbbellIcon, BoltIcon, UsersIcon];

/**
 * Os planos da landing: a chave Mensal/Anual troca o valor exibido, e os três cartões seguem a
 * referência - o do meio em destaque, com o ícone e o botão no acento.
 */
export function PlansPricing() {
  const [billing, setBilling] = useState<Billing>('monthly');
  const { plans } = SITE;

  return (
    <div className="grid gap-8">
      <div role="group" aria-label="Forma de cobrança" className="inline-flex w-fit gap-1 rounded-full border bg-card p-1" data-slot="billing-toggle">
        {(Object.keys(plans.billing) as Billing[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={billing === key}
            onClick={() => setBilling(key)}
            className={`h-9 rounded-full px-5 text-sm font-medium transition-colors ${
              billing === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {plans.billing[key]}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 lg:grid-cols-3" data-slot="plans">
        {plans.items.map((plan, index) => {
          const Icon = ICONS[index] ?? DumbbellIcon;
          return (
            <li
              key={plan.name}
              className={`grid content-start gap-6 rounded-2xl border bg-card p-6 ${plan.featured ? 'border-primary/60' : ''}`}
              data-slot="plan-card"
              data-featured={plan.featured || undefined}
            >
              <div className="grid gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-10 items-center justify-center rounded-full ${
                    plan.featured ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <h3 className="text-xl font-medium">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.text}</p>
              </div>
              <p className="flex items-baseline gap-1" data-slot="plan-price">
                <span className="text-4xl font-medium tabular-nums">R$ {plan.price[billing]}</span>
                <span className="text-sm text-muted-foreground">{plans.perMonth}</span>
              </p>
              {billing === 'yearly' && <p className="-mt-4 text-xs text-muted-foreground">{plans.yearlyNote}</p>}
              <div className="grid gap-3">
                <p className="text-sm font-medium">{plans.featuresLabel}</p>
                <ul className="grid gap-2 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckIcon className="size-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="#localizacao"
                className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  plan.featured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-muted'
                }`}
              >
                {plan.cta}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
