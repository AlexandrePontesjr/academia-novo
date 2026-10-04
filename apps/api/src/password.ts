import { hash, verify } from '@node-rs/argon2';

/** Argon2id (o algoritmo padrão do `@node-rs/argon2`) com m=19456, t=2, p=1. */
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, ARGON2);

export const verifyPassword = (stored: string, password: string) => verify(stored, password);
