import {
  abortMultipart,
  completeMultipart,
  createMultipart,
  deleteBlob,
  getBlobBytes,
  headBlob,
  putBlob,
  putPart,
  recordSource
} from './blobs';
import type { Env } from './env';
import { HttpError, errorResponse, json, preflight, unauthenticated, withCors } from './http';
import { verifyIdToken } from './jwt';
import { parseRoute } from './route';

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) throw unauthenticated();
  return match[1] as string;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  if (url.pathname === '/health') {
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
    return json({ ok: true, version: env.VERSION ?? 'dev' });
  }

  const route = parseRoute(url.pathname, method);
  // Nenhuma rota alem de /health responde sem token valido.
  const auth = await verifyIdToken(bearer(request), env);

  switch (route.type) {
    case 'blob':
      if (method === 'HEAD') return headBlob(request, env, auth, route);
      if (method === 'PUT') return putBlob(request, env, auth, route);
      if (method === 'GET') return getBlobBytes(request, env, auth, route);
      if (method === 'DELETE') return deleteBlob(request, env, auth, route);
      break;
    case 'multipart-create':
      if (method === 'POST') return createMultipart(request, env, auth, route);
      break;
    case 'multipart-part':
      if (method === 'PUT') return putPart(request, env, auth, route);
      break;
    case 'multipart-complete':
      if (method === 'POST') return completeMultipart(request, env, auth, route);
      break;
    case 'multipart-abort':
      if (method === 'DELETE') return abortMultipart(request, env, auth, route);
      break;
    case 'sources':
      if (method === 'POST') return recordSource(request, env, auth, route);
      break;
  }
  throw new HttpError(405, 'method_not_allowed');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight(request, env);
    let response: Response;
    try {
      response = await handle(request, env);
    } catch (err) {
      if (err instanceof HttpError) {
        response = errorResponse(err);
      } else {
        // Sem token, sem corpo e sem cabecalhos no log.
        console.error('unhandled', err instanceof Error ? err.name : 'unknown');
        response = errorResponse(new HttpError(500, 'internal'));
      }
    }
    return withCors(response, request, env);
  }
} satisfies ExportedHandler<Env>;
