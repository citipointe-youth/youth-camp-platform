import { env } from './config/env';
import { join } from 'node:path';

// Repositories
import {
  InMemoryUserRepository,
  InMemoryChurchRepository,
  InMemoryPersonRepository,
  InMemoryClassroomRepository,
  InMemoryAllocationRepository,
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
import {
  SupabaseUserRepository,
  SupabaseChurchRepository,
  SupabasePersonRepository,
  SupabaseClassroomRepository,
  SupabaseAllocationRepository,
  SupabaseZoneRepository,
  SupabaseGroupRepository,
  SupabaseNoteRepository,
  SupabaseNotificationRepository,
  SupabaseScheduleRepository,
  SupabaseDevotionalRepository,
  SupabaseFaqRepository,
  SupabaseSettingsRepository,
  SupabaseDefaultsRepository,
} from './repositories/supabase';
import { getSqlClient } from './repositories/supabase/client';
import type {
  IUserRepository,
  IChurchRepository,
  IPersonRepository,
  IClassroomRepository,
  IAllocationRepository,
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
import type { Classroom, RoomAllocation } from './core/entities/accommodation';
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
import { makeExportService, type ExportService } from './services/export.service';
import { makeAccountService, type AccountService } from './services/account.service';
import { makeDashboardService, type DashboardService } from './services/dashboard.service';
import { makeAdminService, type AdminService } from './services/admin.service';
import { makePersonService, type PersonService } from './services/person.service';
import { makeChurchImportService, type ChurchImportService } from './services/church-import.service';
import { makeTicketImportService, type TicketImportService } from './services/ticket-import.service';
import { makeInvoiceImportService, type InvoiceImportService } from './services/invoice-import.service';
import { makeAuditExportService, type AuditExportService } from './services/audit-export.service';

export interface Repositories {
  users: IUserRepository;
  churches: IChurchRepository;
  people: IPersonRepository;
  classrooms: IClassroomRepository;
  allocations: IAllocationRepository;
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
  exportService: ExportService;
  churchImport: ChurchImportService;
  ticketImport: TicketImportService;
  invoiceImport: InvoiceImportService;
  auditExport: AuditExportService;
  account: AccountService;
  dashboard: DashboardService;
  admin: AdminService;
  // Expose raw user repo for auth/me lookup and audit controller
  users: IUserRepository;
  settingsRepo: ISettingsRepository;
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

  // Supabase production backend — all repos share one pooled SQL client.
  if (env.PERSISTENCE === 'supabase') {
    const sql = getSqlClient();
    const users: IUserRepository = new SupabaseUserRepository(sql);
    const churches: IChurchRepository = new SupabaseChurchRepository(sql);
    const people: IPersonRepository = new SupabasePersonRepository(sql);
    const classrooms: IClassroomRepository = new SupabaseClassroomRepository(sql);
    const allocations: IAllocationRepository = new SupabaseAllocationRepository(sql);
    const zones: IZoneRepository = new SupabaseZoneRepository(sql);
    const groups: IGroupRepository = new SupabaseGroupRepository(sql);
    const notes: INoteRepository = new SupabaseNoteRepository(sql);
    const notifications: INotificationRepository = new SupabaseNotificationRepository(sql);
    const scheduleRepo: IScheduleRepository = new SupabaseScheduleRepository(sql);
    const devotionals: IDevotionalRepository = new SupabaseDevotionalRepository(sql);
    const faqs: IFaqRepository = new SupabaseFaqRepository(sql);
    const settingsRepo: ISettingsRepository = new SupabaseSettingsRepository(sql);
    const snapshots: ISnapshotRepository = new SupabaseDefaultsRepository(sql);

    const repos: Repositories = {
      users, churches, people, classrooms, allocations,
      zones, groups, notes, notifications, schedule: scheduleRepo,
      devotionals, faqs, settings: settingsRepo, snapshots,
    };

    await Promise.all([
      users.init(), churches.init(), people.init(), classrooms.init(), allocations.init(),
      zones.init(), groups.init(), notes.init(), notifications.init(),
      scheduleRepo.init(), devotionals.init(), faqs.init(), settingsRepo.init(), snapshots.init(),
    ]);

    const auth = makeAuthService(users, settingsRepo);
    const settings = makeSettingsService(settingsRepo);
    const personSvc = makePersonService(people);
    const accommodationSvc = makeAccommodationService(classrooms, allocations, churches, settingsRepo, people);
    const checkIn = makeCheckInService(people, settingsRepo);
    const notification = makeNotificationService(notifications, people, churches);
    const search = makeSearchService(people, churches);
    const note = makeNoteService(notes, people);
    const schedule = makeScheduleService(scheduleRepo);
    const content = makeContentService(faqs, devotionals);
    const importSvc = makeImportService(people, churches);
    const exportSvc = makeExportService(people, churches);
    const churchImportSvc = makeChurchImportService(users, churches);
    const ticketImportSvc = makeTicketImportService(people, churches);
    const invoiceImportSvc = makeInvoiceImportService(people);
    const auditExportSvc = makeAuditExportService(people, notes, settingsRepo);
    const account = makeAccountService(users, churches, people);
    const dashboard = makeDashboardService(people, notifications, churches);
    const admin = makeAdminService(
      users, churches, people, classrooms, allocations, faqs, scheduleRepo,
      notifications, notes, devotionals, settingsRepo, snapshots,
    );

    const services: Services = {
      auth, settings, person: personSvc, accommodation: accommodationSvc,
      checkIn, notification, search, note, schedule, content,
      importService: importSvc, exportService: exportSvc, churchImport: churchImportSvc,
      ticketImport: ticketImportSvc, invoiceImport: invoiceImportSvc,
      auditExport: auditExportSvc,
      account, dashboard, admin, users, settingsRepo,
    };

    return { repos, services };
  }

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
  const classrooms: IClassroomRepository = new InMemoryClassroomRepository(
    useJson ? makeJsonPersistence<Classroom>('classrooms.json') : undefined,
  );
  const allocations: IAllocationRepository = new InMemoryAllocationRepository(
    useJson ? makeJsonPersistence<RoomAllocation>('allocations.json') : undefined,
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
    classrooms,
    allocations,
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
    classrooms.init(),
    allocations.init(),
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
  const auth = makeAuthService(users, settingsRepo);
  const settings = makeSettingsService(settingsRepo);
  const personSvc = makePersonService(people);
  const accommodationSvc = makeAccommodationService(classrooms, allocations, churches, settingsRepo, people);
  const checkIn = makeCheckInService(people, settingsRepo);
  const notification = makeNotificationService(notifications, people, churches);
  const search = makeSearchService(people, churches);
  const note = makeNoteService(notes, people);
  const schedule = makeScheduleService(scheduleRepo);
  const content = makeContentService(faqs, devotionals);
  const importSvc = makeImportService(people, churches);
  const exportSvc = makeExportService(people, churches);
  const churchImportSvc = makeChurchImportService(users, churches);
  const ticketImportSvc = makeTicketImportService(people, churches);
  const invoiceImportSvc = makeInvoiceImportService(people);
  const auditExportSvc = makeAuditExportService(people, notes, settingsRepo);
  const account = makeAccountService(users, churches, people);
  const dashboard = makeDashboardService(
    people,
    notifications,
    churches,
  );
  const admin = makeAdminService(
    users,
    churches,
    people,
    classrooms,
    allocations,
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
    exportService: exportSvc,
    churchImport: churchImportSvc,
    ticketImport: ticketImportSvc,
    invoiceImport: invoiceImportSvc,
    auditExport: auditExportSvc,
    account,
    dashboard,
    admin,
    users,
    settingsRepo,
  };

  return { repos, services };
}
