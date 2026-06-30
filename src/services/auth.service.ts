import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from '../utils/crypto';
import type { IUserRepository } from '../repositories/interfaces/entity-repositories';
import type { Actor, User, SafeUser } from '../core/entities/user';
import type { ZoneName } from '../core/types/enums';
import { UnauthorizedError } from '../core/errors/app-error';
import { LoginInputSchema } from '../core/validation/auth.schema';
import type { LoginInput } from '../core/validation/auth.schema';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Stateless HMAC-signed sessions (replaces the old in-memory token Map, which was
// fatal on serverless / multi-instance hosting: each cold start began with an empty
// Map, logging every user out, and a token minted on instance A was unknown to
// instance B). The signed token carries the full actor so authenticated requests
// need no DB lookup; the HMAC guarantees it wasn't tampered with. Trade-off: a
// role/zone change only takes effect on the user's next login (within the 12h TTL).
const INSECURE_FALLBACK = 'camp-platform-dev-secret-change-in-production';
const SESSION_SECRET = process.env['SESSION_SECRET'] ?? INSECURE_FALLBACK;

if (process.env['NODE_ENV'] === 'production' && SESSION_SECRET === INSECURE_FALLBACK) {
  // eslint-disable-next-line no-console
  console.error(
    '[SECURITY] SESSION_SECRET env var is not set. Session tokens can be forged. ' +
    'Set SESSION_SECRET in your deployment environment immediately.',
  );
}

/**
 * B-2 (Phase 5): fail-fast on an insecure production secret. Called from the single
 * composition path `createAppInstance()` so a misconfigured deploy refuses to start
 * (server → exit 1; serverless → cold-start init rejects → 500) instead of serving with
 * forgeable tokens. No-op outside production, and a no-op when a real secret is set — so a
 * correct deploy (which already sets SESSION_SECRET) is unaffected. Re-reads the env at call
 * time so tests can set/unset it around startup.
 */
export function assertSessionSecret(): void {
  if (process.env['NODE_ENV'] !== 'production') return;
  const secret = process.env['SESSION_SECRET'];
  if (!secret || secret === INSECURE_FALLBACK) {
    throw new Error(
      '[SECURITY] Refusing to start: SESSION_SECRET is not set (or equals the insecure dev fallback) ' +
      'in production. Session tokens would be forgeable. Set a 32+ byte SESSION_SECRET and redeploy.',
    );
  }
}

function signSession(actor: Actor, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ userId: actor.id, expiresAt, actor })).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseSession(token: string): { userId: string; expiresAt: number; actor?: Actor } | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; expiresAt: number; actor?: Actor };
  } catch {
    return null;
  }
}

export function toActor(user: User): Actor {
  return {
    id: user.id,
    role: user.role,
    churchId: user.churchId ?? null,
    churchName: user.churchName ?? null,
    zone: (user.zone ?? null) as ZoneName | null,
    displayName: `${user.firstName} ${user.lastName}`,
  };
}

export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _pw, ...safe } = user;
  return safe as SafeUser;
}

export interface AuthService {
  login(input: unknown): Promise<{ token: string; user: SafeUser }>;
  resolveToken(token: string): Promise<Actor | null>;
  logout(token: string): Promise<void>;
}

export function makeAuthService(users: IUserRepository): AuthService {
  return {
    async login(input: unknown) {
      const parsed = LoginInputSchema.safeParse(input);
      if (!parsed.success) throw new UnauthorizedError('Invalid credentials');

      const { username, password } = parsed.data as LoginInput;
      const user = await users.findByUsername(username);
      if (!user || user.status !== 'active') throw new UnauthorizedError('Invalid credentials');
      if (!user.passwordHash) throw new UnauthorizedError('Account has no password set');

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Invalid credentials');

      const token = signSession(toActor(user), Date.now() + TOKEN_TTL_MS);
      return { token, user: toSafeUser(user) };
    },

    async resolveToken(token: string) {
      const session = parseSession(token);
      if (!session) return null;
      if (Date.now() > session.expiresAt) return null;
      // Trusted actor embedded in the signed token — no DB round-trip needed.
      if (session.actor) return session.actor;
      // Legacy token without an embedded actor: fall back to a lookup.
      const user = await users.findById(session.userId);
      if (!user || user.status !== 'active') return null;
      return toActor(user);
    },

    async logout(_token: string) {
      // Stateless tokens — logout is handled client-side by discarding the token.
    },
  };
}
