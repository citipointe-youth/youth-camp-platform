export const env = {
  PORT: parseInt(process.env['PORT'] ?? '4200', 10),
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  PERSISTENCE: (process.env['PERSISTENCE'] ?? 'memory') as 'memory' | 'json' | 'supabase',
  DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
  CORS_ORIGINS: (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // NOTE: session signing uses SESSION_SECRET, read directly in auth.service.ts — NOT a
  // JWT_SECRET here. A stale JWT_SECRET key was removed (it was never read, so setting it
  // in a deployment gave a false sense of having secured sessions). Set SESSION_SECRET.
  DATA_DIR: process.env['DATA_DIR'] ?? './data',
} as const;

export type Env = typeof env;
