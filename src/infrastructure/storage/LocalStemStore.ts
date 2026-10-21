import { StemBlobPort } from '../../application/ports/StemBlobPort';

const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stems por conteúdo, em memória (F0). Mesmo contrato do R2WorkerStemStore da F3:
 * a chave é o sha256 e gravar o mesmo arquivo duas vezes não duplica nada.
 */
export class LocalStemStore implements StemBlobPort {
  private readonly blobs = new Map<string, Blob>();

  public async put(blob: Blob): Promise<string> {
    const sha = await sha256Hex(blob);
    if (!this.blobs.has(sha)) this.blobs.set(sha, blob);
    return sha;
  }

  public async get(sha256: string): Promise<Blob | null> {
    if (!SHA256_HEX.test(sha256)) return null;
    return this.blobs.get(sha256) ?? null;
  }

  public async has(sha256: string): Promise<boolean> {
    return SHA256_HEX.test(sha256) && this.blobs.has(sha256);
  }
}
