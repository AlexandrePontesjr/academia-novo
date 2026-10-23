import { CheckIcon, DumbbellIcon } from '@academia/ui';
import { SITE } from '../../app/site-content.ts';

/**
 * Os planos da landing: um cartão por plano, sem valor - a mensalidade é definida na matrícula, no
 * sistema (AD-106), e o cartão manda à recepção.
 */
export function PlansPricing() {
  const { plans } = SITE;

  return (
    <ul className="grid max-w-md gap-4" data-slot="plans">
      {plans.items.map((plan) => (
        <li key={plan.name} className="grid content-start gap-6 rounded-2xl border border-primary/60 bg-card p-6" data-slot="plan-card">
          <div className="grid gap-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <DumbbellIcon className="size-5" />
            </span>
            <h3 className="text-xl font-medium">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.text}</p>
          </div>
          <p className="text-2xl font-medium" data-slot="plan-price">
            {plans.price}
          </p>
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
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {plan.cta}
          </a>
        </li>
      ))}
    </ul>
  );
}
