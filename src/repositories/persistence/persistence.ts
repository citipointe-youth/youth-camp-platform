export interface IPersistenceAdapter<T> {
  read(): Promise<T[]>;
  write(data: T[]): Promise<void>;
}

export class NullPersistence<T> implements IPersistenceAdapter<T> {
  async read(): Promise<T[]> {
    return [];
  }
  async write(_data: T[]): Promise<void> {}
}
