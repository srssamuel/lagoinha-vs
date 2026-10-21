import { describe, expect, it } from 'vitest';
import { R2WorkerStemStore, SINGLE_PUT_LIMIT, StemAccessError } from '../../../src/infrastructure/storage/R2WorkerStemStore';
import { sha256Hex } from '../../../src/infrastructure/storage/LocalStemStore';
import { inferSectionType, inferStemType } from '../../../src/domain/services/StemNameClassifier';

type Call = { url: string; method: string; headers: Record<string, string>; size?: number };

function fakeWorker(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      size: body instanceof Blob ? body.size : typeof body === 'string' ? body.length : undefined
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { calls, impl };
}

const church = { kind: 'church' as const, churchId: 'lagoinha-jp' };

describe('R2WorkerStemStore (cliente do Worker)', () => {
  it('sem login não chama o Worker', async () => {
    const worker = fakeWorker(() => new Response(null, { status: 200 }));
    const store = new R2WorkerStemStore('https://w.example/', async () => null, () => church, worker.impl);
    await expect(store.has('a'.repeat(64))).rejects.toBeInstanceOf(StemAccessError);
    expect(worker.calls).toHaveLength(0);
  });

  it('download exige música e versão e confere o sha256 do que chegou', async () => {
    const good = new Blob(['bytes do stem']);
    const sha = await sha256Hex(good);
    const worker = fakeWorker((call) =>
      call.url.includes(sha) ? new Response(good, { status: 200 }) : new Response('outro conteúdo', { status: 200 })
    );
    const store = new R2WorkerStemStore('https://w.example', async () => 'tok', () => church, worker.impl);
    await expect(store.get(sha)).rejects.toThrow(/versão/);
    const blob = await store.get(sha, { scope: church, songId: 's1', versionId: 'v1' });
    expect(await blob!.text()).toBe('bytes do stem');
    expect(worker.calls[0]!.url).toBe(`https://w.example/v1/churches/lagoinha-jp/blobs/${sha}?song=s1&version=v1`);
    expect(worker.calls[0]!.headers.authorization).toBe('Bearer tok');

    const wrong = 'c'.repeat(64);
    await expect(store.get(wrong, { scope: church, songId: 's1', versionId: 'v1' })).rejects.toThrow(/não confere/);
  });

  it('403 do Worker vira erro de acesso legível; 404 vira ausência', async () => {
    const worker = fakeWorker((call) => new Response(JSON.stringify({ error: 'forbidden' }), { status: call.method === 'HEAD' ? 404 : 403 }));
    const store = new R2WorkerStemStore('https://w.example', async () => 'tok', () => church, worker.impl);
    expect(await store.has('d'.repeat(64))).toBe(false);
    await expect(store.get('d'.repeat(64), { scope: { kind: 'global' }, songId: 's', versionId: 'v' })).rejects.toThrow(
      /não tem acesso/
    );
    expect(worker.calls[1]!.url).toContain('/v1/catalog/blobs/');
  });

  it('arquivo pequeno sobe num PUT só; grande vai em partes e completa', async () => {
    const worker = fakeWorker((call) => {
      if (call.url.endsWith('/multipart')) return new Response(JSON.stringify({ uploadId: 'up1' }), { status: 201 });
      if (/\/multipart\/up1\/\d+$/.test(call.url)) return new Response(JSON.stringify({ etag: `e${call.url.slice(-1)}` }));
      return new Response(null, { status: 201 });
    });
    const store = new R2WorkerStemStore('https://w.example', async () => 'tok', () => church, worker.impl);
    const small = new Blob(['pequeno'], { type: 'audio/wav' });
    const sha = await store.put(small, { scope: church, name: 'Baixo.wav' });
    expect(sha).toBe(await sha256Hex(small));
    expect(worker.calls[0]!.method).toBe('PUT');
    expect(worker.calls[0]!.headers['content-type']).toBe('audio/wav');
    expect(worker.calls[0]!.headers['x-original-name']).toBe('Baixo.wav');

    worker.calls.length = 0;
    const big = new Blob([new Uint8Array(SINGLE_PUT_LIMIT + 1024)]);
    await store.put(big, { scope: church });
    expect(worker.calls.map((c) => `${c.method} ${c.url.replace(/.*\/blobs\/[0-9a-f]{64}/, '')}`)).toEqual([
      'POST /multipart',
      'PUT /multipart/up1/1',
      'PUT /multipart/up1/2',
      'POST /multipart/up1/complete'
    ]);
  });
});

describe('StemNameClassifier', () => {
  it('reconhece os nomes usuais de stems em português e inglês', () => {
    expect(inferStemType('01 - Click.wav')).toBe('click');
    expect(inferStemType('Guia_Voz.mp3')).toBe('guide');
    expect(inferStemType('BATERIA.wav')).toBe('drums');
    expect(inferStemType('Violão.wav')).toBe('violao');
    expect(inferStemType('Guitarra 2.wav')).toBe('guitars');
    expect(inferStemType('Pad Ambiente.wav')).toBe('pad');
    expect(inferStemType('Teclado.wav')).toBe('keys');
    expect(inferStemType('Vozes.wav')).toBe('vocals');
    expect(inferStemType('mixdown final')).toBeNull();
  });

  it('classifica seções pelo nome', () => {
    expect(inferSectionType('Refrão 2')).toBe('chorus');
    expect(inferSectionType('Pré-Refrão')).toBe('pre-chorus');
    expect(inferSectionType('Ponte')).toBe('bridge');
    expect(inferSectionType('qualquer')).toBe('verse');
  });
});
