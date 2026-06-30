import type { Express } from 'express';
import { env } from './config/env';
import { buildContainer } from './container';
import { seedAll } from './data/seed';
import { buildRoutes, createApp } from './api/http';
import { assertSessionSecret } from './services/auth.service';

/**
 * Builds the fully-wired Express app: composes the container, seeds demo data
 * (only for in-memory persistence), builds the route table and the Express adapter.
 */
export async function createAppInstance(): Promise<Express> {
  // B-2 (Phase 5): refuse to start a production instance with a forgeable session secret.
  // This is the single path both src/index.ts and api/index.ts go through.
  assertSessionSecret();

  const container = await buildContainer();

  if (env.PERSISTENCE === 'memory') {
    await seedAll(container);
  }

  const routes = buildRoutes(container.services);
  const app = createApp(routes, container.services.auth);

  return app;
}
