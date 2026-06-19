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
  JWT_SECRET: process.env['JWT_SECRET'] ?? 'camp-platform-dev-secret-change-in-prod',
  DATA_DIR: process.env['DATA_DIR'] ?? './data',
} as const;

export type Env = typeof env;
