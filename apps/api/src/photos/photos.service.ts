import { PHOTO_VARIANTS, type PhotoCreated, type PhotoUrlResponse, type PhotoVariant } from '@academia/contracts';
import { and, type Database, eq, inArray, lte, schema, sql } from '@academia/database';
import { Injectable } from '@nestjs/common';
import { audit, type AuditActor, NO_ACTOR } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import { ProblemException } from '../problem.filter.ts';
import { detectFormat, makeVariants } from './photo-image.ts';
import { photoKey } from './photo-keys.ts';
import type { PhotoSigner } from './photo-signer.ts';
import { type PhotoStorage, StorageUnavailable } from './photo-storage.ts';

const { photos, students } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** O aluno da rota: o `id` do banco, em minúsculas, é o que entra na chave do objeto (door 2). */
export interface PhotoTarget {
  studentId: string;
}

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/**
 * Envio, troca, remoção e leitura da foto do aluno: as variantes vão ao bucket, a linha e a trilha
 * de auditoria entram juntas na mesma transação, e a URL é assinada pela aplicação (door 4).
 */
@Injectable()
export class PhotosService {
  constructor(
    private readonly db: Database['db'],
    private readonly storage: PhotoStorage,
    private readonly signer: PhotoSigner,
    /** Dias que a foto trocada fica guardada (foto-captura, door 5). */
    private readonly retentionDays: number,
  ) {}

  /** O `id` do aluno como o banco o guarda (minúsculo), ou `undefined` se `id` não é de aluno nenhum. */
  async findStudent(id: string): Promise<PhotoTarget | undefined> {
    if (!UUID.test(id)) return undefined;
    const [row] = await this.db.select({ id: students.id }).from(students).where(eq(students.id, id));
    return row && { studentId: row.id };
  }

