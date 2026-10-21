// Testes da secao 8 do contrato, pelo endpoint do Worker, contra o Firestore Emulator com as
// firestore.rules reais do repo. Rodam so sob `npm run test:emu`; sem emulador ficam "skipped".
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EMULATOR,
  applyMigrations,
  call,
  clearFirestore,
  generateKeys,
  mintToken,
  mockJwks,
  randomBytes,
  seed,
  sha256Hex
} from './helpers';

const MIB = 1024 * 1024;

interface Blob {
  bytes: Uint8Array;
  sha: string;
}

async function makeBlob(size = 2048): Promise<Blob> {
  const bytes = randomBytes(size);
  return { bytes, sha: await sha256Hex(bytes) };
}

const tokens: Record<string, string> = {};

const blobPath = (scope: string, sha: string, tail = '') => `/v1/${scope}/blobs/${sha}${tail}`;
const A = 'churches/igreja-a';
const B = 'churches/igreja-b';
const CATALOG = 'catalog';

// Hashes citados nas versoes semeadas (o conteudo real so existe quando o teste sobe o arquivo).
let blobA: Blob; // versao a/song1/v1
let blobB: Blob; // versao b/song1/v1 e a/song1/v2 (caso obrigatorio)
let blobC: Blob; // catalog/song1/v1

async function upload(token: string, scope: string, blob: Blob, extra: Record<string, string> = {}) {
  return call(blobPath(scope, blob.sha), {
    method: 'PUT',
    token,
    headers: { 'content-type': 'audio/wav', 'x-original-name': 'faixa.wav', ...extra },
    body: blob.bytes
  });
}

async function download(token: string | null, scope: string, sha: string, song = 'song1', version = 'v1', headers = {}) {
  return call(`${blobPath(scope, sha)}?song=${song}&version=${version}`, { token, headers });
}

