import {
  type PrivacySettings,
  privacySettingsSchema,
  type StaffExport,
  staffExportSchema,
  type StudentExport,
  studentExportSchema,
} from '@academia/contracts';
import { headers } from 'next/headers';
import { SUBJECT_BASE } from './privacy.ts';
import { fetchApi } from './session.ts';

type Loaded<T> = T | 'notfound' | 'failed';

/** A exportação do titular, como a API a devolve, `notfound` ou `failed`: a mesma rota do download. */
async function load<T>(base: string, id: string, parse: (body: unknown) => T): Promise<Loaded<T>> {
  try {
    const response = await fetchApi(`/api/${base}/${encodeURIComponent(id)}/data-export`, await headers());
    if (response.status === 404) return 'notfound';
    if (response.status !== 200) return 'failed';
    return parse(await response.json());
  } catch {
    return 'failed';
  }
}

export const loadStudentExport = (id: string): Promise<Loaded<StudentExport>> =>
  load(SUBJECT_BASE.student, id, (body) => studentExportSchema.parse(body));

export const loadStaffExport = (id: string): Promise<Loaded<StaffExport>> =>
  load(SUBJECT_BASE.staff, id, (body) => staffExportSchema.parse(body));

/** A configuração de privacidade, ou `failed`; só o Administrador a pede. */
export async function loadPrivacySettings(): Promise<PrivacySettings | 'failed'> {
  try {
    const response = await fetchApi('/api/privacy-settings', await headers());
    if (response.status !== 200) return 'failed';
    return privacySettingsSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}
