import type { Express } from 'express';
import { env } from './config/env';
import { buildContainer } from './container';
import { seedAll } from './data/seed';
import { buildRoutes, createApp } from './api/http';

/**
 * Builds the fully-wired Express app: composes the container, seeds demo data
 * (only for in-memory persistence), builds the route table and the Express adapter.
 */
export async function createAppInstance(): Promise<Express> {
  const container = await buildContainer();

  if (env.PERSISTENCE === 'memory') {
    await seedAll(container);
  }

  const routes = buildRoutes(container.services);
  const app = createApp(routes, container.services.auth);

  return app;
}
