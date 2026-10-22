import type { Env } from './env';
import { HttpError } from './http';
import { acquireReservation, releaseReservation } from './registry';
import type { Scope } from './route';

/**
 * Um escritor por (escopo, hash) de cada vez: PUT, complete do multipart, verificacao e exclusao disputam a
 * mesma reserva (INSERT condicional no D1). Quem perde recebe 409; ninguem apaga ou sobrescreve o objeto
 * que outro acabou de conferir.
 */
export async function withReservation<T>(env: Env, scope: Scope, sha256: string, fn: () => Promise<T>): Promise<T> {
  const holder = crypto.randomUUID();
  if (!(await acquireReservation(env.REGISTRY, scope.key, sha256, holder))) throw new HttpError(409, 'in_progress');
  try {
    return await fn();
  } finally {
    await releaseReservation(env.REGISTRY, scope.key, sha256, holder).catch(() => undefined);
  }
}
