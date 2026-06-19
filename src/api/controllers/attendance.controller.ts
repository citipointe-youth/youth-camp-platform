import type { HttpRequest } from '../http/types';
import type { AttendanceService } from '../../services/attendance.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface AttendanceControllerServices {
  attendance: AttendanceService;
}

export function makeAttendanceController(services: AttendanceControllerServices) {
  return {
    async signOut(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.attendance.signOut(req.ctx.actor, req.body);
    },

    async signIn(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.attendance.signIn(req.ctx.actor, req.body);
    },
  };
}
