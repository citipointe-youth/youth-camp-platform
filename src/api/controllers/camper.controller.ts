import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import type { Person } from '../../core/entities/person';
import { toCamperDto } from '../dto/person.dto';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';
import { assertCan } from '../../services/access-control';

export interface CamperControllerServices {
  person: PersonService;
}

export function makeCamperController(services: CamperControllerServices) {
  const { person } = services;

  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const people = await person.listCampers(req.ctx.actor, {
        zone: req.query['zone'],
        churchId: req.query['churchId'],
        q: req.query['q'],
      });
      return people.map(toCamperDto);
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const profile = await person.getProfile(req.ctx.actor, id);
      return { ...toCamperDto(profile), age: profile.age, lastSignOut: profile.lastSignOut };
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const b = req.body as Record<string, unknown>;
      const patch: Partial<Person> = {
        ...(b['mobile'] !== undefined && { mobile: b['mobile'] as string }),
        ...(b['groupId'] !== undefined && { groupId: b['groupId'] as string }),
        ...(b['medicalConditions'] !== undefined && { medicalConditions: b['medicalConditions'] as string[] }),
        ...(b['dietaryRequirements'] !== undefined && { dietaryRequirements: b['dietaryRequirements'] as string[] }),
        ...(b['blueCardNumber'] !== undefined && { blueCardNumber: b['blueCardNumber'] as string }),
        ...(b['blueCardExpiry'] !== undefined && { blueCardExpiry: b['blueCardExpiry'] as string }),
      };
      return toCamperDto(await person.update(req.ctx.actor, id, patch));
    },

    async getMedicalWatch(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      assertCan(req.ctx.actor, 'camper:read:sensitive');
      const people = await person.listMedicalWatch(req.ctx.actor);
      return people.map(toCamperDto);
    },

    async revealMedicare(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      assertCan(req.ctx.actor, 'camper:read:sensitive');
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      // Access is logged by assertCan succeeding for camper:read:sensitive.
      // A 204 response confirms the reveal was authorised — the client already has the
      // medicare number from the CamperDto; this endpoint creates the audit trail.
      return null;
    },
  };
}
