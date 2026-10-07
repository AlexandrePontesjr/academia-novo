import { z } from 'zod';

// As regras de pessoa que o aluno e o funcionário compartilham: uma definição só (AD-011). O CPF e o
// telefone saem daqui só em dígitos, e quem as importa não as reimplementa.

const TIME_ZONE = 'America/Sao_Paulo';

// o Postgres não guarda U+0000 em texto, então nenhuma linha teria esse valor
export const noNul = (value: string) => !value.includes('\0');

export const nameSchema = z
  .string('Informe o nome.')
  .trim()
  .min(1, 'Informe o nome.')
  .max(120, 'O nome deve ter no máximo 120 caracteres.')
  .refine(noNul, 'O nome contém um caractere inválido.');

/** O CPF tem 11 dígitos, não é de um dígito só repetido e fecha os dois dígitos verificadores. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const verifier = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return verifier(9) === Number(digits[9]) && verifier(10) === Number(digits[10]);
}

/** Pontos e hífen saem antes da conferência; o valor que segue é só dígitos (door 1). */
export const cpfSchema = z
  .string('Informe o CPF.')
  .overwrite((value) => value.replace(/[.-]/g, ''))
  .refine(isValidCpf, 'Informe um CPF válido.');

/** Espaços, parênteses e hífen saem antes da conferência: 10 ou 11 dígitos. */
export const phoneSchema = z
  .string('Informe o telefone.')
  .overwrite((value) => value.replace(/[\s()-]/g, ''))
  .regex(/^\d{10,11}$/, 'Informe um telefone com DDD, de 10 ou 11 dígitos.');

/** O dia de hoje em `America/Sao_Paulo`, `aaaa-mm-dd`: o relógio do servidor ou do navegador pode estar em UTC. */
export const saoPauloToday = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  );

export const isRealDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** O dia de hoje em `America/Sao_Paulo`, `aaaa-mm-dd`. */
export const today = () => saoPauloToday();
