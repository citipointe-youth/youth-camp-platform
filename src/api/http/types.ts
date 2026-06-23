import type { Actor } from '../../core/entities/user';

export interface RequestContext {
  actor: Actor;
  token: string;
}

export interface HttpRequest {
  ctx: RequestContext | null;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  ip?: string;
}

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: boolean;
  handler(req: HttpRequest): Promise<unknown>;
}

export interface BufferRoute {
  method: 'GET' | 'POST';
  path: string;
  auth: boolean;
  contentType: string;
  filename: string;
  bufferHandler(req: HttpRequest): Promise<Buffer>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
