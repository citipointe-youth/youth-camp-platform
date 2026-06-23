export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export class BadRequestError extends AppError {
  constructor(m = 'Bad request') {
    super(400, 'BAD_REQUEST', m);
  }
}

export class UnauthorizedError extends AppError {
  constructor(m = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', m);
  }
}

export class ForbiddenError extends AppError {
  constructor(m = 'Forbidden') {
    super(403, 'FORBIDDEN', m);
  }
}

export class NotFoundError extends AppError {
  constructor(m = 'Not found') {
    super(404, 'NOT_FOUND', m);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(m = 'Unprocessable entity', d?: unknown) {
    super(422, 'VALIDATION_ERROR', m, d);
  }
}

export class WipeGuardError extends AppError {
  constructor(m = 'Camp data has not been exported this season. Download the audit export first, or pass force+confirmWipe to override.') {
    super(409, 'WIPE_GUARD', m);
  }
}
