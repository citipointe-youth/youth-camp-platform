import type { INotificationRepository, IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Notification } from '../core/entities/notification';
import type { Actor } from '../core/entities/user';
import { assertCanSendNotification } from './access-control';
import { isCamper } from '../core/entities/person';
import { CreateNotificationSchema } from '../core/validation/notification.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { invalidateDashboardCache } from './dashboard-cache';

export interface NotificationService {
  send(actor: Actor, input: unknown): Promise<Notification>;
  feed(actor: Actor): Promise<Notification[]>;
  latest(actor: Actor): Promise<Notification | null>;
  remove(actor: Actor, id: string): Promise<{ ok: true }>;
  clearAll(actor: Actor): Promise<{ deleted: number }>;
}

export function makeNotificationService(
  notifRepo: INotificationRepository,
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): NotificationService {
  // D4 FIX: estimate the audience as a count of non-cancelled CAMPERS for every
  // scope, on a consistent basis. The church branch previously returned the church's
  // manually-set `expectedCount` (a planning number, default 0), so a church-scoped
  // notice reported a different kind of figure than camp/zone — and often 0 even with
  // campers present.
  async function estimateAudience(scope: string, zone?: string | null, churchId?: string | null): Promise<number> {
    if (scope === 'camp') {
      const all = await personRepo.findCampers();
      return all.length; // findCampers() already excludes cancelled (lifecycle ∈ {arrived,checked_out,departed})
    }
    if (scope === 'zone' && zone) {
      const zoned = await personRepo.findByZone(zone);
      return zoned.filter((p) => isCamper(p)).length;
    }
    if (scope === 'church' && churchId) {
      const churchPersons = await personRepo.findByChurch(churchId);
      return churchPersons.filter((p) => isCamper(p)).length;
    }
    return 0;
  }

  async function getActorFeed(actor: Actor): Promise<Notification[]> {
    const active = await notifRepo.findActive();
    return active.filter((n) => {
      if (n.scope === 'camp') return true;
      if (n.scope === 'zone') {
        if (actor.role === 'admin' || actor.role === 'director') return true;
        return actor.zone != null && n.zone === actor.zone;
      }
      if (n.scope === 'church') {
        if (actor.role === 'admin' || actor.role === 'director') return true;
        return actor.churchId != null && n.churchId === actor.churchId;
      }
      return false;
    });
  }

  return {
    async send(actor, input) {
      const data = CreateNotificationSchema.parse(input);
      assertCanSendNotification(actor, data.scope, data.zone);
      const audience = await estimateAudience(data.scope, data.zone, data.churchId);
      const notif: Notification = {
        id: newId('notif'),
        scope: data.scope,
        zone: data.zone ?? null,
        churchId: data.churchId ?? null,
        priority: data.priority ?? 'normal',
        title: data.title,
        body: data.body,
        senderId: actor.id,
        senderName: actor.displayName,
        senderRole: actor.role,
        audienceEstimate: audience,
        expiresAt: data.expiresAt ?? null,
        createdAt: nowISO(),
      };
      const saved = await notifRepo.save(notif);
      invalidateDashboardCache(); // affects AtCampDashboard.latestNotification
      return saved;
    },

    async feed(actor) {
      return getActorFeed(actor);
    },

    async latest(actor) {
      const feed = await getActorFeed(actor);
      return feed[0] ?? null;
    },

    async remove(actor, id) {
      if (actor.role !== 'zoneLeader' && actor.role !== 'director' && actor.role !== 'admin') {
        throw new ForbiddenError('Not allowed to delete notifications');
      }
      const existing = await notifRepo.findById(id);
      if (!existing) throw new NotFoundError('Notification not found');
      if (actor.role === 'zoneLeader' && !(existing.scope === 'zone' && existing.zone === actor.zone)) {
        throw new ForbiddenError('Zone leaders can only delete notices for their own zone');
      }
      await notifRepo.delete(id);
      invalidateDashboardCache();
      return { ok: true };
    },

    async clearAll(actor) {
      if (actor.role !== 'admin') {
        throw new Error('Only admin can clear all notifications');
      }
      const all = await notifRepo.findAll();
      for (const n of all) {
        await notifRepo.delete(n.id);
      }
      invalidateDashboardCache();
      return { deleted: all.length };
    },
  };
}
