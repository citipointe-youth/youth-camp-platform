import ExcelJS from 'exceljs';
import type { IPersonRepository, INoteRepository, ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { toCsvString } from '../utils/csv';
import { isCamper } from '../core/entities/person';
import { nowISO } from '../utils/date';

export interface AuditExportService {
  exportMasterWorkbook(actor: Actor): Promise<Buffer>;
  exportSignInOutCsv(actor: Actor): Promise<string>;
  exportCheckInLogCsv(actor: Actor): Promise<string>;
}

function toLocalTs(isoTs: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(new Date(isoTs));
  } catch {
    return isoTs;
  }
}

export function makeAuditExportService(
  personRepo: IPersonRepository,
  noteRepo: INoteRepository,
  settingsRepo: ISettingsRepository,
): AuditExportService {
  async function getAllData() {
    const settings = await settingsRepo.getSingleton();
    const tz = settings?.timezone || 'Australia/Brisbane';
    const people = await personRepo.findAll();
    const notes = await noteRepo.findAll();
    return { settings, tz, people, notes };
  }

  return {
    async exportMasterWorkbook(actor) {
      assertCan(actor, 'camper:read:sensitive');

      const { settings, tz, people, notes } = await getAllData();
      const wb = new ExcelJS.Workbook();

      // ----- Summary -----
      const summary = wb.addWorksheet('Summary');
      summary.addRow(['Youth Camp Audit Export']);
      summary.getRow(1).font = { bold: true, size: 14 };
      summary.addRow(['Camp', settings?.campName || '']);
      summary.addRow(['Year', settings?.year || '']);
      summary.addRow(['Exported at', toLocalTs(nowISO(), tz)]);
      summary.addRow(['Exported by', actor.displayName]);
      summary.columns = [{ width: 20 }, { width: 40 }];

      // ----- Attendees -----
      const attendees = wb.addWorksheet('Attendees');
      attendees.addRow(['First Name', 'Last Name', 'Kind', 'Church', 'Zone', 'Grade', 'Gender', 'Lifecycle', 'At Camp']);
      attendees.getRow(1).font = { bold: true };
      for (const p of people) {
        if (!isCamper(p)) continue;
        attendees.addRow([
          p.firstName, p.lastName,
          p.kind === 'leader' ? 'Leader' : 'Student',
          p.churchName, p.zone,
          p.grade ?? '',
          p.gender,
          p.lifecycle,
          p.atCamp ? 'Yes' : 'No',
        ]);
      }

      // ----- Sign-in/Sign-out Log (compliance centrepiece) -----
      const signLog = wb.addWorksheet('Sign-in/Sign-out Log');
      signLog.addRow([
        'Student', 'Church', 'Zone', 'Gender', 'Grade',
        'Event Type', 'Timestamp (local)', 'Reason', 'Parents Met', 'Authorised By',
      ]);
      signLog.getRow(1).font = { bold: true };

      // Include "Registered — Did Not Attend" rows for zero-history registrants
      for (const p of people) {
        if (p.lifecycle === 'registered' && p.signOutHistory.length === 0) {
          signLog.addRow([
            `${p.firstName} ${p.lastName}`, p.churchName, p.zone, p.gender, p.grade ?? '',
            'Registered — Did Not Attend', '', '', '', '',
          ]);
        }
        for (const ev of p.signOutHistory) {
          signLog.addRow([
            `${p.firstName} ${p.lastName}`, p.churchName, p.zone, p.gender, p.grade ?? '',
            ev.type === 'in' ? 'Sign-in (returned)' : 'Sign-out',
            toLocalTs(ev.timestamp, tz),
            ev.reason || '',
            ev.parentsMet ? 'Yes' : '',
            ev.authorId,
          ]);
        }
      }

      // ----- Daily Check-in Log -----
      const checkinLog = wb.addWorksheet('Daily Check-in Log');
      checkinLog.addRow(['Student', 'Church', 'Zone', 'Session', 'Type', 'Timestamp (local)', 'Leader']);
      checkinLog.getRow(1).font = { bold: true };
      for (const p of people) {
        for (const ci of p.checkInHistory) {
          checkinLog.addRow([
            `${p.firstName} ${p.lastName}`, p.churchName, p.zone,
            ci.sessionLabel, ci.type === 'in' ? 'Check-in' : 'Check-out',
            toLocalTs(ci.timestamp, tz),
            ci.leaderId,
          ]);
        }
      }

      // ----- Notes & Testimonies -----
      const notesSheet = wb.addWorksheet('Notes & Testimonies');
      notesSheet.addRow(['Student', 'Church', 'Zone', 'Category', 'Note', 'Session', 'Created At']);
      notesSheet.getRow(1).font = { bold: true };
      const personMap = new Map(people.map((p) => [p.id, p]));
      for (const note of notes) {
        const p = personMap.get(note.camperId);
        notesSheet.addRow([
          p ? `${p.firstName} ${p.lastName}` : note.camperId,
          p?.churchName || '',
          p?.zone || '',
          note.category || 'note',
          note.body,
          note.sessionId || '',
          toLocalTs(note.createdAt, tz),
        ]);
      }

      // ----- Passwords tab (if lastTempPasswords is set) -----
      const temps = settings?.lastTempPasswords;
      if (temps && temps.length > 0) {
        const pwSheet = wb.addWorksheet('Temp Passwords');
        pwSheet.addRow(['Username', 'Temp Password']);
        pwSheet.getRow(1).font = { bold: true };
        for (const t of temps) {
          pwSheet.addRow([t.username, t.tempPassword]);
        }
        // Clear lastTempPasswords after including in export
        await settingsRepo.saveSingleton({
          ...settings!,
          lastTempPasswords: null,
          updatedAt: nowISO(),
        });
      }

      const buffer = await wb.xlsx.writeBuffer();
      return Buffer.from(buffer);
    },

    async exportSignInOutCsv(actor) {
      assertCan(actor, 'camper:read');
      const { tz, people } = await getAllData();
      const rows: string[][] = [];
      for (const p of people) {
        if (p.lifecycle === 'registered' && p.signOutHistory.length === 0) {
          rows.push([
            p.firstName, p.lastName, p.churchName, p.zone, p.gender, String(p.grade ?? ''),
            'Registered — Did Not Attend', '', '', '', '',
          ]);
        }
        for (const ev of p.signOutHistory) {
          rows.push([
            p.firstName, p.lastName, p.churchName, p.zone, p.gender, String(p.grade ?? ''),
            ev.type === 'in' ? 'Sign-in (returned)' : 'Sign-out',
            toLocalTs(ev.timestamp, tz),
            ev.reason || '',
            ev.parentsMet ? 'Yes' : '',
            ev.authorId,
          ]);
        }
      }
      return toCsvString(
        ['First Name', 'Last Name', 'Church', 'Zone', 'Gender', 'Grade',
          'Event Type', 'Timestamp (local)', 'Reason', 'Parents Met', 'Authorised By'],
        rows,
      );
    },

    async exportCheckInLogCsv(actor) {
      assertCan(actor, 'camper:read');
      const { tz, people } = await getAllData();
      const rows: string[][] = [];
      for (const p of people) {
        for (const ci of p.checkInHistory) {
          rows.push([
            p.firstName, p.lastName, p.churchName, p.zone,
            ci.sessionLabel, ci.type === 'in' ? 'Check-in' : 'Check-out',
            toLocalTs(ci.timestamp, tz), ci.leaderId,
          ]);
        }
      }
      return toCsvString(
        ['First Name', 'Last Name', 'Church', 'Zone', 'Session', 'Type', 'Timestamp (local)', 'Leader ID'],
        rows,
      );
    },
  };
}
