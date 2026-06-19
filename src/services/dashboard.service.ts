import type {
  IRegistrantRepository,
  ICamperRepository,
  IAccommodationRepository,
  INotificationRepository,
  IScheduleRepository,
  IChurchRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import { daysUntil, zonedNow } from '../utils/date';
import { computeLiveTaken } from './accommodation-occupancy';
import { canAccessCamper } from './access-control';

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
  registrantRepo: IRegistrantRepository,
  camperRepo: ICamperRepository,
  accommodationRepo: IAccommodationRepository,
  notifRepo: INotificationRepository,
  scheduleRepo: IScheduleRepository,
  churchRepo: IChurchRepository,
): DashboardService {
  return {
    async home(actor, settings) {
      if (settings.campMode === 'pre-camp') {
        // Pre-camp dashboard
        const allRegistrants = await registrantRepo.findAll();
        const scoped = allRegistrants.filter((r) => {
          if (r.status === 'cancelled') return false;
          if (actor.role === 'admin' || actor.role === 'director') return true;
          if (actor.role === 'zoneLeader') return actor.zone != null && r.zone === actor.zone;
          return r.churchId === actor.churchId;
        });

        const unpaidCount = scoped.filter((r) => r.paymentStatus === 'unpaid').length;
        const noBlueCardCount = scoped.filter((r) => r.kind === 'leader' && !r.blueCardCollected).length;

        // B1 FIX: accommodation summary now reflects assigned occupants, not just
        // baseTaken — via the shared occupancy module (accommodation-occupancy.ts).
        const blocks = await accommodationRepo.findAll();
        const takenByBlock = computeLiveTaken(blocks, allRegistrants);
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
          totalCampers: scoped.filter((r) => r.kind === 'camper').length,
          totalLeaders: scoped.filter((r) => r.kind === 'leader').length,
          unpaidCount,
          noBlueCardCount,
          accommodationSummary,
        };

        if (actor.role === 'admin' || actor.role === 'director') {
          const churches = await churchRepo.findAll();
          const breakdown = churches.map((ch) => {
            const churchRegs = scoped.filter((r) => r.churchId === ch.id);
            return {
              churchId: ch.id,
              churchName: ch.name,
              zone: ch.zone,
              registrants: churchRegs.length,
              unpaid: churchRegs.filter((r) => r.paymentStatus === 'unpaid').length,
              noBlueCard: churchRegs.filter((r) => r.kind === 'leader' && !r.blueCardCollected).length,
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
        const allCampers = (await camperRepo.findAll()).filter((c) => canAccessCamper(actor, c));
        const totalAtCamp = allCampers.filter((c) => c.atCamp).length;
        const totalExpected = allCampers.filter((c) => c.status !== 'cancelled').length;

        // Get check-in sessions for today. B3 FIX: today + now from the camp timezone.
        const { date: todayStr, time: nowTime } = zonedNow(settings.timezone || 'Australia/Brisbane');
        const checkInItems = await scheduleRepo.getCheckInPoints();
        const todaySessions = checkInItems.filter((i) => i.day === todayStr);
        // D1 FIX: the current session is the LAST session today that has already
        // started, not the first. todaySessions is ascending by startTime, so
        // .find() returned the earliest started one (e.g. AM at 8pm) — wrong, and it
        // disagreed with checkin.service. Walk from the end instead.
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
        const checkInsDue = currentSession
          ? allCampers.filter((c) => {
              if (c.status === 'cancelled') return false;
              const entries = c.checkInHistory.filter((e) => e.sessionId === currentSession.id);
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
            ? { id: currentSession.id, label: currentSession.title, day: currentSession.day, startTime: currentSession.startTime }
            : null,
          nextSession: nextSession
            ? { id: nextSession.id, label: nextSession.title, day: nextSession.day, startTime: nextSession.startTime }
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
