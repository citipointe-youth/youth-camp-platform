import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { IPersistenceAdapter } from './persistence';

export class JsonFilePersistence<T> implements IPersistenceAdapter<T> {
  constructor(private readonly filePath: string) {}

  async read(): Promise<T[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
      return [];
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'ENOENT'
      ) {
        return [];
      }
      throw err;
    }
  }

  async write(data: T[]): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
