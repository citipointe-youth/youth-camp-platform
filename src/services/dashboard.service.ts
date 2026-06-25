import type {
  IPersonRepository,
  IAccommodationRepository,
  INotificationRepository,
  IChurchRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import { daysUntil, zonedNow } from '../utils/date';
import { buildSessions } from './checkin-sessions';
import { computeLiveTaken } from './accommodation-occupancy';
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
  unpaidCount: number;
  noBlueCardCount: number;
  accommodationSummary: Array<{
    blockId: string;
    blockName: string;
    kind: string;
    capacity: number;
    taken: number;
    available: number;
  }>;
  perChurchBreakdown?: Array<{
    churchId: string;
    churchName: string;
    zone: string;
    registrants: number;
    unpaid: number;
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
  accommodationRepo: IAccommodationRepository,
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

        const unpaidCount = scoped.filter((p) => p.paymentStatus === 'unpaid').length;
        const noBlueCardCount = scoped.filter((p) => p.kind === 'leader' && p.blueCardNumber == null).length;

        // B1 FIX: accommodation summary now reflects assigned occupants, not just
        // baseTaken — via the shared occupancy module (accommodation-occupancy.ts).
        const blocks = await accommodationRepo.findAll();
        const takenByBlock = computeLiveTaken(blocks, allPersons);
        const accommodationSummary = blocks.map((b) => {
          const taken = takenByBlock.get(b.id) ?? b.baseTaken;
          return {
            blockId: b.id,
            blockName: b.name,
            kind: b.kind,
            capacity: b.capacity,
            taken,
            available: b.capacity - taken,
          };
        });

        const dashboard: PreCampDashboard = {
          mode: 'pre-camp',
          campName: settings.campName,
          year: settings.year,
          startDate: settings.startDate,
          daysToGo: daysUntil(settings.startDate, settings.timezone),
          totalRegistrants: scoped.length,
          totalCampers: scoped.filter((p) => p.kind === 'youth').length,
          totalLeaders: scoped.filter((p) => p.kind === 'leader').length,
          unpaidCount,
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
              unpaid: churchRegs.filter((p) => p.paymentStatus === 'unpaid').length,
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
        const todaySessions = buildSessions(settings.checkInDays ?? []).filter((s) => s.day === todayStr);
        // Current session = the LAST session today that has already started (matches
        // checkin.service). Null before the morning session begins.
        const currentSession = [...todaySessions].reverse().find((s) => s.startTime <= nowTime) ?? null;
        const nextSession = todaySessions.find((s) => s.startTime > nowTime) ?? null;

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
