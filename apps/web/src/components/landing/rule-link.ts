/**
 * O link de título que desenha a régua no hover (refino visual, door 6): uma linha de 1 px cresce da
 * esquerda para a direita sob a palavra, sem tocar no texto.
 */
export const RULE_LINK =
  'relative after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:bg-current after:transition-transform after:[transform:scaleX(0)] hover:after:[transform:scaleX(1)]';

/**
 * A régua da palavra da navegação (refino visual, door 6; `sections.md:398-401`): no hover a palavra
 * desenha 1 px do acento sob ela, da esquerda para a direita, em 200 ms - a mesma régua do título
 * linkado, sem tocar no texto. As palavras continuam com o fundo da seção corrente.
 */
export const NAV_WORD_RULE =
  'relative after:absolute after:inset-x-4 after:bottom-1 after:h-px after:origin-left after:bg-primary after:transition-transform after:duration-200 after:[transform:scaleX(0)] hover:after:[transform:scaleX(1)]';
