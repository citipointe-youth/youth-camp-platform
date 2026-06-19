import { env } from './config/env';
import { join } from 'node:path';

// Repositories
import {
  InMemoryUserRepository,
  InMemoryChurchRepository,
  InMemoryPersonRepository,
  InMemoryAccommodationRepository,
  InMemoryZoneRepository,
  InMemoryGroupRepository,
  InMemoryNoteRepository,
  InMemoryNotificationRepository,
  InMemoryScheduleRepository,
  InMemoryDevotionalRepository,
  InMemoryFaqRepository,
  InMemorySettingsRepository,
  InMemorySnapshotRepository,
} from './repositories/in-memory';
import { JsonFilePersistence } from './repositories/persistence';
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
} from './repositories/interfaces';
import type { User } from './core/entities/user';
import type { Church } from './core/entities/church';
import type { Person } from './core/entities/person';
import type { AccommodationBlock } from './core/entities/accommodation';
import type { Zone } from './core/entities/zone';
import type { Group } from './core/entities/group';
import type { StudentNote } from './core/entities/note';
import type { Notification } from './core/entities/notification';
import type { ScheduleItem } from './core/entities/schedule';
import type { Devotional } from './core/entities/devotional';
import type { FaqItem } from './core/entities/content';
import type { CampSettings, CampDefaults } from './core/entities/settings';

// Services
import { makeAuthService, type AuthService } from './services/auth.service';
import { makeSettingsService, type SettingsService } from './services/settings.service';
import { makeAccommodationService, type AccommodationService } from './services/accommodation.service';
import { makeCheckInService, type CheckInService } from './services/checkin.service';
import { makeNotificationService, type NotificationService } from './services/notification.service';
import { makeSearchService, type SearchService } from './services/search.service';
import { makeNoteService, type NoteService } from './services/note.service';
import { makeScheduleService, type ScheduleService } from './services/schedule.service';
import { makeContentService, type ContentService } from './services/content.service';
import { makeImportService, type ImportService } from './services/import.service';
import { makeAccountService, type AccountService } from './services/account.service';
import { makeDashboardService, type DashboardService } from './services/dashboard.service';
import { makeAdminService, type AdminService } from './services/admin.service';
import { makePersonService, type PersonService } from './services/person.service';

export interface Repositories {
  users: IUserRepository;
  churches: IChurchRepository;
  people: IPersonRepository;
  accommodation: IAccommodationRepository;
  zones: IZoneRepository;
  groups: IGroupRepository;
  notes: INoteRepository;
  notifications: INotificationRepository;
  schedule: IScheduleRepository;
  devotionals: IDevotionalRepository;
  faqs: IFaqRepository;
  settings: ISettingsRepository;
  snapshots: ISnapshotRepository;
}

export interface Services {
  auth: AuthService;
  settings: SettingsService;
  person: PersonService;
  accommodation: AccommodationService;
  checkIn: CheckInService;
  notification: NotificationService;
  search: SearchService;
  note: NoteService;
  schedule: ScheduleService;
  content: ContentService;
  importService: ImportService;
  account: AccountService;
  dashboard: DashboardService;
  admin: AdminService;
  // Expose raw user repo for auth/me lookup
  users: IUserRepository;
}

export interface Container {
  repos: Repositories;
  services: Services;
}

function makeJsonPersistence<T>(filename: string) {
  return new JsonFilePersistence<T>(join(env.DATA_DIR, filename));
}

export async function buildContainer(): Promise<Container> {
  // ----- Repositories -----
  const useJson = env.PERSISTENCE === 'json';

  const users: IUserRepository = new InMemoryUserRepository(
    useJson ? makeJsonPersistence<User>('users.json') : undefined,
  );
  const churches: IChurchRepository = new InMemoryChurchRepository(
    useJson ? makeJsonPersistence<Church>('churches.json') : undefined,
  );
  const people: IPersonRepository = new InMemoryPersonRepository(
    useJson ? makeJsonPersistence<Person>('people.json') : undefined,
  );
  const accommodationRepo: IAccommodationRepository = new InMemoryAccommodationRepository(
    useJson ? makeJsonPersistence<AccommodationBlock>('accommodation.json') : undefined,
  );
  const zones: IZoneRepository = new InMemoryZoneRepository(
    useJson ? makeJsonPersistence<Zone>('zones.json') : undefined,
  );
  const groups: IGroupRepository = new InMemoryGroupRepository(
    useJson ? makeJsonPersistence<Group>('groups.json') : undefined,
  );
  const notes: INoteRepository = new InMemoryNoteRepository(
    useJson ? makeJsonPersistence<StudentNote>('notes.json') : undefined,
  );
  const notifications: INotificationRepository = new InMemoryNotificationRepository(
    useJson ? makeJsonPersistence<Notification>('notifications.json') : undefined,
  );
  const scheduleRepo: IScheduleRepository = new InMemoryScheduleRepository(
    useJson ? makeJsonPersistence<ScheduleItem>('schedule.json') : undefined,
  );
  const devotionals: IDevotionalRepository = new InMemoryDevotionalRepository(
    useJson ? makeJsonPersistence<Devotional>('devotionals.json') : undefined,
  );
  const faqs: IFaqRepository = new InMemoryFaqRepository(
    useJson ? makeJsonPersistence<FaqItem>('faqs.json') : undefined,
  );
  const settingsRepo: ISettingsRepository = new InMemorySettingsRepository(
    useJson ? makeJsonPersistence<CampSettings>('settings.json') : undefined,
  );
  const snapshots: ISnapshotRepository = new InMemorySnapshotRepository(
    useJson ? makeJsonPersistence<CampDefaults>('snapshots.json') : undefined,
  );

  const repos: Repositories = {
    users,
    churches,
    people,
    accommodation: accommodationRepo,
    zones,
    groups,
    notes,
    notifications,
    schedule: scheduleRepo,
    devotionals,
    faqs,
    settings: settingsRepo,
    snapshots,
  };

  // Init all repos
  await Promise.all([
    users.init(),
    churches.init(),
    people.init(),
    accommodationRepo.init(),
    zones.init(),
    groups.init(),
    notes.init(),
    notifications.init(),
    scheduleRepo.init(),
    devotionals.init(),
    faqs.init(),
    settingsRepo.init(),
    snapshots.init(),
  ]);

  // ----- Services -----
  const auth = makeAuthService(users);
  const settings = makeSettingsService(settingsRepo);
  const personSvc = makePersonService(people);
  const accommodationSvc = makeAccommodationService(accommodationRepo, churches, settingsRepo, people);
  const checkIn = makeCheckInService(scheduleRepo, people, settingsRepo);
  const notification = makeNotificationService(notifications, people, churches);
  const search = makeSearchService(people, churches);
  const note = makeNoteService(notes, people);
  const schedule = makeScheduleService(scheduleRepo);
  const content = makeContentService(faqs, devotionals);
  const importSvc = makeImportService(people, churches);
  const account = makeAccountService(users, churches);
  const dashboard = makeDashboardService(
    people,
    accommodationRepo,
    notifications,
    scheduleRepo,
    churches,
  );
  const admin = makeAdminService(
    users,
    churches,
    people,
    accommodationRepo,
    faqs,
    scheduleRepo,
    notifications,
    notes,
    devotionals,
    settingsRepo,
    snapshots,
  );

  const services: Services = {
    auth,
    settings,
    person: personSvc,
    accommodation: accommodationSvc,
    checkIn,
    notification,
    search,
    note,
    schedule,
    content,
    importService: importSvc,
    account,
    dashboard,
    admin,
    users,
  };

  return { repos, services };
}
