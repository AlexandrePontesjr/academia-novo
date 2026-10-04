import type { AuditDiff, AuditLogsQuery, AuditLogsResponse } from '@academia/contracts';
import { and, type Database, desc, eq, gte, lt, schema, sql } from '@academia/database';

const { auditLogs, users } = schema;

/** Fixo: a tela é a única consumidora. */
const PAGE_SIZE = 50;

/** Leitura da trilha de auditoria. Não há escrita aqui: quem grava é o `audit.record`. */
export class AuditLogsService {
  constructor(private readonly db: Database['db']) {}

  /**
   * Uma página da trilha, da linha mais recente para a mais antiga, com os filtros somados.
   * O cursor é o id da última linha da página anterior, e a página seguinte começa logo abaixo dela
   * na ordem (`created_at`, `id`): linha nova não desloca a paginação, e linhas do mesmo instante
   * não se repetem nem se perdem. `null` quando o cursor não é de uma linha da trilha.
   */
  async list(query: AuditLogsQuery): Promise<AuditLogsResponse | null> {
    if (query.cursor) {
      const [last] = await this.db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.id, query.cursor));
      if (!last) return null;
    }

    const rows = await this.db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        // o nome atual do autor: a trilha não guarda nome
        userName: users.name,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        diff: auditLogs.diff,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(
        and(
          query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
          query.to ? lt(auditLogs.createdAt, new Date(query.to)) : undefined,
          query.userId ? eq(auditLogs.userId, query.userId) : undefined,
          query.action ? eq(auditLogs.action, query.action) : undefined,
          query.entity ? eq(auditLogs.entity, query.entity) : undefined,
          query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
          query.ip ? eq(auditLogs.ip, query.ip) : undefined,
          query.cursor
            ? sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (select c.created_at, c.id from audit_logs c where c.id = ${query.cursor})`
            : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        user: row.userId ? { id: row.userId, name: row.userName ?? '' } : null,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        ip: row.ip,
        userAgent: row.userAgent,
        diff: row.diff as AuditDiff | null,
      })),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }
}