describe.skipIf(!EMULATOR)('contrato do Worker de stems (Firestore Emulator + regras reais)', () => {
  beforeAll(async () => {
    const keys = await generateKeys();
    mockJwks(keys);
    await applyMigrations();
    await clearFirestore();

    for (const uid of ['alice', 'bob', 'carol', 'dave', 'eve', 'cura', 'tecb']) {
      tokens[uid] = await mintToken(keys, { uid });
    }
    tokens.anon = await mintToken(keys, { uid: 'anon1', provider: 'anonymous' });
    tokens.outro = await mintToken(keys, {
      uid: 'alice',
      iss: 'https://securetoken.google.com/outro-projeto',
      aud: 'outro-projeto'
    });

    blobA = await makeBlob();
    blobB = await makeBlob();
    blobC = await makeBlob();

    const member = (role: string, status = 'active') => ({ role, status, displayName: 'x' });
    // alice: tecnica de som ativa nas igrejas A e B (o caso do hash cruzado)
    await seed('churches/igreja-a', { name: 'A' });
    await seed('churches/igreja-b', { name: 'B' });
    await seed('churches/igreja-a/members/alice', member('sound_tech'));
    await seed('churches/igreja-b/members/alice', member('sound_tech'));
    await seed('churches/igreja-a/members/bob', member('musician'));
    await seed('churches/igreja-a/members/dave', member('leader', 'pending'));
    await seed('churches/igreja-a/members/eve', member('musician'));
    await seed('churches/igreja-b/members/tecb', member('sound_tech'));
    await seed('users/eve', { primaryChurchId: 'igreja-a' });
    await seed('platformAdmins/cura', { since: '2026-10-21' });

    const stem = (sha: string) => ({ sha256: sha, name: 'Click', type: 'click', size: 2048, contentType: 'audio/wav' });
    await seed('churches/igreja-a/library/song1', { title: 'Musica A' });
    await seed('churches/igreja-a/library/song1/versions/v1', { stems: [stem(blobA.sha)] });
    // v2 da igreja A cita um hash que so existe registrado na B
    await seed('churches/igreja-a/library/song1/versions/v2', { stems: [stem(blobB.sha)] });
    await seed('churches/igreja-b/library/song1', { title: 'Musica B' });
    await seed('churches/igreja-b/library/song1/versions/v1', { stems: [stem(blobB.sha)] });
    await seed('catalog/song1', { title: 'Catalogo' });
    await seed('catalog/song1/versions/v1', { stems: [stem(blobC.sha)] });
  });

  // 1
  describe('1. download permitido devolve os bytes com o mesmo sha256', () => {
    it('membro da igreja baixa e o hash confere; Range devolve 206', async () => {
      expect((await upload(tokens.alice!, A, blobA)).status).toBe(201);

      const full = await download(tokens.bob!, A, blobA.sha);
      expect(full.status).toBe(200);
      const body = new Uint8Array(await full.arrayBuffer());
      expect(await sha256Hex(body)).toBe(blobA.sha);
      expect(full.headers.get('x-content-sha256')).toBe(blobA.sha);
      expect(full.headers.get('content-type')).toBe('audio/wav');
      expect(full.headers.get('etag')).toBeTruthy();
      expect(full.headers.get('x-integrity')).toBe('r2-sha256');
      expect(full.headers.get('x-content-type-options')).toBe('nosniff');

      const part = await download(tokens.bob!, A, blobA.sha, 'song1', 'v1', { range: 'bytes=10-19' });
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes 10-19/${blobA.bytes.length}`);
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(blobA.bytes.slice(10, 20));

      const suffix = await download(tokens.bob!, A, blobA.sha, 'song1', 'v1', { range: 'bytes=-5' });
      expect(suffix.status).toBe(206);
      expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(blobA.bytes.slice(-5));
    });

    it('catalogo: curador sobe e membro ativo de alguma igreja baixa', async () => {
      expect((await upload(tokens.cura!, CATALOG, blobC)).status).toBe(201);
      const response = await download(tokens.eve!, CATALOG, blobC.sha);
      expect(response.status).toBe(200);
      expect(await sha256Hex(await response.arrayBuffer())).toBe(blobC.sha);
    });

    it('sha256 que nao consta na versao lida e 403; versao inexistente e 404; ids invalidos sao 400', async () => {
      const other = await makeBlob();
      expect((await upload(tokens.alice!, A, other)).status).toBe(201);
      expect((await download(tokens.bob!, A, other.sha)).status).toBe(403);
      expect((await download(tokens.bob!, A, blobA.sha, 'song1', 'v99')).status).toBe(404);
      expect((await download(tokens.bob!, A, blobA.sha, 'song1/../x', 'v1')).status).toBe(400);
      expect((await call(blobPath(A, blobA.sha), { token: tokens.bob! })).status).toBe(400);
    });
  });

  // 2
  describe('2. autenticacao com Firestore real por tras', () => {
    it('sem token = 401; token anonimo = 401; token de outro projeto = 401', async () => {
      expect((await download(null, A, blobA.sha)).status).toBe(401);
      expect((await download(tokens.anon!, A, blobA.sha)).status).toBe(401);
      expect((await download(tokens.outro!, A, blobA.sha)).status).toBe(401);
      expect((await upload(tokens.anon!, A, blobA)).status).toBe(401);
      expect((await upload(tokens.outro!, A, blobA)).status).toBe(401);
    });
  });

  // 3
  describe('3. usuario sem papel na igreja', () => {
    it('sem membro: 403 no download e no upload', async () => {
      const blob = await makeBlob();
      expect((await download(tokens.carol!, A, blobA.sha)).status).toBe(403);
      expect((await upload(tokens.carol!, A, blob)).status).toBe(403);
      expect((await env.REGISTRY.prepare('SELECT 1 FROM blobs WHERE sha256 = ?1').bind(blob.sha).first())).toBeNull();
    });

    it('musico baixa mas nao sobe; membro pendente nao sobe; tecnico de outra igreja nao sobe', async () => {
      const blob = await makeBlob();
      expect((await upload(tokens.bob!, A, blob)).status).toBe(403);
      expect((await upload(tokens.dave!, A, blob)).status).toBe(403);
      expect((await upload(tokens.tecb!, A, blob)).status).toBe(403);
      expect((await download(tokens.tecb!, A, blobA.sha)).status).toBe(403);
    });

    it('curador do catalogo e exigido para subir no catalogo (membro de igreja nao basta)', async () => {
      const blob = await makeBlob();
      expect((await upload(tokens.alice!, CATALOG, blob)).status).toBe(403);
      expect((await upload(tokens.eve!, CATALOG, blob)).status).toBe(403);
    });

    it('registrar origem, HEAD e multipart exigem o mesmo papel de quem sobe', async () => {
      const source = JSON.stringify({ kind: 'drive', sourceId: 'x' });
      expect((await call(blobPath(A, blobA.sha, '/sources'), { method: 'POST', token: tokens.bob!, body: source })).status).toBe(403);
      expect((await call(blobPath(A, blobA.sha), { method: 'HEAD', token: tokens.bob! })).status).toBe(403);
      const create = await call(blobPath(A, blobA.sha, '/multipart'), {
        method: 'POST',
        token: tokens.carol!,
        body: JSON.stringify({ size: 10 })
      });
      expect(create.status).toBe(403);
    });
  });

  // 4
  describe('4. reutilizacao entre igrejas pelo hash', () => {
    it('membro de A e B lista em A um hash registrado so em B: 403 em A, 200 em B', async () => {
      expect((await upload(tokens.alice!, B, blobB)).status).toBe(201);

      // alice le a versao v2 da A (que cita blobB) mas o registro church:igreja-a nao existe
      const viaA = await download(tokens.alice!, A, blobB.sha, 'song1', 'v2');
      expect(viaA.status).toBe(403);
      expect(await viaA.json()).toEqual({ error: 'forbidden' });
      expect((await call(blobPath(A, blobB.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);

      // pela B o mesmo arquivo baixa normalmente
      const viaB = await download(tokens.alice!, B, blobB.sha);
      expect(viaB.status).toBe(200);
      expect(await sha256Hex(await viaB.arrayBuffer())).toBe(blobB.sha);
    });

    it('o objeto no R2 fica separado por igreja (sem deduplicacao)', async () => {
      expect(await env.STEMS.head(`churches/igreja-b/blobs/${blobB.sha}`)).not.toBeNull();
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blobB.sha}`)).toBeNull();
    });
  });

  // 5
  describe('5. PUT cujo corpo nao bate com o hash', () => {
    it('400 sha256_mismatch e nada registrado nem gravado', async () => {
      const real = await makeBlob();
      const liar = { bytes: randomBytes(2048), sha: real.sha };
      const response = await upload(tokens.alice!, A, liar);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'sha256_mismatch' });
      expect(await env.REGISTRY.prepare('SELECT 1 FROM blobs WHERE sha256 = ?1').bind(real.sha).first()).toBeNull();
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${real.sha}`)).toBeNull();
      expect((await call(blobPath(A, real.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);
    });
  });

  // 6
  describe('6. upload simples, multipart, registro de origem e HEAD', () => {
    it('upload simples: 201, repete = 200 sem regravar, HEAD informa tamanho e integridade', async () => {
      const blob = await makeBlob(4096);
      const first = await upload(tokens.alice!, A, blob, { 'x-original-name': 'Click.wav' });
      expect(first.status).toBe(201);
      const again = await upload(tokens.alice!, A, blob);
      expect(again.status).toBe(200);
      expect((await again.json()) as { existed: boolean }).toMatchObject({ existed: true });

      const head = await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-length')).toBe('4096');
      expect(head.headers.get('x-integrity')).toBe('r2-sha256');

      const row = await env.REGISTRY.prepare('SELECT * FROM blobs WHERE scope = ?1 AND sha256 = ?2')
        .bind('church:igreja-a', blob.sha)
        .first<{ uploaded_by: string; original_name: string; content_type: string }>();
      expect(row).toMatchObject({ uploaded_by: 'alice', original_name: 'Click.wav', content_type: 'audio/wav' });
    });

    it('HEAD de hash nao registrado = 404', async () => {
      const blob = await makeBlob();
      expect((await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);
    });

    it('corpo acima de 95 MB declarado = 413; sem content-length = 411', async () => {
      const blob = await makeBlob();
      const big = await call(blobPath(A, blob.sha), {
        method: 'PUT',
        token: tokens.alice!,
        headers: { 'content-length': String(96 * MIB) },
        body: blob.bytes
      });
      expect(big.status).toBe(413);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(blob.bytes);
          controller.close();
        }
      });
      const unknown = await call(blobPath(A, blob.sha), { method: 'PUT', token: tokens.alice!, body: stream });
      expect(unknown.status).toBe(411);
    });

    it('multipart completo: criar, partes, completar, registro client-declared, origem, HEAD e download', async () => {
      const bytes = randomBytes(5 * MIB + 1234);
      const blob: Blob = { bytes, sha: await sha256Hex(bytes) };
      const scopeSong = 'song-mp';
      await seed(`churches/igreja-a/library/${scopeSong}`, { title: 'Multipart' });
      await seed(`churches/igreja-a/library/${scopeSong}/versions/v1`, { stems: [{ sha256: blob.sha }] });

      const create = await call(blobPath(A, blob.sha, '/multipart'), {
        method: 'POST',
        token: tokens.alice!,
        headers: { 'x-original-name': 'Pad.wav' },
        body: JSON.stringify({ size: bytes.length, contentType: 'audio/wav' })
      });
      expect(create.status).toBe(201);
      const { uploadId } = (await create.json()) as { uploadId: string };
      expect(uploadId).toBeTruthy();

      const etags: Array<{ partNumber: number; etag: string }> = [];
      const slices = [bytes.slice(0, 5 * MIB), bytes.slice(5 * MIB)];
      for (const [i, slice] of slices.entries()) {
        const res = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/${i + 1}`), {
          method: 'PUT',
          token: tokens.alice!,
          body: slice
        });
        expect(res.status).toBe(200);
        etags.push({ partNumber: i + 1, etag: ((await res.json()) as { etag: string }).etag });
      }

      // Outro usuario (mesmo com papel) nao completa o upload alheio
      const hijack = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.tecb!,
        body: JSON.stringify({ parts: etags })
      });
      expect(hijack.status).toBe(403);
      // Nem pelo mesmo usuario com outro hash na rota
      const otherSha = (await makeBlob()).sha;
      const wrongHash = await call(blobPath(A, otherSha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts: etags })
      });
      expect(wrongHash.status).toBe(403);

      const done = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts: etags })
      });
      expect(done.status).toBe(201);
      expect(await done.json()).toMatchObject({ integrity: 'client-declared', size: bytes.length });

      const head = await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! });
      expect(head.status).toBe(200);
      expect(head.headers.get('x-integrity')).toBe('client-declared');
      expect(head.headers.get('content-length')).toBe(String(bytes.length));

      const source = await call(blobPath(A, blob.sha, '/sources'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({
          kind: 'drive',
          sourceId: 'drive-file-1',
          path: 'Louvor/Pad.wav',
          name: 'Pad.wav',
          modifiedAt: '2026-10-01T10:00:00.000Z',
          size: bytes.length,
          md5: 'D41D8CD98F00B204E9800998ECF8427E'
        })
      });
      expect(source.status).toBe(201);
      const stored = await env.REGISTRY.prepare('SELECT * FROM sources WHERE sha256 = ?1').bind(blob.sha).first();
      expect(stored).toMatchObject({
        scope: 'church:igreja-a',
        kind: 'drive',
        source_id: 'drive-file-1',
        recorded_by: 'alice',
        md5: 'd41d8cd98f00b204e9800998ecf8427e'
      });

      // o upload aberto some da tabela e quem baixa confere o hash por conta propria
      expect(await env.REGISTRY.prepare('SELECT 1 FROM uploads WHERE upload_id = ?1').bind(uploadId).first()).toBeNull();
      const file = await download(tokens.bob!, A, blob.sha, scopeSong, 'v1');
      expect(file.status).toBe(200);
      expect(await sha256Hex(await file.arrayBuffer())).toBe(blob.sha);

      // Nova tentativa de multipart sobre hash ja registrado nao sobrescreve nada
      const again = await call(blobPath(A, blob.sha, '/multipart'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ size: 10 })
      });
      expect(again.status).toBe(409);
    });

    it('multipart: tamanho declarado diferente do real = 400 e nada registrado; abort = 204', async () => {
      const bytes = randomBytes(5 * MIB);
      const sha = await sha256Hex(bytes);
      const create = await call(blobPath(A, sha, '/multipart'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ size: bytes.length + 1 })
      });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/1`), {
        method: 'PUT',
        token: tokens.alice!,
        body: bytes
      });
      const etag = ((await part.json()) as { etag: string }).etag;
      const done = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts: [{ partNumber: 1, etag }] })
      });
      expect(done.status).toBe(400);
      expect(await env.REGISTRY.prepare('SELECT 1 FROM blobs WHERE sha256 = ?1').bind(sha).first()).toBeNull();
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${sha}`)).toBeNull();

      const create2 = await call(blobPath(A, sha, '/multipart'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ size: 100 })
      });
      const second = ((await create2.json()) as { uploadId: string }).uploadId;
      const abort = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(second)}`), {
        method: 'DELETE',
        token: tokens.alice!
      });
      expect(abort.status).toBe(204);
      expect(await env.REGISTRY.prepare('SELECT 1 FROM uploads WHERE upload_id = ?1').bind(second).first()).toBeNull();
    });

    it('registrar origem de blob nao registrado = 404; corpo invalido = 400', async () => {
      const blob = await makeBlob();
      const body = JSON.stringify({ kind: 'drive', sourceId: 'x' });
      expect((await call(blobPath(A, blob.sha, '/sources'), { method: 'POST', token: tokens.alice!, body })).status).toBe(404);
      expect((await call(blobPath(A, blobA.sha, '/sources'), { method: 'POST', token: tokens.alice!, body: '{"kind":"ftp"}' })).status).toBe(400);
      expect((await call(blobPath(A, blobA.sha, '/sources'), { method: 'POST', token: tokens.alice!, body: 'nao-json' })).status).toBe(400);
    });
  });

  // 7
  describe('7. o cliente nao muda escopo, chave ou classificacao', () => {
    it('campos extras no corpo do multipart e das origens sao ignorados', async () => {
      const bytes = randomBytes(5 * MIB);
      const sha = await sha256Hex(bytes);
      const create = await call(blobPath(A, sha, '/multipart'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({
          size: bytes.length,
          contentType: 'audio/wav; charset=evil',
          scope: 'catalog',
          key: `catalog/blobs/${sha}`,
          churchId: 'igreja-b',
          uploadedBy: 'mallory',
          integrity: 'r2-sha256',
          rightsClass: 'own',
          classification: 'public'
        })
      });
      expect(create.status).toBe(201);
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/1`), {
        method: 'PUT',
        token: tokens.alice!,
        body: bytes
      });
      const etag = ((await part.json()) as { etag: string }).etag;
      const done = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts: [{ partNumber: 1, etag }], scope: 'catalog', integrity: 'r2-sha256' })
      });
      expect(done.status).toBe(201);

      // so existe na chave da rota (igreja A); nada no catalogo nem na igreja B
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${sha}`)).not.toBeNull();
      expect(await env.STEMS.head(`catalog/blobs/${sha}`)).toBeNull();
      expect(await env.STEMS.head(`churches/igreja-b/blobs/${sha}`)).toBeNull();
      const row = await env.REGISTRY.prepare('SELECT * FROM blobs WHERE sha256 = ?1').bind(sha).all<{
        scope: string;
        uploaded_by: string;
        integrity: string;
        content_type: string;
      }>();
      expect(row.results).toHaveLength(1);
      expect(row.results[0]).toMatchObject({
        scope: 'church:igreja-a',
        uploaded_by: 'alice',
        integrity: 'client-declared',
        content_type: 'audio/wav'
      });

      const source = await call(blobPath(A, sha, '/sources'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ kind: 'app', sourceId: 'x', scope: 'catalog', sha256: 'f'.repeat(64), recordedBy: 'mallory' })
      });
      expect(source.status).toBe(201);
      const sources = await env.REGISTRY.prepare('SELECT scope, sha256, recorded_by FROM sources WHERE source_id = ?1')
        .bind('x')
        .all();
      expect(sources.results).toEqual([{ scope: 'church:igreja-a', sha256: sha, recorded_by: 'alice' }]);
    });

    it('um uid de outro escopo nao sobe no catalogo apontando a rota para a igreja', async () => {
      const blob = await makeBlob();
      // tecb so tem papel na B; tentar a A com campos extras nao muda nada
      const res = await call(blobPath(A, blob.sha), {
        method: 'PUT',
        token: tokens.tecb!,
        headers: { 'x-scope': 'churches/igreja-b' },
        body: blob.bytes
      });
      expect(res.status).toBe(403);
    });
  });
});
