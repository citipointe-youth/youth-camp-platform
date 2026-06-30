import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeAuthService, toActor, assertSessionSecret } from './auth.service';
import { InMemoryUserRepository } from '../repositories/in-memory';
import { hashPassword } from '../utils/crypto';
import type { User } from '../core/entities/user';
import { UnauthorizedError } from '../core/errors/app-error';

async function seedUser(repo: InMemoryUserRepository, over: Partial<User> = {}): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: 'u1',
    firstName: 'Ada',
    lastName: 'Admin',
    username: 'admin',
    role: 'admin',
    churchId: null,
    churchName: null,
    zone: null,
    status: 'active',
    passwordHash: await hashPassword('demo1234'),
    createdAt: now,
    updatedAt: now,
    ...over,
  };
  await repo.save(user);
  return user;
}

describe('AuthService.login', () => {
  let repo: InMemoryUserRepository;
  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    await repo.init();
  });

  it('issues a signed stateless token for valid credentials and never returns the password hash', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    const res = await svc.login({ username: 'admin', password: 'demo1234' });
    // Stateless HMAC session: "<base64url payload>.<base64url sig>" (was a 64-hex
    // opaque token backed by an in-memory Map).
    expect(res.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(res.user.username).toBe('admin');
    expect((res.user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('is case-insensitive on username', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    const res = await svc.login({ username: 'ADMIN', password: 'demo1234' });
    expect(res.token).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    await expect(svc.login({ username: 'admin', password: 'nope' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects inactive accounts', async () => {
    await seedUser(repo, { status: 'inactive' });
    const svc = makeAuthService(repo);
    await expect(
      svc.login({ username: 'admin', password: 'demo1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects malformed input without throwing a non-auth error', async () => {
    const svc = makeAuthService(repo);
    await expect(svc.login({ username: '' })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthService token lifecycle (stateless HMAC sessions)', () => {
  it('resolveToken round-trips to the embedded Actor without a DB lookup', async () => {
    const repo = new InMemoryUserRepository();
    await repo.init();
    await seedUser(repo);
    const svc = makeAuthService(repo);

    const { token } = await svc.login({ username: 'admin', password: 'demo1234' });
    const actor = await svc.resolveToken(token);
    expect(actor?.role).toBe('admin');
    expect(actor?.displayName).toBe('Ada Admin');
  });

  it('logout is a client-side no-op: stateless tokens remain valid until expiry', async () => {
    // Stateless tokens cannot be server-revoked (the trade-off for serverless
    // survivability); logout just discards the token client-side.
    const repo = new InMemoryUserRepository();
    await repo.init();
    await seedUser(repo);
    const svc = makeAuthService(repo);

    const { token } = await svc.login({ username: 'admin', password: 'demo1234' });
    await svc.logout(token);
    expect(await svc.resolveToken(token)).not.toBeNull();
  });

  it('resolveToken returns null for a malformed / unsigned token', async () => {
    const repo = new InMemoryUserRepository();
    await repo.init();
    const svc = makeAuthService(repo);
    expect(await svc.resolveToken('deadbeef')).toBeNull();
  });

  it('resolveToken returns null when the HMAC signature does not match', async () => {
    const repo = new InMemoryUserRepository();
    await repo.init();
    await seedUser(repo);
    const svc = makeAuthService(repo);
    const { token } = await svc.login({ username: 'admin', password: 'demo1234' });
    // Tamper with the payload but keep the original signature.
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 'u1', expiresAt: Date.now() + 1e6, actor: { id: 'u1', role: 'admin' } })).toString('base64url') + '.' + sig;
    expect(await svc.resolveToken(forged)).toBeNull();
  });
});

describe('assertSessionSecret() — B-2 production fail-fast', () => {
  const saved = { ...process.env };
  afterEach(() => {
    // Restore the env between cases so one test can't leak into another.
    process.env['NODE_ENV'] = saved['NODE_ENV'];
    if (saved['SESSION_SECRET'] === undefined) delete process.env['SESSION_SECRET'];
    else process.env['SESSION_SECRET'] = saved['SESSION_SECRET'];
  });

  it('throws in production when SESSION_SECRET is unset', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['SESSION_SECRET'];
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it('throws in production when SESSION_SECRET equals the insecure fallback', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_SECRET'] = 'camp-platform-dev-secret-change-in-production';
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it('does NOT throw in production when a real SESSION_SECRET is set', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_SECRET'] = 'a-genuinely-random-32-plus-byte-secret-value-xyz';
    expect(() => assertSessionSecret()).not.toThrow();
  });

  it('does NOT throw outside production even with no SESSION_SECRET', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['SESSION_SECRET'];
    expect(() => assertSessionSecret()).not.toThrow();
  });
});

describe('toActor()', () => {
  it('derives displayName and normalises optional fields to null', () => {
    const now = new Date().toISOString();
    const actor = toActor({
      id: 'u2',
      firstName: 'Zoe',
      lastName: 'Zone',
      username: 'zoe',
      role: 'zoneLeader',
      zone: 'Yellow',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as User);
    expect(actor.displayName).toBe('Zoe Zone');
    expect(actor.zone).toBe('Yellow');
    expect(actor.churchId).toBeNull();
  });
});
