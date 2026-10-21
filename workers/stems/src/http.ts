import type { Env } from './env';

/** Erro que vira resposta JSON `{"error": code}` com o status indicado. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export const unauthenticated = (): HttpError => new HttpError(401, 'unauthenticated');
export const forbidden = (): HttpError => new HttpError(403, 'forbidden');
export const notFound = (code = 'not_found'): HttpError => new HttpError(404, code);
export const badRequest = (code = 'bad_request'): HttpError => new HttpError(400, code);

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function errorResponse(err: HttpError): Response {
  return json({ error: err.code }, err.status);
}

const ALLOWED_METHODS = 'GET, HEAD, PUT, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'authorization, content-type, x-original-name, range';
const EXPOSED_HEADERS = 'etag, x-content-sha256, x-integrity, content-range, content-length, accept-ranges';

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Devolve a origem so se estiver na lista; nunca "*" e nunca ecoa origem desconhecida. */
function matchOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  return origin && allowedOrigins(env).includes(origin) ? origin : null;
}

export function preflight(request: Request, env: Env): Response {
  const origin = matchOrigin(request, env);
  const headers = new Headers({ vary: 'Origin' });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', ALLOWED_METHODS);
    headers.set('access-control-allow-headers', ALLOWED_HEADERS);
    headers.set('access-control-max-age', '600');
  }
  return new Response(null, { status: 204, headers });
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const origin = matchOrigin(request, env);
  const out = new Response(response.body, response);
  out.headers.append('vary', 'Origin');
  if (origin) {
    out.headers.set('access-control-allow-origin', origin);
    out.headers.set('access-control-expose-headers', EXPOSED_HEADERS);
  }
  return out;
}
