import { describe, expect, it } from 'vitest';
import { GLOBAL_SCOPE } from '../../../src/application/ports/SongLibraryPort';
import { PART_SIZE, SendRequest, SendResponse, UploadError, WorkerUploadClient } from '../../../src/infrastructure/storage/WorkerUploadClient';

const SHA = 'c'.repeat(64);
const BASE = 'https://stems.test';

type Handler = (req: SendRequest) => SendResponse | Promise<SendResponse>;

function setup(handler: Handler) {
  const calls: SendRequest[] = [];
  const sleeps: number[] = [];
  const client = new WorkerUploadClient(
    BASE,
    async () => 'token',
    async (req) => {
      calls.push(req);
      return handler(req);
    },
    { maxAttempts: 3, baseDelayMs: 10, partConcurrency: 2, sleep: async (ms) => void sleeps.push(ms) }
  );
  return { client, calls, sleeps };
}

const ok = (body: unknown = {}): SendResponse => ({ status: 200, text: JSON.stringify(body) });

describe('WorkerUploadClient', () => {
  it('PUT único: tenta de novo em 503 com espera crescente e termina conferido pelo R2', async () => {
    let n = 0;
    const { client, calls, sleeps } = setup(() => (++n < 3 ? { status: 503, text: '' } : ok({ existed: false })));
    const res = await client.upload(new Blob([new Uint8Array(10)]), SHA, { scope: GLOBAL_SCOPE });
    expect(res).toEqual({ integrity: 'r2-sha256', existed: false });
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT', 'PUT']);
    expect(sleeps).toEqual([10, 20]);
    expect(calls[0]!.url).toBe(`${BASE}/v1/catalog/blobs/${SHA}`);
    expect(calls[0]!.headers.authorization).toBe('Bearer token');
  });

  it('recusa definitiva (400) não repete e diz que é definitiva', async () => {
    const { client, calls } = setup(() => ({ status: 400, text: '{"error":"bad_sha"}' }));
    const err = await client.upload(new Blob([new Uint8Array(10)]), SHA, { scope: GLOBAL_SCOPE }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).kind).toBe('definitive');
    expect((err as UploadError).code).toBe('bad_sha');
    expect(calls).toHaveLength(1);
  });

  it('verify: 422 vira falha definitiva sha256_mismatch', async () => {
    const { client } = setup(() => ({ status: 422, text: '{"error":"sha256_mismatch"}' }));
    const err = (await client.verify(GLOBAL_SCOPE, SHA).catch((e: unknown) => e)) as UploadError;
    expect(err.kind).toBe('definitive');
    expect(err.code).toBe('sha256_mismatch');
  });

  describe('multipart', () => {
    const big = () => new Blob([new Uint8Array(PART_SIZE * 3 + 1000)]); // 4 partes, acima do PUT único

    it('falha temporária numa parte não aborta o multipart e guarda as partes recebidas', async () => {
      let lastState: { parts: { partNumber: number }[] } | null = null;
      const { client, calls } = setup((req) => {
        if (req.method === 'POST' && req.url.endsWith('/multipart')) return ok({ uploadId: 'up1' });
        if (req.method === 'PUT' && req.url.endsWith('/up1/3')) return { status: 503, text: '' };
        if (req.method === 'PUT') return ok({ etag: `e${req.url.split('/').pop()}` });
        return ok();
      });
      const err = (await client
        .upload(big(), SHA, { scope: GLOBAL_SCOPE, onResumeState: (s) => (lastState = s) })
        .catch((e: unknown) => e)) as UploadError;
      expect(err.kind).toBe('transient');
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
      expect(lastState).not.toBeNull();
      expect(lastState!.parts.map((p) => p.partNumber)).not.toContain(3);
    });

    it('retoma pelas partes que o servidor confirma e só envia as que faltam', async () => {
      const { client, calls } = setup((req) => {
        if (req.method === 'GET') {
          return ok({ uploadId: 'up1', parts: [{ partNumber: 1, size: PART_SIZE, etag: 'e1' }, { partNumber: 2, size: PART_SIZE, etag: 'e2' }] });
        }
        if (req.method === 'PUT') return ok({ etag: `e${req.url.split('/').pop()}` });
        if (req.url.endsWith('/complete')) return ok({ ok: true });
        return { status: 500, text: '' };
      });
      const res = await client.upload(big(), SHA, {
        scope: GLOBAL_SCOPE,
        resume: { uploadId: 'up1', partSize: PART_SIZE, parts: [{ partNumber: 1, etag: 'e1', size: PART_SIZE }] }
      });
      expect(res).toEqual({ integrity: 'client-declared', existed: false });
      const puts = calls.filter((c) => c.method === 'PUT').map((c) => c.url.split('/').pop());
      expect(puts.sort()).toEqual(['3', '4']);
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/multipart'))).toBe(false);
      const complete = calls.find((c) => c.url.endsWith('/complete'))!;
      expect(JSON.parse(complete.body as string).parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2, 3, 4]);
    });

    it('arquivo que já existe no acervo (409 ao abrir) não sobe de novo', async () => {
      const { client, calls } = setup((req) => (req.url.endsWith('/multipart') ? { status: 409, text: '{"error":"already_exists"}' } : ok()));
      const res = await client.upload(big(), SHA, { scope: GLOBAL_SCOPE });
      expect(res).toEqual({ integrity: 'client-declared', existed: true });
      expect(calls).toHaveLength(1);
    });

    it('pausa (sinal abortado) para sem abortar o multipart', async () => {
      const controller = new AbortController();
      const { client, calls } = setup((req) => {
        if (req.url.endsWith('/multipart')) return ok({ uploadId: 'up1' });
        if (req.method === 'PUT') {
          controller.abort();
          return ok({ etag: 'x' });
        }
        return ok();
      });
      const err = (await client.upload(big(), SHA, { scope: GLOBAL_SCOPE, signal: controller.signal }).catch((e: unknown) => e)) as UploadError;
      expect(err.kind).toBe('cancelled');
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    });
  });
});
