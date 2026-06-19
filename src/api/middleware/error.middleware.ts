import type { Response } from 'express';
import { isAppError } from '../../core/errors/app-error';
import type { ApiErrorBody } from '../http/types';
import { ZodError } from 'zod';
import { createLogger } from '../../utils/logger';

const logger = createLogger('http');

export function sendError(res: Response, err: unknown): void {
  if (isAppError(err)) {
    const body: ApiErrorBody = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.errors,
    };
    res.status(422).json(body);
    return;
  }

  logger.error('Unhandled error', err);
  const body: ApiErrorBody = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
  res.status(500).json(body);
}
