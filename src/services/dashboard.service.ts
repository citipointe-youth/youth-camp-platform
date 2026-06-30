import type {
  IPersonRepository,
  INotificationRepository,
  IChurchRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import { daysUntil, zonedNow } from '../utils/date';
import { buildSessions, currentSession as pickCurrentSession } from './checkin-sessions';
import { isRegistrant, isCamper } from '../core/entities/person';
import { canAccessPerson } from './person.service';

export interface PreCampDashboard {
  mode: 'pre-camp';
  campName: string;
  year: number;
  startDate: string;
  daysToGo: number;
  totalRegistrants: number;
  totalCampers: number;
  totalLeaders: number;
  // PC-3: "unpaid" is not an app concept. All uploaded registrations are confirmed;
  // payment is surfaced only in Budget. No unpaid count on the home DTO.
  noBlueCardCount: number;
  accommodationSummary: Array<{
    kind: string;
    label: string;
    campers: number;
  }>;
  perChurchBreakdown?: Array<{
    churchId: string;
    churchName: string;
    zone: string;
    registrants: number;
    noBlueCard: number;
  }>;
}

export interface AtCampDashboard {
  mode: 'at-camp';
  campName: string;
  greetingName: string;
  totalAtCamp: number;
  totalExpected: number;
  checkInsDue: number;
  currentSession: { id: string; label: string; day: string; startTime: string } | null;
  nextSession: { id: string; label: string; day: string; startTime: string } | null;
  latestNotification: { title: string; body: string; priority: string; createdAt: string } | null;
}

export type DashboardResult = PreCampDashboard | AtCampDashboard;

export interface DashboardService {
  home(actor: Actor, settings: CampSettings): Promise<DashboardResult>;
}

export function makeDashboardService(
  personRepo: IPersonRepository,
  notifRepo: INotificationRepository,
  churchRepo: IChurchRepository,
): DashboardService {
  return {
    async home(actor, settings) {
      if (settings.campMode === 'pre-camp') {
        // Pre-camp dashboard
        const allPersons = await personRepo.findAll();
        const scoped = allPersons.filter((p) => {
          if (!isRegistrant(p)) return false;
          if (actor.role === 'admin' || actor.role === 'director') return true;
          if (actor.role === 'zoneLeader') return actor.zone != null && p.zone === actor.zone;
          return p.churchId === actor.churchId;
        });

        const noBlueCardCount = scoped.filter((p) => p.kind === 'leader' && p.blueCardNumber == null).length;

        // Head counts by accommodation kind (blocks removed; capacity is no longer
        // modelled — tents auto-distribute, classrooms are allocated by room).
        const tentN = scoped.filter((p) => p.accommodationKind === 'tent').length;
        const classroomN = scoped.filter((p) => p.accommodationKind === 'classroom').length;
        const accommodationSummary = [
          { kind: 'tent', label: 'Tent City', campers: tentN },
          { kind: 'classroom', label: 'Classrooms', campers: classroomN },
        ];

        const dashboard: PreCampDashboard = {
          mode: 'pre-camp',
          campName: settings.campName,
          year: settings.year,
          startDate: settings.startDate,
          daysToGo: daysUntil(settings.startDate, settings.timezone),
          totalRegistrants: scoped.length,
          totalCampers: scoped.filter((p) => p.kind === 'youth').length,
          totalLeaders: scoped.filter((p) => p.kind === 'leader').length,
          noBlueCardCount,
          accommodationSummary,
        };

        if (actor.role === 'admin' || actor.role === 'director') {
          const churches = await churchRepo.findAll();
          const breakdown = churches.map((ch) => {
            const churchRegs = scoped.filter((p) => p.churchId === ch.id);
            return {
              churchId: ch.id,
              churchName: ch.name,
              zone: ch.zone,
              registrants: churchRegs.length,
              noBlueCard: churchRegs.filter((p) => p.kind === 'leader' && p.blueCardNumber == null).length,
            };
          });
          dashboard.perChurchBreakdown = breakdown;
        }

        return dashboard;
      } else {
        // At-camp dashboard.
        // D2 FIX: scope every at-camp number to the actor (church → own church,
        // zoneLeader → own zone, director/admin → all). Previously totalExpected /
        // checkInsDue counted the WHOLE camp for every role, so a church login saw
        // camp-wide figures presented as its own.
        const allPersons = await personRepo.findAll();
        const allCampers = allPersons.filter((p) => isCamper(p) && canAccessPerson(actor, p));
        const totalAtCamp = allCampers.filter((p) => p.atCamp).length;
        const totalExpected = allCampers.length; // isCamper already excludes cancelled

        // Check-in sessions are derived from the camp's check-in days (settings), not
        // the schedule — two per day (AM/PM). B3 FIX: today + now from the camp tz.
        const { date: todayStr, time: nowTime } = zonedNow(settings.timezone || 'Australia/Brisbane');
        const days = settings.checkInDays ?? [];
        const todaySessions = buildSessions(days).filter((s) => s.day === todayStr);
        // H-2 FIX: use the SHARED currentSession helper (AM before 12:00 / PM at-or-after),
        // exactly as checkin.service does — the bespoke `startTime <= now` calc here used the
        // PM startTime (13:00) and so disagreed with check-in for the whole 12:00–13:00 window
        // (dashboard counted "due" against AM while a leader tapping Check-in landed on PM).
        const current = pickCurrentSession(days, todayStr, nowTime);
        // Only treat it as today's current session if it actually falls today (the helper can
        // fall back to a past/future session when there are none today — the dashboard shows
        // no current/next session in that case, matching the prior null behaviour).
        const currentSession = current && current.day === todayStr ? current : null;
        // Next = the session after the current one in today's ordering (AM → PM; nothing after PM).
        const curIdx = currentSession ? todaySessions.findIndex((s) => s.id === currentSession.id) : -1;
        const nextSession = curIdx >= 0 ? todaySessions[curIdx + 1] ?? null : (todaySessions[0] ?? null);

        const notifications = await notifRepo.findActive();
        const relevantNotifs = notifications.filter((n) => {
          if (n.scope === 'camp') return true;
          if (n.scope === 'zone') return actor.zone != null && n.zone === actor.zone;
          if (n.scope === 'church') return actor.churchId != null && n.churchId === actor.churchId;
          return false;
        });
        const latestNotif = relevantNotifs[0] ?? null;

        // D3 FIX: "due" is measured against the CURRENT session specifically, and
        // respects check-OUT. A camper is due if their latest entry for the current
        // session is not an 'in' (i.e. never checked in, or has since checked out).
        // Previously any 'in' for ANY of today's sessions marked them done for the
        // whole day — wrong for a twice-daily camp.
        // Only count persons physically at camp (atCamp===true) — isCamper() includes
        // 'departed' lifecycle which has atCamp:false and must not inflate this count.
        const atCampNow = allCampers.filter((p) => p.atCamp);
        const checkInsDue = currentSession
          ? atCampNow.filter((p) => {
              const entries = p.checkInHistory.filter((e) => e.sessionId === currentSession.id);
              const last = entries[entries.length - 1];
              return last?.type !== 'in';
            }).length
          : 0;

        const dashboard: AtCampDashboard = {
          mode: 'at-camp',
          campName: settings.campName,
          greetingName: actor.displayName.split(' ')[0] ?? actor.displayName,
          totalAtCamp,
          totalExpected,
          checkInsDue,
          currentSession: currentSession
            ? { id: currentSession.id, label: currentSession.label, day: currentSession.day, startTime: currentSession.startTime }
            : null,
          nextSession: nextSession
            ? { id: nextSession.id, label: nextSession.label, day: nextSession.day, startTime: nextSession.startTime }
            : null,
          latestNotification: latestNotif
            ? { title: latestNotif.title, body: latestNotif.body, priority: latestNotif.priority, createdAt: latestNotif.createdAt }
            : null,
        };

        return dashboard;
      }
    },
  };
}
