import type { INoteRepository, ICamperRepository } from '../repositories/interfaces/entity-repositories';
import type { StudentNote } from '../core/entities/note';
import type { Actor } from '../core/entities/user';
import { assertCan, canAccessCamper } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { toCsvString } from '../utils/csv';
import { z } from 'zod';

const AddNoteSchema = z.object({
  camperId: z.string().min(1),
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
  camperRepo: ICamperRepository,
): NoteService {
  return {
    async add(actor, input) {
      assertCan(actor, 'note:write');
      const data = AddNoteSchema.parse(input);
      const camper = await camperRepo.findById(data.camperId);
      if (!camper) throw new NotFoundError('Camper not found');
      if (!canAccessCamper(actor, camper)) throw new NotFoundError('Camper not found');

      const note: StudentNote = {
        id: newId('note'),
        camperId: data.camperId,
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
      const camper = await camperRepo.findById(camperId);
      if (!camper) throw new NotFoundError('Camper not found');
      if (!canAccessCamper(actor, camper)) throw new NotFoundError('Camper not found');
      return noteRepo.findByCamper(camperId);
    },

    async recent(actor, limit = 20) {
      assertCan(actor, 'note:read');
      const notes = await noteRepo.findRecent(limit * 3); // fetch more, then filter
      const result: StudentNote[] = [];
      for (const note of notes) {
        const camper = await camperRepo.findById(note.camperId);
        if (!camper) continue;
        if (!canAccessCamper(actor, camper)) continue;
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
        const camper = await camperRepo.findById(note.camperId);
        if (!camper) continue;
        if (!canAccessCamper(actor, camper)) continue;
        rows.push([
          note.createdAt,
          `${camper.firstName} ${camper.lastName}`,
          note.authorName,
          camper.churchName,
          camper.gender,
          camper.grade != null ? String(camper.grade) : '',
          note.category ?? 'note',
          note.body,
        ]);
      }
      return toCsvString(headers, rows);
    },
  };
}
