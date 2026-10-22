import { LibraryScope } from '../../application/ports/SongLibraryPort';
import { StemBlobPort, StemReadRef, StemWriteTarget } from '../../application/ports/StemBlobPort';
import { sha256Hex } from './LocalStemStore';

const SHA256_HEX = /^[0-9a-f]{64}$/;
/** Plano Workers Free aceita até 100 MB por requisição; acima disso vai em partes (contrato, seção 5). */
export const SINGLE_PUT_LIMIT = 95 * 1024 * 1024;
const PART_SIZE = 64 * 1024 * 1024;

export type IdTokenProvider = () => Promise<string | null>;

export class StemAccessError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'StemAccessError';
  }
}

function scopePath(scope: LibraryScope): string {
  return scope.kind === 'global' ? 'catalog' : `churches/${encodeURIComponent(scope.churchId)}`;
}

/**
 * Stems no R2 através do Worker (contrato-stems-worker). O app só conhece a URL do Worker:
 * a identidade vai no ID token do Firebase e a chave do objeto é montada pelo Worker.
 * Todo download é conferido pelo sha256 antes de ser entregue ao player.
 */
export class R2WorkerStemStore implements StemBlobPort {
  constructor(
    private readonly baseUrl: string,
    private readonly idToken: IdTokenProvider,
    private readonly defaultScope: () => LibraryScope | null,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {}

  private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await this.idToken();
    if (!token) throw new StemAccessError(401, 'Entre com sua conta para acessar os arquivos.');
    return { authorization: `Bearer ${token}`, ...extra };
  }

  private url(scope: LibraryScope, sha256: string, suffix = ''): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/v1/${scopePath(scope)}/blobs/${sha256}${suffix}`;
  }

  private resolveScope(scope?: LibraryScope): LibraryScope {
    const resolved = scope ?? this.defaultScope();
    if (!resolved) throw new Error('Escolha a igreja antes de enviar arquivos.');
    return resolved;
  }

  private async fail(res: Response): Promise<never> {
    let code = '';
    try {
      code = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      // corpo sem JSON
    }
    const message =
      res.status === 401
        ? 'Sessão expirada: entre de novo.'
        : res.status === 403
          ? 'Você não tem acesso a este arquivo.'
          : res.status === 404
            ? 'Arquivo não encontrado no acervo.'
            : `Falha no acervo (${res.status}${code ? `: ${code}` : ''}).`;
    throw new StemAccessError(res.status, message);
  }

  public async has(sha256: string, scope?: LibraryScope): Promise<boolean> {
    if (!SHA256_HEX.test(sha256)) return false;
    const res = await this.fetchImpl(this.url(this.resolveScope(scope), sha256), {
      method: 'HEAD',
      headers: await this.headers()
    });
    if (res.status === 404) return false;
    if (!res.ok) await this.fail(res);
    return true;
  }

  public async get(sha256: string, ref?: StemReadRef): Promise<Blob | null> {
    if (!SHA256_HEX.test(sha256)) return null;
    if (!ref) throw new Error('Download do acervo exige a música e a versão que listam o arquivo.');
    const query = `?song=${encodeURIComponent(ref.songId)}&version=${encodeURIComponent(ref.versionId)}`;
    // Biblioteca pública: sem login, o catálogo publicado baixa sem token (o Worker confere a publicação).
    const token = await this.idToken();
    if (!token && ref.scope.kind !== 'global') throw new StemAccessError(401, 'Entre com sua conta para acessar os arquivos.');
    const res = await this.fetchImpl(this.url(ref.scope, sha256, query), {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
    if (res.status === 404) return null;
    if (!res.ok) await this.fail(res);
    const blob = await res.blob();
    if ((await sha256Hex(blob)) !== sha256) {
      throw new StemAccessError(502, 'O arquivo baixado não confere com o registro (sha256). Tente de novo.');
    }
    return blob;
  }

  public async put(blob: Blob, target?: StemWriteTarget): Promise<string> {
    const scope = this.resolveScope(target?.scope);
    const sha = await sha256Hex(blob);
    const contentType = target?.contentType || blob.type || 'application/octet-stream';
    const meta: Record<string, string> = { 'content-type': contentType };
    if (target?.name) meta['x-original-name'] = encodeURIComponent(target.name.slice(0, 255));

    if (blob.size <= SINGLE_PUT_LIMIT) {
      const res = await this.fetchImpl(this.url(scope, sha), {
        method: 'PUT',
        headers: await this.headers(meta),
        body: blob
      });
      if (!res.ok) await this.fail(res);
      return sha;
    }

    const start = await this.fetchImpl(this.url(scope, sha, '/multipart'), {
      method: 'POST',
      headers: await this.headers({ ...meta, 'content-type': 'application/json' }),
      body: JSON.stringify({ size: blob.size, contentType })
    });
    if (!start.ok) await this.fail(start);
    const { uploadId } = (await start.json()) as { uploadId: string };
    const parts: { partNumber: number; etag: string }[] = [];
    try {
      for (let offset = 0, partNumber = 1; offset < blob.size; offset += PART_SIZE, partNumber++) {
        const res = await this.fetchImpl(this.url(scope, sha, `/multipart/${encodeURIComponent(uploadId)}/${partNumber}`), {
          method: 'PUT',
          headers: await this.headers(),
          body: blob.slice(offset, offset + PART_SIZE)
        });
        if (!res.ok) await this.fail(res);
        parts.push({ partNumber, etag: ((await res.json()) as { etag: string }).etag });
      }
      const done = await this.fetchImpl(this.url(scope, sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        headers: await this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ parts })
      });
      if (!done.ok) await this.fail(done);
      return sha;
    } catch (err) {
      await this.fetchImpl(this.url(scope, sha, `/multipart/${encodeURIComponent(uploadId)}`), {
        method: 'DELETE',
        headers: await this.headers()
      }).catch(() => undefined);
      throw err;
    }
  }
}
