import express, { type Express, type Request, type Response } from 'express';
import { env } from '../../config/env';
import type { Route, BufferRoute, HttpRequest } from './types';
import type { AuthService } from '../../services/auth.service';
import { resolveContext } from '../middleware/auth.middleware';
import { sendError } from '../middleware/error.middleware';
import { UnauthorizedError } from '../../core/errors/app-error';
import { createLogger } from '../../utils/logger';
import { RateLimiter } from '../../utils/rate-limiter';

const logger = createLogger('http');

// Login throttle: 10 attempts per IP per 15-minute window (matches CMS).
const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

export function createApp(routes: (Route | BufferRoute)[], authService: AuthService): Express {
  const app = express();
  app.set('trust proxy', true); // honour X-Forwarded-For behind a reverse proxy

  const allowWildcard = env.CORS_ORIGINS.includes('*');
  if (allowWildcard && env.NODE_ENV === 'production') {
    logger.warn('[SECURITY] CORS_ORIGINS includes "*" in production — lock this to your domain.');
  }

  // CORS + security headers
  app.use((req, res, next) => {
    const origin = req.headers['origin'];
    if (!origin || env.CORS_ORIGINS.includes(origin) || allowWildcard) {
      res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // Security headers (parity with connection-made-simple Phase 4).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // Static public files
  app.use(express.static('public'));

  // Register routes
  for (const route of routes) {
    const expressPath = route.path.replace(/:([a-zA-Z]+)/g, ':$1');
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';

    app[method](expressPath, async (req: Request, res: Response) => {
      try {
        // Throttle login attempts per IP (brute-force backstop).
        if (route.method === 'POST' && route.path === '/auth/login') {
          const ip = req.ip ?? 'unknown';
          if (loginLimiter.isBlocked(ip)) {
            const retryAfter = loginLimiter.retryAfterSeconds(ip);
            res.setHeader('Retry-After', String(retryAfter));
            res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' });
            return;
          }
        }
        const ctx = await resolveContext(req.headers['authorization'], authService, route.auth);
        if (route.auth && !ctx) {
          throw new UnauthorizedError();
        }

        const httpReq: HttpRequest = {
          ctx,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, string | undefined>,
          body: req.body,
          ip: req.ip,
        };

        if ('bufferHandler' in route) {
          const buffer = await route.bufferHandler(httpReq);
          res.setHeader('Content-Type', route.contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${route.filename}"`);
          res.send(buffer);
          return;
        }
        const result = await route.handler(httpReq);
        res.json(result);
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
  });

  return app;
}
