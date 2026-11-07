import { CheckIcon } from '@academia/ui';
import { SITE } from '../../app/site-content.ts';
import { RULE_LINK } from './rule-link.ts';

/**
 * Os planos da landing (refino visual, door 4): um bloco em linhas com régua, sem cartão e sem valor -
 * a mensalidade é definida na matrícula (AD-106) e o link vai ao pré-cadastro (AD-117).
 */
export function PlansPricing() {
  const { plans } = SITE;
  const plan = plans.items[0]!;

  return (
    <div className="grid" data-slot="plans">
      <div className="grid gap-3 border-t pt-6 pb-8">
        <h3 className="text-2xl leading-snug font-medium sm:text-3xl">
          <a href={plan.cta.href} data-slot="plan-title" className={`inline-block ${RULE_LINK}`}>
            {plan.name}
          </a>
        </h3>
        <p className="text-base text-muted-foreground">{plan.text}</p>
        <p className="text-xl font-medium" data-slot="plan-price">
          {plans.price}
        </p>
      </div>
      <div className="grid gap-3 border-t pt-6 pb-8">
        <p className="text-sm text-muted-foreground">{plans.featuresLabel}</p>
        <ul className="grid">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-3 border-t py-4 text-base leading-6" data-slot="plan-feature">
              <CheckIcon className="size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t pt-8">
        <a
          href={plan.cta.href}
          data-slot="section-cta"
          className="pressable inline-flex h-12 w-fit items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:-translate-y-px"
        >
          {plan.cta.label}
        </a>
      </div>
    </div>
  );
}
