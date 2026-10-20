import { SITE } from '../app/site-content.ts';
import { Wordmark } from './wordmark.tsx';

/**
 * A marca da academia no login e no shell (dukfit-landing, door 4): o logo de 40 px antes do wordmark.
 * O logo é decorativo (`alt=""`): o nome acessível continua o texto "DukFit" do wordmark.
 */
export function Brand({ logoClassName }: { logoClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-3" data-slot="brand">
      <img
        src={SITE.logo.small}
        alt=""
        width={40}
        height={40}
        className={`size-10 shrink-0${logoClassName ? ` ${logoClassName}` : ''}`}
        data-slot="brand-logo"
      />
      <Wordmark />
    </span>
  );
}
