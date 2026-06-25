import { InMemoryBaseRepository } from './in-memory.base.repository';
import type { IPersistenceAdapter } from '../persistence/persistence';
import { NullPersistence } from '../persistence/persistence';

import type { User } from '../../core/entities/user';
import type { Church } from '../../core/entities/church';
import type { Person } from '../../core/entities/person';
import { isCamper } from '../../core/entities/person';
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

import type {
  IUserRepository,
  IChurchRepository,
  IPersonRepository,
  IAccommodationRepository,
  IZoneRepository,
  IGroupRepository,
  INoteRepository,
  INotificationRepository,
  IScheduleRepository,
  IDevotionalRepository,
  IFaqRepository,
  ISettingsRepository,
  ISnapshotRepository,
} from '../interfaces/entity-repositories';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export class InMemoryUserRepository
  extends InMemoryBaseRepository<User>
  implements IUserRepository
{
  constructor(persistence?: IPersistenceAdapter<User>) {
    super(persistence);
  }

  async findByUsername(username: string): Promise<User | null> {
    const lower = username.toLowerCase();
    for (const user of this.store.values()) {
      if (user.username.toLowerCase() === lower) return this.clone(user);
    }
    return null;
  }

  async findByChurch(churchId: string): Promise<User[]> {
    return Array.from(this.store.values())
      .filter((u) => u.churchId === churchId)
      .map((u) => this.clone(u));
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return Array.from(this.store.values())
      .filter((u) => u.role === role)
      .map((u) => this.clone(u));
  }
}

// ---------------------------------------------------------------------------
// Churches
// ---------------------------------------------------------------------------
export class InMemoryChurchRepository
  extends InMemoryBaseRepository<Church>
  implements IChurchRepository
{
  constructor(persistence?: IPersistenceAdapter<Church>) {
    super(persistence);
  }

  async findByZone(zone: string): Promise<Church[]> {
    return Array.from(this.store.values())
      .filter((c) => c.zone === zone)
      .map((c) => this.clone(c));
  }
}

