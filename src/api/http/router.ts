import type { Route, BufferRoute } from './types';
import type { Services } from '../../container';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../core/errors/app-error';
import { hashPassword } from '../../utils/crypto';
import { makeAuthController } from '../controllers/auth.controller';
import { makeDashboardController } from '../controllers/dashboard.controller';
import { makeRegistrantController } from '../controllers/registrant.controller';
import { makeAccommodationController } from '../controllers/accommodation.controller';
import { makeCamperController } from '../controllers/camper.controller';
import { makeCheckInController } from '../controllers/checkin.controller';
import { makeSearchController } from '../controllers/search.controller';
import { makeNotificationController } from '../controllers/notification.controller';
import { makeScheduleController } from '../controllers/schedule.controller';
import { makeNoteController } from '../controllers/note.controller';
import { makeAttendanceController } from '../controllers/attendance.controller';
import { makeContentController } from '../controllers/content.controller';
import { makeImportController } from '../controllers/import.controller';
import { makeChurchImportController } from '../controllers/church-import.controller';
import { makeAuditController } from '../controllers/audit.controller';
import { makeExportController } from '../controllers/export.controller';
import { makeAccountController } from '../controllers/account.controller';
import { makeSettingsController } from '../controllers/settings.controller';
import { makeAdminController } from '../controllers/admin.controller';

