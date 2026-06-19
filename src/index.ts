import { env } from './config/env';
import { createAppInstance } from './app';
import { createLogger } from './utils/logger';

const logger = createLogger('app');

async function main(): Promise<void> {
  logger.info(`Starting Camp Platform in ${env.NODE_ENV} mode...`);
  logger.info(`Persistence: ${env.PERSISTENCE}`);

  const app = await createAppInstance();

  app.listen(env.PORT, () => {
    logger.info(`Camp Platform listening on http://localhost:${env.PORT}`);
    logger.info(`Health: http://localhost:${env.PORT}/health`);
    logger.info(`API:    http://localhost:${env.PORT}/auth/login`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
