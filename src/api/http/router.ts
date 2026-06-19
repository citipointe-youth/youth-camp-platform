import type { Route } from './types';
import type { Services } from '../../container';
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
import { makeAccountController } from '../controllers/account.controller';
import { makeSettingsController } from '../controllers/settings.controller';
import { makeAdminController } from '../controllers/admin.controller';

export function buildRoutes(services: Services): Route[] {
  const auth = makeAuthController({ auth: services.auth, users: services.users });
  const dashboard = makeDashboardController({ dashboard: services.dashboard, settings: services.settings });
  const registrant = makeRegistrantController({ registrant: services.registrant });
  const accommodation = makeAccommodationController({ accommodation: services.accommodation });
  const camper = makeCamperController({ camper: services.camper });
  const checkIn = makeCheckInController({ checkIn: services.checkIn });
  const search = makeSearchController({ search: services.search });
  const notification = makeNotificationController({ notification: services.notification });
  const schedule = makeScheduleController({ schedule: services.schedule });
  const note = makeNoteController({ note: services.note });
  const attendance = makeAttendanceController({ attendance: services.attendance });
  const content = makeContentController({ content: services.content });
  const importCtrl = makeImportController({ importService: services.importService });
  const account = makeAccountController({ account: services.account });
  const settingsCtrl = makeSettingsController({ settings: services.settings });
  const admin = makeAdminController({ admin: services.admin });

  return [
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
    { method: 'GET', path: '/accommodation/blocks', auth: true, handler: (r) => accommodation.blocks(r) },
    { method: 'POST', path: '/accommodation/blocks', auth: true, handler: (r) => accommodation.createBlock(r) },
    { method: 'GET', path: '/accommodation/blocks/:id', auth: true, handler: (r) => accommodation.getBlock(r) },
    { method: 'PATCH', path: '/accommodation/blocks/:id', auth: true, handler: (r) => accommodation.updateBlock(r) },
    { method: 'DELETE', path: '/accommodation/blocks/:id', auth: true, handler: (r) => accommodation.deleteBlock(r) },
    { method: 'GET', path: '/accommodation/held/:churchId', auth: true, handler: (r) => accommodation.held(r) },
    { method: 'POST', path: '/accommodation/reservations', auth: true, handler: (r) => accommodation.setReservations(r) },

    // ----- Campers (at-camp / Portal) -----
    { method: 'GET', path: '/campers', auth: true, handler: (r) => camper.list(r) },
    { method: 'POST', path: '/campers', auth: true, handler: (r) => camper.create(r) },
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