  /** `409` se o aluno já tem foto corrente: o `POST` não troca, quem troca é o `PUT`. */
  async assertNoCurrent(studentId: string) {
    const [current] = await this.db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.studentId, studentId), eq(photos.isCurrent, true)));
    if (current) throw new ProblemException(409, 'photo_exists');
  }

  /** O envio da primeira foto: com foto corrente, `409`. */
  create(target: PhotoTarget, file: Buffer, actor: AuditActor): Promise<PhotoCreated> {
    return this.store(target, file, actor, false);
  }

  /** A troca (foto-captura, door 2): guarda a corrente com prazo e põe a nova; sem corrente, cria a primeira. */
  replace(target: PhotoTarget, file: Buffer, actor: AuditActor): Promise<PhotoCreated> {
    return this.store(target, file, actor, true);
  }

  /** Trava a linha do aluno: envio, troca e remoção do mesmo aluno entram um de cada vez. */
  private async lockStudent(tx: Tx, studentId: string) {
    await tx.execute(sql`select 1 from ${students} where ${students.id} = ${studentId} for update`);
  }

  /**
   * Grava as três variantes, depois a linha e a auditoria numa transação. O que não entrou no banco
   * não fica no bucket: a trava do aluno decide a corrida entre dois envios, e quem perde remove os
   * objetos que gravou. Com `replacing`, a foto corrente deixa de sê-lo e ganha o prazo do relógio do
   * banco (door 1) em vez de recusar o envio.
   */
  private async store(target: PhotoTarget, file: Buffer, actor: AuditActor, replacing: boolean): Promise<PhotoCreated> {
    if (!detectFormat(file)) throw new ProblemException(415, 'unsupported_media_type');
    if (!replacing) await this.assertNoCurrent(target.studentId);
    const variants = await makeVariants(file);

    // o `photoId` é gerado pelo banco e entra na chave antes de a linha existir
    const [generated] = await this.db.execute<{ id: string }>(sql`select uuidv7() as id`).then((result) => result.rows);
    const photoId = generated!.id;
    const keys = PHOTO_VARIANTS.map((variant) => photoKey(target.studentId, photoId, variant));

    // todas as gravações terminam antes de qualquer limpeza: uma ainda em voo recriaria o objeto apagado
    const written = await Promise.allSettled(
      PHOTO_VARIANTS.map((variant, index) => this.storage.put(keys[index]!, variants[variant])),
    );
    if (written.some((result) => result.status === 'rejected')) {
      await this.removeObjects(photoId, keys);
      throw new ProblemException(503, 'storage_unavailable');
    }

    try {
      return await this.db.transaction(async (tx) => {
        await this.lockStudent(tx, target.studentId);
        const previous = replacing
          ? await tx
              .update(photos)
              .set({ isCurrent: false, expiresAt: sql`now() + make_interval(days => ${this.retentionDays}::int)` })
              .where(and(eq(photos.studentId, target.studentId), eq(photos.isCurrent, true)))
              .returning({ id: photos.id })
          : [];
        const [last] = await tx
          .select({ version: sql<number>`coalesce(max(${photos.version}), 0)` })
          .from(photos)
          .where(eq(photos.studentId, target.studentId));
        const [row] = await tx
          .insert(photos)
          .values({ id: photoId, studentId: target.studentId, version: Number(last!.version) + 1, isCurrent: true })
          .returning();
        await audit.record(tx, {
          actor,
          action: previous.length > 0 ? 'student.photo_replaced' : 'student.photo_uploaded',
          entity: 'student',
          entityId: target.studentId,
        });
        return { id: row!.id, version: row!.version, createdAt: row!.createdAt.toISOString() };
      });
    } catch (error) {
      await this.removeObjects(photoId, keys);
      // só o `POST` chega aqui com corrente: outro envio entrou entre a checagem e a trava
      if (isUniqueViolation(error)) throw new ProblemException(409, 'photo_exists');
      throw error;
    }
  }

  /**
   * Remove toda linha do aluno, a corrente e as versões guardadas, com a auditoria na mesma
   * transação, e só depois os objetos: com a linha fora, a foto já não é entregue, e um objeto que
   * não sai é registrado pelo `photoId` (AC 40). Sem foto, não há o que fazer nem o que registrar
   * (AC 38).
   */
  async remove(target: PhotoTarget, actor: AuditActor): Promise<void> {
    const removed = await this.db.transaction(async (tx) => {
      await this.lockStudent(tx, target.studentId);
      const rows = await tx.delete(photos).where(eq(photos.studentId, target.studentId)).returning({ id: photos.id });
      if (rows.length > 0) {
        await audit.record(tx, {
          actor,
          action: 'student.photo_removed',
          entity: 'student',
          entityId: target.studentId,
        });
      }
      return rows;
    });
    for (const { id } of removed) {
      await this.removeObjects(
        id,
        PHOTO_VARIANTS.map((variant) => photoKey(target.studentId, id, variant)),
      );
    }
  }

  /**
   * Apaga as versões guardadas cujo prazo venceu (foto-captura, door 4): os três objetos e, só com
   * os três fora, a linha e a auditoria sem autor numa transação. Uma versão cujo objeto não sai
   * fica como estava, para a execução seguinte; quem perde a corrida com outra execução não acha a
   * linha e não grava auditoria.
   */
  async purgeExpired(): Promise<{ purged: number; failed: number }> {
    const expired = await this.db
      .select({ id: photos.id, studentId: photos.studentId })
      .from(photos)
      .where(and(eq(photos.isCurrent, false), lte(photos.expiresAt, sql`now()`)));
    const outcome = { purged: 0, failed: 0 };
    for (const version of expired) {
      // `student_id` é anulável desde a `0007`; a versão de funcionário é da rotina por dono (funcionarios, S7)
      const { studentId } = version;
      if (studentId === null) continue;
      const removed = await Promise.allSettled(
        PHOTO_VARIANTS.map((variant) => this.storage.remove(photoKey(studentId, version.id, variant))),
      );
      if (removed.some((result) => result.status === 'rejected')) {
        outcome.failed += 1;
        continue;
      }
      const purged = await this.db.transaction(async (tx) => {
        const rows = await tx
          .delete(photos)
          .where(and(eq(photos.id, version.id), eq(photos.isCurrent, false)))
          .returning({ id: photos.id });
        if (rows.length === 0) return false;
        await audit.record(tx, {
          actor: NO_ACTOR,
          action: 'student.photo_version_purged',
          entity: 'student',
          entityId: studentId,
        });
        return true;
      });
      if (purged) outcome.purged += 1;
    }
    return outcome;
  }

  /** O `photoId` da foto corrente do aluno, ou `undefined`. */
  async currentId(studentId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.studentId, studentId), eq(photos.isCurrent, true)));
    return row?.id;
  }

  /** O `photoId` da foto corrente de cada aluno dos `studentIds`; quem não tem foto não aparece. */
  async currentIds(studentIds: string[]): Promise<Map<string, string>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.db
      .select({ studentId: photos.studentId, id: photos.id })
      .from(photos)
      .where(and(inArray(photos.studentId, studentIds), eq(photos.isCurrent, true)));
    return new Map(rows.flatMap((row): Array<[string, string]> => (row.studentId === null ? [] : [[row.studentId, row.id]])));
  }

  /** A URL assinada da variante da foto corrente, ou `undefined` se o aluno não tem foto. */
  async urlFor(studentId: string, variant: PhotoVariant): Promise<PhotoUrlResponse | undefined> {
    const photoId = await this.currentId(studentId);
    return photoId ? this.signer.issue(photoId, variant) : undefined;
  }

  /** `photoUrl` do aluno (`null` sem foto) para cada `id`, na variante dada. */
  async photoUrls(studentIds: string[], variant: PhotoVariant): Promise<Map<string, string | null>> {
    const current = await this.currentIds(studentIds);
    return new Map(studentIds.map((id) => [id, current.has(id) ? this.signer.issue(current.get(id)!, variant).url : null]));
  }

  /** Confere a assinatura; `false` para qualquer forma malformada. */
  isSigned(photoId: string, variant: string, exp: unknown, sig: unknown) {
    return this.signer.verify(photoId, variant, exp, sig);
  }

  /** Os bytes da variante de uma foto, ou `undefined` se a foto não existe mais. */
  async fileOf(photoId: string, variant: PhotoVariant): Promise<Buffer | undefined> {
    if (!UUID.test(photoId)) return undefined;
    const [row] = await this.db.select({ studentId: photos.studentId }).from(photos).where(eq(photos.id, photoId));
    // a foto de funcionário é da rotina por dono (funcionarios, S7)
    if (!row?.studentId) return undefined;
    try {
      return await this.storage.get(photoKey(row.studentId, photoId, variant));
    } catch (error) {
      if (error instanceof StorageUnavailable) throw new ProblemException(503, 'storage_unavailable');
      throw error;
    }
  }

  /**
   * Apaga os objetos de uma foto, um a um. Falha não interrompe quem chama: o que sobra no bucket é
   * registrado só pelo `photoId`, nunca pela chave nem pelo texto do erro.
   */
  private async removeObjects(photoId: string, keys: string[]) {
    const results = await Promise.allSettled(keys.map((key) => this.storage.remove(key)));
    if (results.some((result) => result.status === 'rejected')) {
      process.stderr.write(
        JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: 'photo objects not removed', photoId }) + '\n',
      );
    }
  }
}
