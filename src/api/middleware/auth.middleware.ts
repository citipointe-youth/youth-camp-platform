import type { RequestContext } from '../http/types';
import type { AuthService } from '../../services/auth.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return null;
  return parts[1] ?? null;
}

export async function resolveContext(
  authHeader: string | undefined,
  authService: AuthService,
  required: boolean,
): Promise<RequestContext | null> {
  const token = extractBearerToken(authHeader);
  if (!token) {
    if (required) throw new UnauthorizedError('Missing bearer token');
    return null;
  }
  const actor = await authService.resolveToken(token);
  if (!actor) {
    if (required) throw new UnauthorizedError('Invalid or expired token');
    return null;
  }
  return { actor, token };
}
