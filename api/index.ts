import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';
import { createAppInstance } from '../src/app';

// Cache the Express app across warm invocations (Vercel reuses the module).
let appPromise: Promise<Express> | undefined;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createAppInstance().catch((err: unknown) => {
      // Reset so the next cold start retries.
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getApp();
  // Delegate to Express — it handles the request/response directly.
  app(req as never, res as never);
}
