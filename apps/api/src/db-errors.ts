const UNIQUE_VIOLATION = '23505';

/** O Drizzle embrulha o erro do `pg` em `cause`. */
export const isUniqueViolation = (error: unknown) =>
  [error, (error as { cause?: unknown } | null)?.cause].some(
    (candidate) => (candidate as { code?: unknown } | null)?.code === UNIQUE_VIOLATION,
  );