// ---------------------------------------------------------------------------
// People (unified registrant + camper — design D2)
// ---------------------------------------------------------------------------
export class InMemoryPersonRepository
  extends InMemoryBaseRepository<Person>
  implements IPersonRepository
{
  constructor(persistence?: IPersistenceAdapter<Person>) {
    super(persistence);
  }

  async search(q: string): Promise<Person[]> {
    const lower = q.toLowerCase();
    return Array.from(this.store.values())
      .filter((p) => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        return (
          fullName.includes(lower) ||
          p.firstName.toLowerCase().includes(lower) ||
          p.lastName.toLowerCase().includes(lower)
        );
      })
      .map((p) => this.clone(p));
  }

  async findByChurch(churchId: string): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.churchId === churchId)
      .map((p) => this.clone(p));
  }

  async findByZone(zone: string): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.zone === zone)
      .map((p) => this.clone(p));
  }

  async findByGroup(groupId: string): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.groupId === groupId)
      .map((p) => this.clone(p));
  }

  async findByKind(kind: string): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.kind === kind)
      .map((p) => this.clone(p));
  }

  async findByLifecycle(lifecycle: string): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.lifecycle === lifecycle)
      .map((p) => this.clone(p));
  }

  async findCampers(): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => isCamper(p))
      .map((p) => this.clone(p));
  }

  async findAtCamp(): Promise<Person[]> {
    return Array.from(this.store.values())
      .filter((p) => p.atCamp)
      .map((p) => this.clone(p));
  }

  // deleteAll() is inherited from InMemoryBaseRepository (bulk clear, defect A3).
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------
export class InMemoryAccommodationRepository
  extends InMemoryBaseRepository<AccommodationBlock>
  implements IAccommodationRepository
{
  constructor(persistence?: IPersistenceAdapter<AccommodationBlock>) {
    super(persistence);
  }

  async findByKind(kind: string): Promise<AccommodationBlock[]> {
    return Array.from(this.store.values())
      .filter((b) => b.kind === kind)
      .map((b) => this.clone(b));
  }
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export class InMemoryZoneRepository
  extends InMemoryBaseRepository<Zone>
  implements IZoneRepository
{
  constructor(persistence?: IPersistenceAdapter<Zone>) {
    super(persistence);
  }

  async findByName(name: string): Promise<Zone | null> {
    for (const zone of this.store.values()) {
      if (zone.name === name) return this.clone(zone);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export class InMemoryGroupRepository
  extends InMemoryBaseRepository<Group>
  implements IGroupRepository
{
  constructor(persistence?: IPersistenceAdapter<Group>) {
    super(persistence);
  }

  async findByChurch(churchId: string): Promise<Group[]> {
    return Array.from(this.store.values())
      .filter((g) => g.churchId === churchId)
      .map((g) => this.clone(g));
  }

  async findByZone(zone: string): Promise<Group[]> {
    return Array.from(this.store.values())
      .filter((g) => g.zone === zone)
      .map((g) => this.clone(g));
  }

  async findByLeader(leaderId: string): Promise<Group[]> {
    return Array.from(this.store.values())
      .filter((g) => g.leaderId === leaderId)
      .map((g) => this.clone(g));
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export class InMemoryNoteRepository
  extends InMemoryBaseRepository<StudentNote>
  implements INoteRepository
{
  constructor(persistence?: IPersistenceAdapter<StudentNote>) {
    super(persistence);
  }

  async findByCamper(camperId: string): Promise<StudentNote[]> {
    return Array.from(this.store.values())
      .filter((n) => n.camperId === camperId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => this.clone(n));
  }

  async findByAuthor(authorId: string): Promise<StudentNote[]> {
    return Array.from(this.store.values())
      .filter((n) => n.authorId === authorId)
      .map((n) => this.clone(n));
  }

  async findByZone(zone: string, limit = 50): Promise<StudentNote[]> {
    // Notes don't have zone directly; look up via camper zone is done at service level.
    // Here we return all notes (zone filtering at service layer).
    return Array.from(this.store.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((n) => this.clone(n));
  }

  async findRecent(limit: number): Promise<StudentNote[]> {
    return Array.from(this.store.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((n) => this.clone(n));
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export class InMemoryNotificationRepository
  extends InMemoryBaseRepository<Notification>
  implements INotificationRepository
{
  constructor(persistence?: IPersistenceAdapter<Notification>) {
    super(persistence);
  }

  async findByScope(scope: string): Promise<Notification[]> {
    return Array.from(this.store.values())
      .filter((n) => n.scope === scope)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => this.clone(n));
  }

  async findByZone(zone: string): Promise<Notification[]> {
    return Array.from(this.store.values())
      .filter((n) => n.zone === zone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => this.clone(n));
  }

  async findByChurch(churchId: string): Promise<Notification[]> {
    return Array.from(this.store.values())
      .filter((n) => n.churchId === churchId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => this.clone(n));
  }

  async findActive(): Promise<Notification[]> {
    const now = new Date().toISOString();
    return Array.from(this.store.values())
      .filter((n) => !n.expiresAt || n.expiresAt > now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => this.clone(n));
  }
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
export class InMemoryScheduleRepository
  extends InMemoryBaseRepository<ScheduleItem>
  implements IScheduleRepository
{
  constructor(persistence?: IPersistenceAdapter<ScheduleItem>) {
    super(persistence);
  }

  async findByDay(day: string): Promise<ScheduleItem[]> {
    return Array.from(this.store.values())
      .filter((s) => s.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => this.clone(s));
  }
}

// ---------------------------------------------------------------------------
// Devotionals
// ---------------------------------------------------------------------------
export class InMemoryDevotionalRepository
  extends InMemoryBaseRepository<Devotional>
  implements IDevotionalRepository
{
  constructor(persistence?: IPersistenceAdapter<Devotional>) {
    super(persistence);
  }

  async findByDay(day: string): Promise<Devotional | null> {
    for (const d of this.store.values()) {
      if (d.day === day) return this.clone(d);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
export class InMemoryFaqRepository
  extends InMemoryBaseRepository<FaqItem>
  implements IFaqRepository
{
  constructor(persistence?: IPersistenceAdapter<FaqItem>) {
    super(persistence);
  }

  async findOrdered(): Promise<FaqItem[]> {
    return Array.from(this.store.values())
      .sort((a, b) => a.order - b.order)
      .map((f) => this.clone(f));
  }
}

// ---------------------------------------------------------------------------
// Settings (singleton)
// ---------------------------------------------------------------------------
export class InMemorySettingsRepository implements ISettingsRepository {
  private settings: CampSettings | null = null;
  private persistence: IPersistenceAdapter<CampSettings>;

  constructor(persistence?: IPersistenceAdapter<CampSettings>) {
    this.persistence = persistence ?? new NullPersistence<CampSettings>();
  }

  async init(): Promise<void> {
    const items = await this.persistence.read();
    this.settings = items[0] ?? null;
  }

  async getSingleton(): Promise<CampSettings | null> {
    return this.settings ? (JSON.parse(JSON.stringify(this.settings)) as CampSettings) : null;
  }

  async saveSingleton(settings: CampSettings): Promise<CampSettings> {
    this.settings = JSON.parse(JSON.stringify(settings)) as CampSettings;
    await this.persistence.write(this.settings ? [this.settings] : []);
    return JSON.parse(JSON.stringify(this.settings)) as CampSettings;
  }
}

// ---------------------------------------------------------------------------
// Snapshots / Defaults
// ---------------------------------------------------------------------------
export class InMemorySnapshotRepository implements ISnapshotRepository {
  private defaults: CampDefaults | null = null;
  private persistence: IPersistenceAdapter<CampDefaults>;

  constructor(persistence?: IPersistenceAdapter<CampDefaults>) {
    this.persistence = persistence ?? new NullPersistence<CampDefaults>();
  }

  async init(): Promise<void> {
    const items = await this.persistence.read();
    this.defaults = items[0] ?? null;
  }

  async getDefaults(): Promise<CampDefaults | null> {
    return this.defaults ? (JSON.parse(JSON.stringify(this.defaults)) as CampDefaults) : null;
  }

  async saveDefaults(defaults: CampDefaults): Promise<CampDefaults> {
    this.defaults = JSON.parse(JSON.stringify(defaults)) as CampDefaults;
    await this.persistence.write(this.defaults ? [this.defaults] : []);
    return JSON.parse(JSON.stringify(this.defaults)) as CampDefaults;
  }
}
