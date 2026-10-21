import type { Env } from './env';
import { getDocument } from './firestore';
import { forbidden, notFound } from './http';
import { type BlobRow, getBlob } from './registry';
import type { Scope } from './route';

const UPLOAD_ROLES = new Set(['sound_tech', 'leader', 'admin']);

/**
 * Subir, abrir multipart, registrar origem e consultar estado (contrato, secao 4):
 * - igreja: membro ativo com papel sound_tech/leader/admin;
 * - catalogo: existir platformAdmins/{uid} (a regra so deixa o proprio uid ler).
 */
export async function authorizeWrite(env: Env, userToken: string, uid: string, scope: Scope): Promise<void> {
  if (scope.kind === 'church') {
    const member = await getDocument(env, userToken, `churches/${scope.churchId}/members/${uid}`);
    if (
      member.status !== 'ok' ||
      member.data.status !== 'active' ||
      typeof member.data.role !== 'string' ||
      !UPLOAD_ROLES.has(member.data.role)
    ) {
      throw forbidden();
    }
    return;
  }
  const admin = await getDocument(env, userToken, `platformAdmins/${uid}`);
  if (admin.status !== 'ok') throw forbidden();
}

/**
 * Baixar: ler a versao no Firestore (as regras exigem membro ativo / ativo em alguma igreja ou
 * curador) E o sha256 estar em stems[].sha256 dessa versao E existir o registro no escopo da rota.
 * O terceiro passo impede reutilizar por hash um arquivo registrado so em outro escopo.
 */
export async function authorizeRead(
  env: Env,
  userToken: string,
  scope: Scope,
  sha256: string,
  songId: string,
  versionId: string
): Promise<BlobRow> {
  const path =
    scope.kind === 'church'
      ? `churches/${scope.churchId}/library/${songId}/versions/${versionId}`
      : `catalog/${songId}/versions/${versionId}`;
  const version = await getDocument(env, userToken, path);
  if (version.status === 'denied') throw forbidden();
  if (version.status === 'missing') throw notFound('version_not_found');

  const stems = version.data.stems;
  const listed =
    Array.isArray(stems) &&
    stems.some((s) => s !== null && typeof s === 'object' && (s as Record<string, unknown>).sha256 === sha256);
  if (!listed) throw forbidden();

  const registered = await getBlob(env.REGISTRY, scope.key, sha256);
  if (!registered) throw forbidden();
  return registered;
}
