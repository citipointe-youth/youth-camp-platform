export interface IRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  /**
   * Persist many records in one operation, returning them. Replaces per-row save
   * loops (defect C1) — the in-memory store writes its JSON file ONCE at the end
   * instead of once per row; Supabase implementations map this to a chunked bulk
   * INSERT. Order of the returned array matches the input.
   */
  saveMany(entities: T[]): Promise<T[]>;
  delete(id: string): Promise<boolean>;
  /**
   * Bulk-remove every record, returning the count deleted. Replaces row-by-row
   * delete loops (defect A3) — one write instead of N. Supabase implementations
   * map this to `TRUNCATE ... CASCADE` to avoid the per-statement timeout.
   */
  deleteAll(): Promise<number>;
  init(): Promise<void>;
}