export function buildRoutes(services: Services): (Route | BufferRoute)[] {
  const auth = makeAuthController({ auth: services.auth, users: services.users });
  const dashboard = makeDashboardController({ dashboard: services.dashboard, settings: services.settings });
  const registrant = makeRegistrantController({ person: services.person });
  const accommodation = makeAccommodationController({ accommodation: services.accommodation });
  const camper = makeCamperController({ person: services.person });
  const checkIn = makeCheckInController({ checkIn: services.checkIn, person: services.person });
  const search = makeSearchController({ search: services.search });
  const notification = makeNotificationController({ notification: services.notification });
  const schedule = makeScheduleController({ schedule: services.schedule });
  const note = makeNoteController({ note: services.note });
  const attendance = makeAttendanceController({ person: services.person });
  const content = makeContentController({ content: services.content });
  const importCtrl = makeImportController({ importService: services.importService });
  const churchImportCtrl = makeChurchImportController({ churchImport: services.churchImport });
  const auditCtrl = makeAuditController({ auditExport: services.auditExport, settingsRepo: services.settingsRepo });
  const exportCtrl = makeExportController({ exportService: services.exportService });
  const account = makeAccountController({ account: services.account });
  const settingsCtrl = makeSettingsController({ settings: services.settings });
  const admin = makeAdminController({ admin: services.admin });

  return [
    // ----- First-run admin setup (permanently disabled once admin has a password) -----
    { method: 'POST', path: '/setup', auth: false, handler: async (req) => {
      const body = req.body as { username?: string; password?: string };
      if (!body.username || !body.password) throw new BadRequestError('username and password required');
      if (body.password.length < 8) throw new BadRequestError('Password must be at least 8 characters');
      const admins = await services.users.findByRole('admin');
      const admin = admins[0];
      if (!admin) throw new NotFoundError('No admin account found — run migrations first');
      if (admin.passwordHash) throw new ForbiddenError('Admin password already set');
      const hash = await hashPassword(body.password);
      await services.users.save({ ...admin, username: body.username, passwordHash: hash });
      return { ok: true };
    }},

    // ----- Auth -----
    { method: 'POST', path: '/auth/login', auth: false, handler: (r) => auth.login(r) },
    { method: 'GET', path: '/auth/me', auth: true, handler: (r) => auth.me(r) },
    { method: 'POST', path: '/auth/logout', auth: true, handler: (r) => auth.logout(r) },

    // ----- Dashboard / Home -----
    { method: 'GET', path: '/home', auth: true, handler: (r) => dashboard.home(r) },

    // ----- Settings -----
    { method: 'GET', path: '/settings', auth: false, handler: (r) => settingsCtrl.get(r) },
    { method: 'PATCH', path: '/settings', auth: true, handler: (r) => settingsCtrl.update(r) },

    // ----- Admin -----
    { method: 'POST', path: '/admin/mode', auth: true, handler: (r) => admin.setMode(r) },
    { method: 'POST', path: '/admin/reset', auth: true, handler: (r) => admin.reset(r) },
    { method: 'POST', path: '/admin/defaults', auth: true, handler: (r) => admin.saveDefaults(r) },
    { method: 'POST', path: '/admin/new-year', auth: true, handler: (r) => admin.newYear(r) },
    { method: 'DELETE', path: '/admin/notifications', auth: true, handler: (r) => admin.clearNotifications(r) },

    // ----- Registrants (pre-camp / Hub) -----
    { method: 'GET', path: '/registrants', auth: true, handler: (r) => registrant.list(r) },
    { method: 'POST', path: '/registrants', auth: true, handler: (r) => registrant.create(r) },
    { method: 'GET', path: '/registrants/chase', auth: true, handler: (r) => registrant.chase(r) },
    { method: 'GET', path: '/registrants/breakdown', auth: true, handler: (r) => registrant.breakdown(r) },
    { method: 'POST', path: '/registrants/remind', auth: true, handler: (r) => registrant.remind(r) },
    { method: 'GET', path: '/registrants/:id', auth: true, handler: (r) => registrant.get(r) },
    { method: 'PATCH', path: '/registrants/:id', auth: true, handler: (r) => registrant.update(r) },
    { method: 'DELETE', path: '/registrants/:id', auth: true, handler: (r) => registrant.remove(r) },

    // ----- Accommodation -----
    { method: 'GET', path: '/accommodation/classrooms', auth: true, handler: (r) => accommodation.classrooms(r) },
    { method: 'POST', path: '/accommodation/classrooms', auth: true, handler: (r) => accommodation.createClassroom(r) },
    { method: 'PATCH', path: '/accommodation/classrooms/:id', auth: true, handler: (r) => accommodation.updateClassroom(r) },
    { method: 'DELETE', path: '/accommodation/classrooms/:id', auth: true, handler: (r) => accommodation.deleteClassroom(r) },
    { method: 'GET', path: '/accommodation/groups', auth: true, handler: (r) => accommodation.groups(r) },
    { method: 'GET', path: '/accommodation/allocations', auth: true, handler: (r) => accommodation.allocations(r) },
    { method: 'PATCH', path: '/accommodation/allocations', auth: true, handler: (r) => accommodation.setAllocations(r) },
    { method: 'GET', path: '/accommodation/church-rooms/:churchId', auth: true, handler: (r) => accommodation.churchRooms(r) },

    // ----- Campers (at-camp / Portal) -----
    // NOTE: literal routes (/campers/medical) must be declared BEFORE parameterised (/campers/:id)
    { method: 'GET', path: '/campers', auth: true, handler: (r) => camper.list(r) },
    { method: 'GET', path: '/campers/medical', auth: true, handler: (r) => camper.getMedicalWatch(r) },
    { method: 'POST', path: '/campers/:id/reveal-medicare', auth: true, handler: (r) => camper.revealMedicare(r) },
    { method: 'GET', path: '/campers/:id', auth: true, handler: (r) => camper.get(r) },
    { method: 'PATCH', path: '/campers/:id', auth: true, handler: (r) => camper.update(r) },

    // ----- Check-in -----
    { method: 'GET', path: '/checkin/sessions', auth: true, handler: (r) => checkIn.sessions(r) },
    { method: 'GET', path: '/checkin/sessions/current', auth: true, handler: (r) => checkIn.currentSession(r) },
    { method: 'GET', path: '/checkin/sessions/:sessionId/status', auth: true, handler: (r) => checkIn.status(r) },
    { method: 'POST', path: '/checkin', auth: true, handler: (r) => checkIn.checkIn(r) },

    // ----- Attendance / Sign-out -----
    { method: 'POST', path: '/attendance/sign-out', auth: true, handler: (r) => attendance.signOut(r) },
    { method: 'POST', path: '/attendance/sign-in', auth: true, handler: (r) => attendance.signIn(r) },

    // ----- Notes -----
    { method: 'POST', path: '/notes', auth: true, handler: (r) => note.add(r) },
    { method: 'GET', path: '/notes/recent', auth: true, handler: (r) => note.recent(r) },
    { method: 'GET', path: '/notes/export', auth: true, handler: (r) => note.exportRows(r) },
    { method: 'GET', path: '/notes/camper/:camperId', auth: true, handler: (r) => note.forCamper(r) },

    // ----- Search -----
    { method: 'GET', path: '/search', auth: true, handler: (r) => search.search(r) },
    { method: 'GET', path: '/search/contact/:camperId/:role', auth: true, handler: (r) => search.revealContact(r) },

    // ----- Notifications -----
    { method: 'GET', path: '/notifications', auth: true, handler: (r) => notification.feed(r) },
    { method: 'GET', path: '/notifications/latest', auth: true, handler: (r) => notification.latest(r) },
    { method: 'POST', path: '/notifications', auth: true, handler: (r) => notification.send(r) },
    { method: 'DELETE', path: '/notifications/:id', auth: true, handler: (r) => notification.remove(r) },

    // ----- Schedule -----
    { method: 'GET', path: '/schedule', auth: true, handler: (r) => schedule.get(r) },
    { method: 'POST', path: '/schedule', auth: true, handler: (r) => schedule.create(r) },
    { method: 'PATCH', path: '/schedule/:id', auth: true, handler: (r) => schedule.update(r) },
    { method: 'DELETE', path: '/schedule/:id', auth: true, handler: (r) => schedule.remove(r) },

    // ----- Content: FAQ + Devotionals -----
    { method: 'GET', path: '/faq', auth: false, handler: (r) => content.faqList(r) },
    { method: 'POST', path: '/faq', auth: true, handler: (r) => content.faqCreate(r) },
    { method: 'PATCH', path: '/faq/:id', auth: true, handler: (r) => content.faqUpdate(r) },
    { method: 'DELETE', path: '/faq/:id', auth: true, handler: (r) => content.faqDelete(r) },
    { method: 'GET', path: '/devotional/:day', auth: true, handler: (r) => content.devotionalGet(r) },
    { method: 'POST', path: '/devotional', auth: true, handler: (r) => content.devotionalSet(r) },

    // ----- Import -----
    { method: 'POST', path: '/import/csv', auth: true, handler: (r) => importCtrl.run(r) },
    { method: 'POST', path: '/import/churches', auth: true, handler: (r) => churchImportCtrl.run(r) },
    { method: 'GET', path: '/export/registrants', auth: true, handler: (r) => exportCtrl.registrants(r) },

    // ----- Audit export (BufferRoute — xlsx and CSV downloads) -----
    {
      method: 'GET', path: '/export/audit', auth: true,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'camp-audit-export.xlsx',
      bufferHandler: (r) => auditCtrl.exportWorkbook(r),
    },
    {
      method: 'GET', path: '/export/signin-out', auth: true,
      contentType: 'text/csv; charset=utf-8',
      filename: 'sign-in-out-log.csv',
      bufferHandler: (r) => auditCtrl.exportSignInOutCsv(r),
    },

    // ----- Account management -----
    { method: 'GET', path: '/accounts/users', auth: true, handler: (r) => account.list(r) },
    { method: 'POST', path: '/accounts/users', auth: true, handler: (r) => account.create(r) },
    { method: 'PATCH', path: '/accounts/users/:id', auth: true, handler: (r) => account.update(r) },
    { method: 'POST', path: '/accounts/users/password', auth: true, handler: (r) => account.setPassword(r) },
    { method: 'DELETE', path: '/accounts/users/:id', auth: true, handler: (r) => account.deleteUser(r) },
    { method: 'GET', path: '/accounts/churches', auth: true, handler: (r) => account.listChurches(r) },
    { method: 'POST', path: '/accounts/churches', auth: true, handler: (r) => account.createChurch(r) },
    { method: 'PATCH', path: '/accounts/churches/:id', auth: true, handler: (r) => account.updateChurch(r) },
    { method: 'DELETE', path: '/accounts/churches/:id', auth: true, handler: (r) => account.deleteChurch(r) },
  ];
}
