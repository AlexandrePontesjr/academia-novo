import {
  enrollmentStatus,
  EXPORT_FORMAT_VERSION,
  PHOTO_VARIANTS,
  paymentStatus,
  type PrivacySettings,
  saoPauloToday,
  type StaffExport,
  type StudentExport,
} from '@academia/contracts';
import { and, asc, type Database, eq, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import type { ColumnCipher } from '../crypto.ts';
import { photoKey } from '../photos/photo-keys.ts';
import { type PhotoStorage, StorageUnavailable } from '../photos/photo-storage.ts';
import { ProblemException } from '../problem.filter.ts';
import { lockActiveAdmins } from '../users/active-admins.ts';

const {
  accounts,
  checkIns,
  consentTerms,
  consents,
  enrollments,
  guardians,
  passwordTokens,
  payments,
  photos,
  plans,
  privacySettings,
  sessions,
  staff,
  students,
  twoFactors,
  users,
} = schema;

/** Os dois campos da configuração, na ordem da trilha; os dois guardam o valor (door 6). */
const SETTINGS_FIELDS = ['inactiveStudentRetentionYears', 'photoVersionRetentionDays'] as const;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** O nome que a ficha anonimizada guarda no lugar do nome da pessoa (door 1). */
export const ANONYMIZED_NAME = 'Titular anonimizado';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

export type AnonymizeOutcome = 'anonymized' | 'not_found' | 'not_inactive' | 'open_periods';

export type AnonymizeStaffOutcome = 'anonymized' | 'not_found' | 'not_inactive' | 'user_linked';

type PhotoOwnerColumn = typeof photos.studentId | typeof photos.staffId;

const iso = (instant: Date) => instant.toISOString();
const isoOrNull = (instant: Date | null) => (instant === null ? null : instant.toISOString());

const storageUnavailable = () => new ProblemException(503, 'storage_unavailable');

/**
 * Os direitos do titular (privacidade): a exportação dos dados de um aluno e a anonimização dele. As
 * duas travam ou leem a linha numa transação, e a trilha entra na mesma transação (AD-057, door 7).
 */
export class PrivacyService {
  constructor(
    private readonly db: Database['db'],
    private readonly cipher: ColumnCipher,
    private readonly storage: PhotoStorage,
  ) {}

  /**
   * Tudo o que o sistema guarda do aluno, no formato da door 5, e a linha `student.exported`. A trilha
   * só é gravada depois de o bucket entregar cada foto: armazenamento fora responde `503` sem linha.
   */
  async exportStudent(id: string, actor: AuditActor): Promise<StudentExport | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(students)
        .where(and(eq(students.id, id), isNull(students.anonymizedAt)));
      if (!row) return undefined;

      const guardianRows = await tx
        .select({
          id: guardians.id,
          name: guardians.name,
          cpf: guardians.cpf,
          phone: guardians.phone,
          relationship: guardians.relationship,
          createdAt: guardians.createdAt,
        })
        .from(guardians)
        .where(eq(guardians.studentId, row.id))
        .orderBy(asc(guardians.id));
      const consentRows = await tx
        .select({
          purpose: consents.purpose,
          termVersion: consents.termVersion,
          termText: consentTerms.text,
          grantedBy: consents.grantedBy,
          grantedAt: consents.grantedAt,
          revokedAt: consents.revokedAt,
        })
        .from(consents)
        .innerJoin(
          consentTerms,
          and(eq(consentTerms.purpose, consents.purpose), eq(consentTerms.version, consents.termVersion)),
        )
        .where(eq(consents.studentId, row.id))
        .orderBy(asc(consents.grantedAt), asc(consents.id));
      const enrollmentRows = await tx
        .select({
          id: enrollments.id,
          planName: plans.name,
          startsAt: enrollments.startsAt,
          endsAt: enrollments.endsAt,
          priceCents: enrollments.priceCents,
          cancelledAt: enrollments.cancelledAt,
        })
        .from(enrollments)
        .innerJoin(plans, eq(plans.id, enrollments.planId))
        .where(eq(enrollments.studentId, row.id))
        .orderBy(asc(enrollments.startsAt), asc(enrollments.id));
      const paymentRows = await tx
        .select({ startsAt: enrollments.startsAt, createdAt: payments.createdAt, voidedAt: payments.voidedAt })
        .from(payments)
        .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
        .where(eq(enrollments.studentId, row.id))
        .orderBy(asc(payments.createdAt), asc(payments.id));
      const checkInRows = await tx
        .select({ day: checkIns.day, checkedInAt: checkIns.checkedInAt })
        .from(checkIns)
        .where(eq(checkIns.studentId, row.id))
        .orderBy(asc(checkIns.day));
      const exportedPhotos = await this.exportedPhotos(tx, photos.studentId, row.id);

      const exported: StudentExport = {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        subject: 'student',
        student: {
          id: row.id,
          name: row.name,
          cpf: row.cpf!,
          birthDate: row.birthDate!,
          sex: row.sex as StudentExport['student']['sex'],
          email: row.email,
          phone: row.phone!,
          address: row.address,
          emergencyContactName: row.emergencyContactName,
          emergencyContactPhone: row.emergencyContactPhone,
          healthNotes: row.healthNotesEnc === null ? null : this.cipher.decrypt(row.healthNotesEnc, row.id),
          status: row.status,
          createdAt: iso(row.createdAt),
          inactivatedAt: isoOrNull(row.inactivatedAt),
        },
        guardians: guardianRows.map((guardian) => ({ ...guardian, createdAt: iso(guardian.createdAt) })),
        consents: consentRows.map((consent) => ({
          ...consent,
          grantedAt: iso(consent.grantedAt),
          revokedAt: isoOrNull(consent.revokedAt),
        })),
        enrollments: enrollmentRows.map((enrollment) => ({ ...enrollment, cancelledAt: isoOrNull(enrollment.cancelledAt) })),
        payments: paymentRows.map((payment) => ({
          startsAt: payment.startsAt,
          createdAt: iso(payment.createdAt),
          voidedAt: isoOrNull(payment.voidedAt),
        })),
        checkIns: checkInRows.map((checkIn) => ({ day: checkIn.day, checkedInAt: iso(checkIn.checkedInAt) })),
        photos: exportedPhotos,
      };
      await audit.record(tx, { actor, action: 'student.exported', entity: 'student', entityId: row.id });
      return exported;
    });
  }

  /**
   * Anonimiza o aluno a pedido (door 7): trava a linha, confere as condições, remove os objetos de cada
   * foto, apaga fotos, consentimentos e responsáveis, limpa a ficha e grava a trilha, tudo numa
   * transação. Armazenamento que recusa uma remoção desfaz tudo e responde `503`; repetir termina.
   */
  async anonymizeStudent(id: string, actor: AuditActor): Promise<AnonymizeOutcome> {
    if (!UUID.test(id)) return 'not_found';
    return this.db.transaction(async (tx) => {
      await lockActiveAdmins(tx);
      // a mesma trava que a foto, a matrícula e o check-in usam; quem esperava vê a marca e não acha a linha
      const [row] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(and(eq(students.id, id), isNull(students.anonymizedAt)))
        .for('update');
      if (!row) return 'not_found';
      if (row.status !== 'inactive') return 'not_inactive';
      if (await this.hasOpenPeriods(tx, row.id)) return 'open_periods';

      await this.removePhotos(tx, photos.studentId, row.id);
      await tx.delete(photos).where(eq(photos.studentId, row.id));
      // o consentimento aponta para o responsável que o concedeu: sai antes dele
      await tx.delete(consents).where(eq(consents.studentId, row.id));
      await tx.delete(guardians).where(eq(guardians.studentId, row.id));
      await tx
        .update(students)
        .set({
          name: ANONYMIZED_NAME,
          cpf: null,
          birthDate: null,
          sex: null,
          email: null,
          phone: null,
          address: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          healthNotesEnc: null,
          anonymizedAt: sql`now()`,
          updatedAt: new Date(),
        })
        .where(eq(students.id, row.id));
      await this.clearStudentUser(tx, row.id);
      await audit.record(tx, { actor, action: 'student.anonymized', entity: 'student', entityId: row.id });
      return 'anonymized';
    });
  }

  /**
   * O login do aluno na anonimização (portal-aluno, door 5): o usuário fica, porque `audit_logs` aponta para
   * ele, sem nome, sem e-mail e sem nada que entre; `student_id` continua e a ficha já não diz quem é.
   */
  private async clearStudentUser(tx: Tx, studentId: string) {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.studentId, studentId)).for('update');
    if (!user) return;
    await tx
      .update(users)
      .set({ name: ANONYMIZED_NAME, email: `anonimizado+${user.id}@invalid`, active: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.delete(accounts).where(eq(accounts.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(twoFactors).where(eq(twoFactors.userId, user.id));
    await tx.delete(passwordTokens).where(eq(passwordTokens.userId, user.id));
  }

  /** Tudo o que o sistema guarda do funcionário (door 5): a ficha, o usuário vinculado e as fotos. */
  async exportStaff(id: string, actor: AuditActor): Promise<StaffExport | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.id, id), isNull(staff.anonymizedAt)));
      if (!row) return undefined;
      const [user] =
        row.userId === null
          ? []
          : await tx.select({ email: users.email, role: users.role }).from(users).where(eq(users.id, row.userId));
      const exportedPhotos = await this.exportedPhotos(tx, photos.staffId, row.id);

      const exported: StaffExport = {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        subject: 'staff',
        staff: {
          id: row.id,
          name: row.name,
          cpf: row.cpf!,
          position: row.position!,
          department: row.department,
          hiredAt: row.hiredAt!,
          phone: row.phone!,
          email: row.email,
          status: row.status,
          createdAt: iso(row.createdAt),
        },
        user: user ?? null,
        photos: exportedPhotos,
      };
      await audit.record(tx, { actor, action: 'staff.exported', entity: 'staff', entityId: row.id });
      return exported;
    });
  }

  /**
   * Anonimiza o funcionário a pedido, na ordem da door 7: trava, confere que está `inactive` e sem
   * usuário vinculado (door 2), remove os objetos, apaga as fotos, limpa a ficha e grava a trilha.
   */
  async anonymizeStaff(id: string, actor: AuditActor): Promise<AnonymizeStaffOutcome> {
    if (!UUID.test(id)) return 'not_found';
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: staff.id, status: staff.status, userId: staff.userId })
        .from(staff)
        .where(and(eq(staff.id, id), isNull(staff.anonymizedAt)))
        .for('update');
      if (!row) return 'not_found';
      if (row.status !== 'inactive') return 'not_inactive';
      if (row.userId !== null) return 'user_linked';

      await this.removePhotos(tx, photos.staffId, row.id);
      await tx.delete(photos).where(eq(photos.staffId, row.id));
      await tx
        .update(staff)
        .set({
          name: ANONYMIZED_NAME,
          cpf: null,
          position: null,
          department: null,
          hiredAt: null,
          phone: null,
          email: null,
          anonymizedAt: sql`now()`,
          updatedAt: new Date(),
        })
        .where(eq(staff.id, row.id));
      await audit.record(tx, { actor, action: 'staff.anonymized', entity: 'staff', entityId: row.id });
      return 'anonymized';
    });
  }

  /** As fotos do dono por versão, cada uma com a variante `large` lida do bucket; fora do ar, `503`. */
  private async exportedPhotos(tx: Tx, column: PhotoOwnerColumn, ownerId: string): Promise<StudentExport['photos']> {
    const photoRows = await tx
      .select({
        id: photos.id,
        version: photos.version,
        isCurrent: photos.isCurrent,
        createdAt: photos.createdAt,
        expiresAt: photos.expiresAt,
      })
      .from(photos)
      .where(eq(column, ownerId))
      .orderBy(asc(photos.version));

    const exportedPhotos: StudentExport['photos'] = [];
    for (const photo of photoRows) {
      const bytes = await this.storage.get(photoKey(ownerId, photo.id, 'large')).catch((error: unknown) => {
        if (error instanceof StorageUnavailable) throw storageUnavailable();
        throw error;
      });
      if (!bytes) throw storageUnavailable();
      exportedPhotos.push({
        version: photo.version,
        isCurrent: photo.isCurrent,
        createdAt: iso(photo.createdAt),
        expiresAt: isoOrNull(photo.expiresAt),
        image: `data:image/webp;base64,${bytes.toString('base64')}`,
      });
    }
    return exportedPhotos;
  }

  /** Remove os três objetos de cada foto do dono; uma remoção recusada responde `503` e desfaz a transação. */
  private async removePhotos(tx: Tx, column: PhotoOwnerColumn, ownerId: string) {
    const photoRows = await tx.select({ id: photos.id }).from(photos).where(eq(column, ownerId));
    const removed = await Promise.allSettled(
      photoRows.flatMap((photo) => PHOTO_VARIANTS.map((variant) => this.storage.remove(photoKey(ownerId, photo.id, variant)))),
    );
    if (removed.some((result) => result.status === 'rejected')) throw storageUnavailable();
  }

  /** A linha única da configuração de privacidade (door 4). */
  async settings(): Promise<PrivacySettings> {
    const [row] = await this.db
      .select({
        inactiveStudentRetentionYears: privacySettings.inactiveStudentRetentionYears,
        photoVersionRetentionDays: privacySettings.photoVersionRetentionDays,
      })
      .from(privacySettings);
    return row!;
  }

  /**
   * Grava os dois valores, com a linha travada, e `privacy.settings_updated` só com os campos que
   * mudaram; sem mudança, nada é gravado (door 6).
   */
  async updateSettings(input: PrivacySettings, actor: AuditActor): Promise<PrivacySettings> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          inactiveStudentRetentionYears: privacySettings.inactiveStudentRetentionYears,
          photoVersionRetentionDays: privacySettings.photoVersionRetentionDays,
        })
        .from(privacySettings)
        .for('update');
      const after: PrivacySettings = {
        inactiveStudentRetentionYears: input.inactiveStudentRetentionYears,
        photoVersionRetentionDays: input.photoVersionRetentionDays,
      };
      const diff = diffOf(before!, after, SETTINGS_FIELDS, SETTINGS_FIELDS);
      if (!diff) return after;

      await tx.update(privacySettings).set({ ...after, updatedAt: new Date() });
      await audit.record(tx, { actor, action: 'privacy.settings_updated', entity: 'privacy_settings', entityId: null, diff });
      return after;
    });
  }

  /**
   * Período em aberto: não cancelado e `active` ou `scheduled` (AD-061), ou `pending` ou `overdue`
   * (AD-068), com o dia de hoje em `America/Sao_Paulo` lido uma vez.
   */
  private async hasOpenPeriods(tx: Tx, studentId: string): Promise<boolean> {
    const today = saoPauloToday();
    const periods = await tx
      .select({
        id: enrollments.id,
        startsAt: enrollments.startsAt,
        endsAt: enrollments.endsAt,
        cancelledAt: enrollments.cancelledAt,
      })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), isNull(enrollments.cancelledAt)));
    if (periods.length === 0) return false;
    const confirmations = await tx
      .select({ enrollmentId: payments.enrollmentId, voidedAt: payments.voidedAt })
      .from(payments)
      .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
      .where(eq(enrollments.studentId, studentId));
    return periods.some((period) => {
      const situation = enrollmentStatus(period, today);
      if (situation === 'active' || situation === 'scheduled') return true;
      const paid = paymentStatus(
        period,
        confirmations.filter((confirmation) => confirmation.enrollmentId === period.id),
        today,
      ).status;
      return paid === 'pending' || paid === 'overdue';
    });
  }
}
