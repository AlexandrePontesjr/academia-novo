/**
 * O link de título que desenha a régua no hover (refino visual, door 6): uma linha de 1 px cresce da
 * esquerda para a direita sob a palavra, sem tocar no texto.
 */
export const RULE_LINK =
  'relative after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:bg-current after:transition-transform after:[transform:scaleX(0)] hover:after:[transform:scaleX(1)]';
