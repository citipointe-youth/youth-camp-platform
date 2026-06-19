import type { SqlClient } from './client';
import type { IUserRepository } from '../interfaces/entity-repositories';
import type { User } from '../../core/entities/user';

function toUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    username: row['username'] as string,
    mobile: (row['mobile'] as string | null) ?? undefined,
    role: row['role'] as User['role'],
    churchId: (row['church_id'] as string | null) ?? undefined,
    churchName: (row['church_name'] as string | null) ?? undefined,
    zone: (row['zone'] as User['zone']) ?? undefined,
    status: row['status'] as User['status'],
    passwordHash: (row['password_hash'] as string | null) ?? undefined,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function userColumns(u: User): Record<string, unknown> {
  return {
    id: u.id,
    first_name: u.firstName,
    last_name: u.lastName,
    username: u.username,
    mobile: u.mobile ?? null,
    role: u.role,
    church_id: u.churchId ?? null,
    church_name: u.churchName ?? null,
    zone: u.zone ?? null,
    status: u.status,
    password_hash: u.passwordHash ?? null,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

const UPDATE_COLS = [
  'first_name', 'last_name', 'username', 'mobile', 'role',
  'church_id', 'church_name', 'zone', 'status', 'password_hash', 'updated_at',
] as const;

export class SupabaseUserRepository implements IUserRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<User[]> {
    const rows = await this.sql`select * from users order by last_name, first_name`;
    return rows.map(toUser);
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.sql`select * from users where id = ${id}`;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.sql`select * from users where lower(username) = lower(${username})`;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByChurch(churchId: string): Promise<User[]> {
    const rows = await this.sql`select * from users where church_id = ${churchId} order by last_name`;
    return rows.map(toUser);
  }

  async findByRole(role: string): Promise<User[]> {
    const rows = await this.sql`select * from users where role = ${role} order by last_name`;
    return rows.map(toUser);
  }

  async save(user: User): Promise<User> {
    await this.sql`
      insert into users ${this.sql(userColumns(user))}
      on conflict (id) do update set ${this.sql(userColumns(user), ...UPDATE_COLS)}
    `;
    return user;
  }

  async saveMany(users: User[]): Promise<User[]> {
    if (users.length === 0) return [];
    for (const u of users) await this.save(u);
    return users;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from users where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    // Preserve the sole admin account on reset.
    const rows = await this.sql`delete from users where role != 'admin' returning id`;
    return rows.length;
  }
}
