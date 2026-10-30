const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';

/** O Drizzle embrulha o erro do `pg` em `cause`. */
const hasCode = (error: unknown, code: string) =>
  [error, (error as { cause?: unknown } | null)?.cause].some(
    (candidate) => (candidate as { code?: unknown } | null)?.code === code,
  );

export const isUniqueViolation = (error: unknown) => hasCode(error, UNIQUE_VIOLATION);

/** A mesma recusa, da restrição dada: serve a quem pode perder para mais de um índice único. */
export const isUniqueViolationOf = (error: unknown, constraint: string) =>
  isUniqueViolation(error) &&
  [error, (error as { cause?: unknown } | null)?.cause].some(
    (candidate) => (candidate as { constraint?: unknown } | null)?.constraint === constraint,
  );

/** A recusa de uma restrição `EXCLUDE`, como a `enrollments_no_overlap` (door 5 de planos-matriculas). */
export const isExclusionViolation = (error: unknown) => hasCode(error, EXCLUSION_VIOLATION);
