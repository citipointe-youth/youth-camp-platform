import type { IRepository } from '../interfaces/base.repository';
import type { IPersistenceAdapter } from '../persistence/persistence';
import { NullPersistence } from '../persistence/persistence';

export class InMemoryBaseRepository<T extends { id: string }> implements IRepository<T> {
  protected store: Map<string, T> = new Map();
  protected persistence: IPersistenceAdapter<T>;

  constructor(persistence?: IPersistenceAdapter<T>) {
    this.persistence = persistence ?? new NullPersistence<T>();
  }

  protected clone(entity: T): T {
    return JSON.parse(JSON.stringify(entity)) as T;
  }

  async init(): Promise<void> {
    const items = await this.persistence.read();
    this.store.clear();
    for (const item of items) {
      this.store.set(item.id, this.clone(item));
    }
  }

  async findById(id: string): Promise<T | null> {
    const item = this.store.get(id);
    return item ? this.clone(item) : null;
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.store.values()).map((item) => this.clone(item));
  }

  async save(entity: T): Promise<T> {
    const cloned = this.clone(entity);
    this.store.set(cloned.id, cloned);
    await this.writeToPersistence();
    return this.clone(cloned);
  }

  async saveMany(entities: T[]): Promise<T[]> {
    const stored: T[] = [];
    for (const entity of entities) {
      const cloned = this.clone(entity);
      this.store.set(cloned.id, cloned);
      stored.push(cloned);
    }
    // One persistence write for the whole batch (defect C1).
    if (entities.length > 0) await this.writeToPersistence();
    return stored.map((e) => this.clone(e));
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.store.has(id);
    if (existed) {
      this.store.delete(id);
      await this.writeToPersistence();
    }
    return existed;
  }

  async deleteAll(): Promise<number> {
    const n = this.store.size;
    if (n > 0) {
      this.store.clear();
      await this.writeToPersistence();
    }
    return n;
  }

  protected async writeToPersistence(): Promise<void> {
    await this.persistence.write(Array.from(this.store.values()));
  }
}
