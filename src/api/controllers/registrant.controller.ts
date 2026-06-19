import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import type { Person } from '../../core/entities/person';
import { toRegistrantDto } from '../dto/person.dto';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface RegistrantControllerServices {
  person: PersonService;
}

export function makeRegistrantController(services: RegistrantControllerServices) {
  const { person } = services;

  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.query['churchId'];
      return (await person.listRegistrants(req.ctx.actor, churchId)).map(toRegistrantDto);
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return toRegistrantDto(await person.get(req.ctx.actor, id));
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as Record<string, unknown>;
      const p = await person.create(req.ctx.actor, {
        firstName: b['firstName'] as string,
        lastName: b['lastName'] as string,
        gender: b['gender'] as Person['gender'],
        kind: b['kind'] === 'leader' ? 'leader' : 'youth',
        grade: (b['grade'] as Person['grade']) ?? null,
        churchId: b['churchId'] as string,
        churchName: b['churchName'] as string,
        zone: b['zone'] as string,
        paymentStatus: (b['paymentStatus'] as Person['paymentStatus']) ?? 'unpaid',
        accommodationKind: (b['accommodationKind'] as Person['accommodationKind']) ?? null,
        accommodationLabel: (b['accommodationLabel'] as string) ?? null,
        parentGuardianName: ((b['parentGuardianName'] ?? b['parentName']) as string) ?? null,
        parentPhone: (b['parentPhone'] as string) ?? null,
        mobile: (b['mobile'] as string) ?? null,
      });
      return toRegistrantDto(p);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const b = req.body as Record<string, unknown>;

      // Map blueCardCollected boolean ↔ blueCardNumber string.
      // If blueCardNumber is provided directly, it takes precedence.
      let blueCardNumber: string | null | undefined;
      if ('blueCardNumber' in b) {
        blueCardNumber = (b['blueCardNumber'] as string | null) ?? null;
      } else if ('blueCardCollected' in b) {
        const existing = await person.get(req.ctx.actor, id);
        blueCardNumber = b['blueCardCollected']
          ? (existing.blueCardNumber ?? 'collected')
          : null;
      }

      const patch: Partial<Person> = {
        ...(b['firstName'] !== undefined && { firstName: b['firstName'] as string }),
        ...(b['lastName'] !== undefined && { lastName: b['lastName'] as string }),
        ...(b['gender'] !== undefined && { gender: b['gender'] as Person['gender'] }),
        ...(b['kind'] !== undefined && { kind: b['kind'] === 'leader' ? 'leader' : 'youth' }),
        ...(b['grade'] !== undefined && { grade: b['grade'] as Person['grade'] }),
        ...(b['paymentStatus'] !== undefined && { paymentStatus: b['paymentStatus'] as Person['paymentStatus'] }),
        ...(b['accommodationKind'] !== undefined && { accommodationKind: b['accommodationKind'] as Person['accommodationKind'] }),
        ...(b['accommodationLabel'] !== undefined && { accommodationLabel: b['accommodationLabel'] as string }),
        ...(b['mobile'] !== undefined && { mobile: b['mobile'] as string }),
        ...((b['parentGuardianName'] !== undefined || b['parentName'] !== undefined) && {
          parentGuardianName: ((b['parentGuardianName'] ?? b['parentName']) as string) ?? null,
        }),
        ...(b['parentPhone'] !== undefined && { parentPhone: b['parentPhone'] as string }),
        ...(b['blueCardExpiry'] !== undefined && { blueCardExpiry: b['blueCardExpiry'] as string }),
        // Map dietary/medical strings to arrays (legacy Registrant shape)
        ...(b['dietary'] !== undefined && {
          dietaryRequirements: b['dietary'] ? [b['dietary'] as string] : [],
        }),
        ...(b['medical'] !== undefined && {
          medicalConditions: b['medical'] ? [b['medical'] as string] : [],
        }),
        // Map status → lifecycle
        ...(b['status'] !== undefined && {
          lifecycle: b['status'] === 'cancelled' ? 'cancelled' : 'registered',
        }),
        ...(blueCardNumber !== undefined && { blueCardNumber }),
      };

      return toRegistrantDto(await person.update(req.ctx.actor, id, patch));
    },

    async remove(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await person.remove(req.ctx.actor, id);
      return { ok: true };
    },

    async chase(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return person.chase(req.ctx.actor);
    },

    async breakdown(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return person.breakdown(req.ctx.actor);
    },

    async remind(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const body = req.body as { ids?: string[] };
      return person.remind(req.ctx.actor, body.ids ?? []);
    },
  };
}
