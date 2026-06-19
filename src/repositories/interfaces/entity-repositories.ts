import type { IRepository } from './base.repository';
import type { User } from '../../core/entities/user';
import type { Church } from '../../core/entities/church';
import type { Person } from '../../core/entities/person';
import type { AccommodationBlock } from '../../core/entities/accommodation';
import type { Zone } from '../../core/entities/zone';
import type { Group } from '../../core/entities/group';
import type { StudentNote } from '../../core/entities/note';
import type { Notification } from '../../core/entities/notification';
import type { ScheduleItem } from '../../core/entities/schedule';
import type { Devotional } from '../../core/entities/devotional';
import type { FaqItem } from '../../core/entities/content';
import type { CampSettings, CampDefaults } from '../../core/entities/settings';
import type { UserRole } from '../../core/types/enums';

export interface IUserRepository extends IRepository<User> {
  findByUsername(username: string): Promise<User | null>;
  findByChurch(churchId: string): Promise<User[]>;
  findByRole(role: UserRole): Promise<User[]>;
}

export interface IChurchRepository extends IRepository<Church> {
  findByCode(code: string): Promise<Church | null>;
  findByZone(zone: string): Promise<Church[]>;
  findBySlug(slug: string): Promise<Church | null>;
}

/**
 * Unified person repository (design D2) — the union of the legacy registrant + camper
 * query surfaces over one store. `findCampers`/`findRegistrants` query by lifecycle so
 * the pre-camp and at-camp views read from the same table.
 */
export interface IPersonRepository extends IRepository<Person> {
  search(q: string): Promise<Person[]>;
  findByChurch(churchId: string): Promise<Person[]>;
  findByZone(zone: string): Promise<Person[]>;
  findByGroup(groupId: string): Promise<Person[]>;
  findByKind(kind: string): Promise<Person[]>;
  findByLifecycle(lifecycle: string): Promise<Person[]>;
  findCampers(): Promise<Person[]>; // lifecycle ∈ {arrived, checked_out, departed}
  findAtCamp(): Promise<Person[]>; // atCamp === true (currently signed in)
  // deleteAll() inherited from IRepository (bulk clear; Supabase: TRUNCATE).
}

export interface IAccommodationRepository extends IRepository<AccommodationBlock> {
  findByKind(kind: string): Promise<AccommodationBlock[]>;
}

export interface IZoneRepository extends IRepository<Zone> {
  findByName(name: string): Promise<Zone | null>;
}

export interface IGroupRepository extends IRepository<Group> {
  findByChurch(churchId: string): Promise<Group[]>;
  findByZone(zone: string): Promise<Group[]>;
  findByLeader(leaderId: string): Promise<Group[]>;
}

export interface INoteRepository extends IRepository<StudentNote> {
  findByCamper(camperId: string): Promise<StudentNote[]>;
  findByAuthor(authorId: string): Promise<StudentNote[]>;
  findByZone(zone: string, limit?: number): Promise<StudentNote[]>;
  findRecent(limit: number): Promise<StudentNote[]>;
}

export interface INotificationRepository extends IRepository<Notification> {
  findByScope(scope: string): Promise<Notification[]>;
  findByZone(zone: string): Promise<Notification[]>;
  findByChurch(churchId: string): Promise<Notification[]>;
  findActive(): Promise<Notification[]>;
}

export interface IScheduleRepository extends IRepository<ScheduleItem> {
  findByDay(day: string): Promise<ScheduleItem[]>;
  getCheckInPoints(): Promise<ScheduleItem[]>;
}

export interface IDevotionalRepository extends IRepository<Devotional> {
  findByDay(day: string): Promise<Devotional | null>;
}

export interface IFaqRepository extends IRepository<FaqItem> {
  findOrdered(): Promise<FaqItem[]>;
}

export interface ISettingsRepository {
  getSingleton(): Promise<CampSettings | null>;
  saveSingleton(settings: CampSettings): Promise<CampSettings>;
  init(): Promise<void>;
}

export interface ISnapshotRepository {
  getDefaults(): Promise<CampDefaults | null>;
  saveDefaults(defaults: CampDefaults): Promise<CampDefaults>;
  init(): Promise<void>;
}
