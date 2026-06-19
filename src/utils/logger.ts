import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): number {
  return LEVELS[(env.LOG_LEVEL as LogLevel) ?? 'info'] ?? 1;
}

function log(level: LogLevel, prefix: string, message: string, ...args: unknown[]): void {
  if (LEVELS[level] < currentLevel()) return;
  const ts = new Date().toISOString();
  const label = `[${ts}] [${level.toUpperCase()}] [${prefix}]`;
  if (level === 'error') {
    console.error(label, message, ...args);
  } else if (level === 'warn') {
    console.warn(label, message, ...args);
  } else {
    console.log(label, message, ...args);
  }
}

export function createLogger(prefix: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => log('debug', prefix, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log('info', prefix, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log('warn', prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log('error', prefix, msg, ...args),
  };
}

export type Logger = ReturnType<typeof createLogger>;
