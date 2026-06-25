import type { INoteRepository, IPersonRepository } from '../repositories/interfaces/entity-repositories';
import type { StudentNote } from '../core/entities/note';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { isCamper } from '../core/entities/person';
import { canAccessPerson } from './person.service';
import { NotFoundError } from '../core/errors/app-error';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { toCsvString } from '../utils/csv';
import { z } from 'zod';

const AddNoteSchema = z.object({
  // Optional: a testimony may be "general" (no specific student). Empty string is
  // treated as absent.
  camperId: z.string().optional(),
  body: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  category: z.string().max(40).optional(),
});

export interface NoteService {
  add(actor: Actor, input: unknown): Promise<StudentNote>;
  forCamper(actor: Actor, camperId: string): Promise<StudentNote[]>;
  recent(actor: Actor, limit?: number): Promise<StudentNote[]>;
  exportRows(actor: Actor): Promise<string>;
}

export function makeNoteService(
  noteRepo: INoteRepository,
  personRepo: IPersonRepository,
): NoteService {
  return {
    async add(actor, input) {
      assertCan(actor, 'note:write');
      const data = AddNoteSchema.parse(input);
      // A general testimony has no student; only validate/scope when one is given.
      const camperId = data.camperId && data.camperId.length > 0 ? data.camperId : null;
      if (camperId) {
        const camper = await personRepo.findById(camperId);
        if (!camper || !isCamper(camper)) throw new NotFoundError('Camper not found');
        if (!canAccessPerson(actor, camper)) throw new NotFoundError('Camper not found');
      }

      const note: StudentNote = {
        id: newId('note'),
        camperId,
        body: data.body,
        authorId: actor.id,
        authorName: actor.displayName,
        authorChurchId: actor.churchId,
        sessionId: data.sessionId ?? null,
        category: data.category ?? 'note',
        createdAt: nowISO(),
      };
      return noteRepo.save(note);
    },

    async forCamper(actor, camperId) {
      assertCan(actor, 'note:write');
      const camper = await personRepo.findById(camperId);
      if (!camper || !isCamper(camper)) throw new NotFoundError('Camper not found');
      if (!canAccessPerson(actor, camper)) throw new NotFoundError('Camper not found');
      return noteRepo.findByCamper(camperId);
    },

    async recent(actor, limit = 20) {
      assertCan(actor, 'note:read');
      const notes = await noteRepo.findRecent(limit * 3); // fetch more, then filter
      const result: StudentNote[] = [];
      for (const note of notes) {
        if (note.camperId) {
          const camper = await personRepo.findById(note.camperId);
          if (!camper || !isCamper(camper)) continue;
          if (!canAccessPerson(actor, camper)) continue;
        }
        // General (camper-less) testimonies have no church to scope to — visible to
        // anyone with note:read (zoneLeader/director/admin).
        result.push(note);
        if (result.length >= limit) break;
      }
      return result;
    },

    async exportRows(actor) {
      assertCan(actor, 'note:read');
      const notes = await noteRepo.findAll();
      const headers = ['Time', 'Student', 'Logged by', 'Church', 'Gender', 'Grade', 'Category', 'Note'];
      const rows: string[][] = [];
      for (const note of notes) {
        let camper = null;
        if (note.camperId) {
          camper = await personRepo.findById(note.camperId);
          if (!camper || !isCamper(camper)) continue;
          if (!canAccessPerson(actor, camper)) continue;
        }
        rows.push([
          note.createdAt,
          camper ? `${camper.firstName} ${camper.lastName}` : 'No specific student',
          note.authorName,
          camper?.churchName ?? '',
          camper?.gender ?? '',
          camper?.grade != null ? String(camper.grade) : '',
          note.category ?? 'note',
          note.body,
        ]);
      }
      return toCsvString(headers, rows);
    },
  };
}
