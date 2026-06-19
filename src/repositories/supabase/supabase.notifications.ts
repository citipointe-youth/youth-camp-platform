import type { SqlClient } from './client';
import type { INotificationRepository } from '../interfaces/entity-repositories';
import type { Notification } from '../../core/entities/notification';

function toNotif(r: Record<string, unknown>): Notification {
  return {
    id: r['id'] as string,
    scope: r['scope'] as Notification['scope'],
    zone: (r['zone'] as string | null) ?? undefined,
    churchId: (r['church_id'] as string | null) ?? undefined,
    priority: r['priority'] as Notification['priority'],
    title: r['title'] as string,
    body: r['body'] as string,
    senderId: r['sender_id'] as string,
    senderName: r['sender_name'] as string,
    senderRole: r['sender_role'] as Notification['senderRole'],
    audienceEstimate: r['audience_estimate'] as number,
    expiresAt: r['expires_at'] ? (r['expires_at'] as Date).toISOString() : undefined,
    createdAt: (r['created_at'] as Date).toISOString(),
  };
}

export class SupabaseNotificationRepository implements INotificationRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Notification[]> {
    return (await this.sql`select * from notifications order by created_at desc`).map(toNotif);
  }

  async findById(id: string): Promise<Notification | null> {
    const rows = await this.sql`select * from notifications where id = ${id}`;
    return rows[0] ? toNotif(rows[0]) : null;
  }

  async findByScope(scope: string): Promise<Notification[]> {
    return (await this.sql`select * from notifications where scope = ${scope} order by created_at desc`).map(toNotif);
  }

  async findByZone(zone: string): Promise<Notification[]> {
    return (await this.sql`select * from notifications where zone = ${zone} order by created_at desc`).map(toNotif);
  }

  async findByChurch(churchId: string): Promise<Notification[]> {
    return (await this.sql`select * from notifications where church_id = ${churchId} order by created_at desc`).map(toNotif);
  }

  async findActive(): Promise<Notification[]> {
    return (await this.sql`
      select * from notifications
      where expires_at is null or expires_at > now()
      order by created_at desc
    `).map(toNotif);
  }

  async save(n: Notification): Promise<Notification> {
    await this.sql`
      insert into notifications ${this.sql({
        id: n.id,
        scope: n.scope,
        zone: n.zone ?? null,
        church_id: n.churchId ?? null,
        priority: n.priority,
        title: n.title,
        body: n.body,
        sender_id: n.senderId,
        sender_name: n.senderName,
        sender_role: n.senderRole,
        audience_estimate: n.audienceEstimate,
        expires_at: n.expiresAt ?? null,
        created_at: n.createdAt,
      })}
      on conflict (id) do update set title = excluded.title, body = excluded.body
    `;
    return n;
  }

  async saveMany(ns: Notification[]): Promise<Notification[]> {
    for (const n of ns) await this.save(n);
    return ns;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from notifications where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from notifications returning id`;
    return rows.length;
  }
}
