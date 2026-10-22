// Testes da secao 8 do contrato, pelo endpoint do Worker, contra o Firestore Emulator com as
// firestore.rules reais do repo. Rodam so sob `npm run test:emu`; sem emulador ficam "skipped".
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EMULATOR,
  applyMigrations,
  call,
  callWithEnv,
  clearFirestore,
  generateKeys,
  mintToken,
  mintUnsigned,
  mockJwks,
  randomBytes,
  seed,
  sha256Hex,
  type TestKeys
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
let keys: TestKeys;

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
    keys = await generateKeys();
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
    await seed('churches/igreja-a/members/adm', member('admin'));
    tokens.adm = await mintToken(keys, { uid: 'adm' });
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
      expect(wrongHash.status).toBe(404);

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
  // ---------- revisao de seguranca (commit ad41d6a) ----------
  describe('revisao de seguranca: regressoes', () => {
    const putRaw = (token: string, scope: string, sha: string, bytes: Uint8Array) =>
      call(blobPath(scope, sha), { method: 'PUT', token, headers: { 'content-type': 'audio/wav' }, body: bytes });

    async function multipartAll(token: string, scope: string, sha: string, bytes: Uint8Array) {
      const create = await call(blobPath(scope, sha, '/multipart'), {
        method: 'POST',
        token,
        body: JSON.stringify({ size: bytes.length })
      });
      expect(create.status).toBe(201);
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(scope, sha, `/multipart/${encodeURIComponent(uploadId)}/1`), {
        method: 'PUT',
        token,
        body: bytes
      });
      const etag = ((await part.json()) as { etag: string }).etag;
      return call(blobPath(scope, sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token,
        body: JSON.stringify({ parts: [{ partNumber: 1, etag }] })
      });
    }

    async function seedVersion(songId: string, sha: string) {
      await seed(`churches/igreja-a/library/${songId}`, { title: songId });
      await seed(`churches/igreja-a/library/${songId}/versions/v1`, { stems: [{ sha256: sha }] });
    }

    // MEDIO 1
    it('pre-reserva de hash por multipart com lixo: o PUT verdadeiro regrava, promove para r2-sha256 e baixa certo', async () => {
      const real = await makeBlob(3000);
      await seedVersion('song-prereserva', real.sha);
      const garbage = randomBytes(3000);
      expect((await multipartAll(tokens.alice!, A, real.sha, garbage)).status).toBe(201);
      const head = await call(blobPath(A, real.sha), { method: 'HEAD', token: tokens.alice! });
      expect(head.headers.get('x-integrity')).toBe('client-declared');

      // PUT com conteudo que nao bate nao toca no lixo existente (continua como estava)
      const wrong = await putRaw(tokens.alice!, A, real.sha, randomBytes(3000));
      expect(wrong.status).toBe(400);
      expect((await call(blobPath(A, real.sha), { method: 'HEAD', token: tokens.alice! })).headers.get('x-integrity')).toBe('client-declared');

      const fixed = await putRaw(tokens.alice!, A, real.sha, real.bytes);
      expect(fixed.status).toBe(201);
      expect(await fixed.json()).toMatchObject({ promoted: true, integrity: 'r2-sha256' });
      expect((await call(blobPath(A, real.sha), { method: 'HEAD', token: tokens.alice! })).headers.get('x-integrity')).toBe('r2-sha256');
      const file = await download(tokens.bob!, A, real.sha, 'song-prereserva', 'v1');
      expect(await sha256Hex(await file.arrayBuffer())).toBe(real.sha);
      // verificado de verdade: o terceiro PUT nao regrava
      expect((await putRaw(tokens.alice!, A, real.sha, real.bytes)).status).toBe(200);
    });

    it('exclusao de blob: so admin da igreja; some do R2, do registro e das origens', async () => {
      const blob = await makeBlob(900);
      expect((await upload(tokens.alice!, A, blob)).status).toBe(201);
      await call(blobPath(A, blob.sha, '/sources'), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ kind: 'app', sourceId: 'del-me' })
      });
      for (const who of ['alice', 'bob', 'carol', 'tecb']) {
        expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens[who]! })).status).toBe(403);
      }
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).not.toBeNull();
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(204);
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).toBeNull();
      expect(await env.REGISTRY.prepare('SELECT 1 FROM blobs WHERE sha256 = ?1').bind(blob.sha).first()).toBeNull();
      expect(await env.REGISTRY.prepare('SELECT 1 FROM sources WHERE sha256 = ?1').bind(blob.sha).first()).toBeNull();
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(404);
      // admin da A nao apaga na B
      const other = await makeBlob(500);
      expect((await upload(tokens.tecb!, B, other)).status).toBe(201);
      expect((await call(blobPath(B, other.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(403);
    });

    it('exclusao no catalogo: so curador', async () => {
      const blob = await makeBlob(700);
      expect((await upload(tokens.cura!, CATALOG, blob)).status).toBe(201);
      expect((await call(blobPath(CATALOG, blob.sha), { method: 'DELETE', token: tokens.eve! })).status).toBe(403);
      expect((await call(blobPath(CATALOG, blob.sha), { method: 'DELETE', token: tokens.cura! })).status).toBe(204);
    });

    // MEDIO 2
    it('partes nao passam do size declarado (413) e o reenvio da mesma parte nao conta em dobro', async () => {
      const sha = (await makeBlob()).sha;
      const create = await call(blobPath(A, sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: JSON.stringify({ size: 6 * MIB }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = (n: number, bytes: Uint8Array) =>
        call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/${n}`), { method: 'PUT', token: tokens.alice!, body: bytes });
      expect((await part(1, randomBytes(5 * MIB))).status).toBe(200);
      expect((await part(1, randomBytes(5 * MIB))).status).toBe(200); // reenvio substitui
      const over = await part(2, randomBytes(2 * MIB)); // 5 + 2 > 6
      expect(over.status).toBe(413);
      expect(await over.json()).toEqual({ error: 'parts_exceed_size' });
      expect((await part(2, randomBytes(1 * MIB))).status).toBe(200); // 5 + 1 = 6
      await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}`), { method: 'DELETE', token: tokens.alice! });
    });

    it('no maximo 3 uploads abertos por uid (429); abortar libera', async () => {
      const ids: Array<{ sha: string; id: string }> = [];
      for (let i = 0; i < 3; i += 1) {
        const sha = (await makeBlob()).sha;
        const res = await call(blobPath(B, sha, '/multipart'), { method: 'POST', token: tokens.tecb!, body: JSON.stringify({ size: 100 }) });
        expect(res.status).toBe(201);
        ids.push({ sha, id: ((await res.json()) as { uploadId: string }).uploadId });
      }
      const extra = (await makeBlob()).sha;
      const blocked = await call(blobPath(B, extra, '/multipart'), { method: 'POST', token: tokens.tecb!, body: JSON.stringify({ size: 100 }) });
      expect(blocked.status).toBe(429);
      const first = ids[0]!;
      expect((await call(blobPath(B, first.sha, `/multipart/${encodeURIComponent(first.id)}`), { method: 'DELETE', token: tokens.tecb! })).status).toBe(204);
      const again = await call(blobPath(B, extra, '/multipart'), { method: 'POST', token: tokens.tecb!, body: JSON.stringify({ size: 100 }) });
      expect(again.status).toBe(201);
      ids.push({ sha: extra, id: ((await again.json()) as { uploadId: string }).uploadId });
      for (const { sha, id } of ids.slice(1)) {
        await call(blobPath(B, sha, `/multipart/${encodeURIComponent(id)}`), { method: 'DELETE', token: tokens.tecb! });
      }
    });

    // BAIXO 3
    it('reserva ativa por (escopo, hash): PUT, complete e exclusao concorrentes recebem 409 e nada e escrito', async () => {
      const blob = await makeBlob(1500);
      const reserve = (createdAt: string) =>
        env.REGISTRY.prepare('INSERT OR REPLACE INTO reservations (scope, sha256, holder, created_at) VALUES (?1, ?2, ?3, ?4)')
          .bind('church:igreja-a', blob.sha, 'outro-escritor', createdAt)
          .run();
      await reserve(new Date().toISOString());
      const put = await putRaw(tokens.alice!, A, blob.sha, blob.bytes);
      expect(put.status).toBe(409);
      expect(await put.json()).toEqual({ error: 'in_progress' });
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).toBeNull();
      expect((await multipartAll(tokens.alice!, A, blob.sha, blob.bytes)).status).toBe(409);
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).toBeNull();

      // reserva vencida (Worker que caiu no meio) pode ser retomada, e e liberada no fim
      await reserve(new Date(Date.now() - 60 * 60 * 1000).toISOString());
      expect((await putRaw(tokens.alice!, A, blob.sha, blob.bytes)).status).toBe(201);
      expect(await env.REGISTRY.prepare('SELECT 1 FROM reservations WHERE sha256 = ?1').bind(blob.sha).first()).toBeNull();

      // com o blob verificado, nem a exclusao concorrente passa por cima de uma reserva ativa
      await reserve(new Date().toISOString());
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(409);
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).not.toBeNull();
    });

    it('complete com tamanho divergente nao apaga objeto ja verificado por PUT', async () => {
      const blob = await makeBlob(1200);
      const create = await call(blobPath(A, blob.sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: JSON.stringify({ size: 1201 }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/1`), { method: 'PUT', token: tokens.alice!, body: blob.bytes });
      const etag = ((await part.json()) as { etag: string }).etag;
      // o PUT verdadeiro chega antes do complete
      expect((await putRaw(tokens.alice!, A, blob.sha, blob.bytes)).status).toBe(201);
      const done = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts: [{ partNumber: 1, etag }] })
      });
      expect(done.status).toBe(409);
      const stored = await env.STEMS.get(`churches/igreja-a/blobs/${blob.sha}`);
      expect(await sha256Hex(await stored!.arrayBuffer())).toBe(blob.sha);
    });

    // Migracao 2026-10-21: a 1a tentativa do complete montou o objeto no R2 e caiu antes do registro no D1;
    // a repeticao recebia 400 invalid_parts e o objeto ficava orfao (no R2, sem linha em blobs).
    it('complete repetido depois de o R2 ja ter montado o objeto registra (201), sem 400 nem orfao', async () => {
      const blob = await makeBlob(1500);
      const create = await call(blobPath(A, blob.sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: JSON.stringify({ size: 1500 }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/1`), { method: 'PUT', token: tokens.alice!, body: blob.bytes });
      const parts = [{ partNumber: 1, etag: ((await part.json()) as { etag: string }).etag }];
      // 1a tentativa interrompida: o R2 conclui, o D1 nao registra
      await env.STEMS.resumeMultipartUpload(`churches/igreja-a/blobs/${blob.sha}`, uploadId).complete(parts);
      expect((await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);

      const retry = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts })
      });
      expect(retry.status).toBe(201);
      expect(await retry.json()).toMatchObject({ integrity: 'client-declared', size: 1500 });
      const head = await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-length')).toBe('1500');
    });

    it('complete repetido nao adota objeto de outro uid nem de tamanho diferente do declarado', async () => {
      const blob = await makeBlob(1500);
      const create = await call(blobPath(A, blob.sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: JSON.stringify({ size: 1501 }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/1`), { method: 'PUT', token: tokens.alice!, body: blob.bytes });
      const parts = [{ partNumber: 1, etag: ((await part.json()) as { etag: string }).etag }];
      await env.STEMS.resumeMultipartUpload(`churches/igreja-a/blobs/${blob.sha}`, uploadId).complete(parts);
      const retry = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts })
      });
      expect(retry.status).toBe(400);
      expect((await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);
    });

    it('complete repetido nao adota objeto gravado por outro uid na mesma chave', async () => {
      const blob = await makeBlob(1500);
      const key = `churches/igreja-a/blobs/${blob.sha}`;
      const create = await call(blobPath(A, blob.sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: JSON.stringify({ size: 1500 }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const part = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/1`), { method: 'PUT', token: tokens.alice!, body: blob.bytes });
      const parts = [{ partNumber: 1, etag: ((await part.json()) as { etag: string }).etag }];
      await env.STEMS.resumeMultipartUpload(key, uploadId).complete(parts);
      // outro uid sobrescreve a chave com o mesmo tamanho antes da repeticao
      await env.STEMS.put(key, blob.bytes, { customMetadata: { uploadedBy: 'outro-uid' } });
      const retry = await call(blobPath(A, blob.sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        token: tokens.alice!,
        body: JSON.stringify({ parts })
      });
      expect(retry.status).toBe(400);
      expect((await call(blobPath(A, blob.sha), { method: 'HEAD', token: tokens.alice! })).status).toBe(404);
    });

    // BAIXO 4
    it('Range: invalido, insatisfazivel ou multiplo = 416; valido e recortado; falha do R2 = 502', async () => {
      const blob = await makeBlob(100);
      await seedVersion('song-range', blob.sha);
      expect((await upload(tokens.alice!, A, blob)).status).toBe(201);
      const get = (range: string) => download(tokens.bob!, A, blob.sha, 'song-range', 'v1', { range });
      for (const bad of ['bytes=abc', 'bytes=0-1,3-4', 'bytes=100-', 'bytes=500-600', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'items=0-5', 'bytes=0-1-2']) {
        const res = await get(bad);
        expect(res.status, bad).toBe(416);
        expect(res.headers.get('content-range'), bad).toBe('bytes */100');
      }
      const clipped = await get('bytes=90-9999');
      expect(clipped.status).toBe(206);
      expect(clipped.headers.get('content-range')).toBe('bytes 90-99/100');
      expect(new Uint8Array(await clipped.arrayBuffer())).toEqual(blob.bytes.slice(90));
      const open = await get('bytes=0-');
      expect(open.status).toBe(206);
      expect((await open.arrayBuffer()).byteLength).toBe(100);

      const broken = { get: async () => { throw new Error('r2 fora do ar'); } };
      const res = await callWithEnv({ STEMS: broken }, `${blobPath(A, blob.sha)}?song=song-range&version=v1`, {
        token: tokens.bob!,
        headers: { range: 'bytes=0-9' }
      });
      expect(res.status).toBe(502);
    });

    // BAIXO 5
    it('JSON acima de 64 KB e recusado (content-length e corpo em stream)', async () => {
      const sha = (await makeBlob()).sha;
      const big = JSON.stringify({ size: 10, lixo: 'x'.repeat(70 * 1024) });
      const withLength = await call(blobPath(A, sha, '/multipart'), { method: 'POST', token: tokens.alice!, headers: { 'content-length': String(big.length) }, body: big });
      expect(withLength.status).toBe(413);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        }
      });
      const chunked = await call(blobPath(A, sha, '/multipart'), { method: 'POST', token: tokens.alice!, body: stream });
      expect(chunked.status).toBe(413);
      expect(await env.REGISTRY.prepare('SELECT 1 FROM uploads WHERE sha256 = ?1').bind(sha).first()).toBeNull();
    });

    // BAIXO 6
    it('uid com barras ou pontos de caminho e recusado (401); uid com caracteres especiais e codificado no caminho', async () => {
      const blob = await makeBlob(300);
      for (const uid of ['x/../alice', 'alice/members', '..', '.']) {
        expect((await upload(await mintToken(keys, { uid }), A, blob)).status, uid).toBe(401);
      }
      await seed('churches/igreja-a/members/ana@igreja.org', { role: 'sound_tech', status: 'active' });
      const ana = await mintToken(keys, { uid: 'ana@igreja.org' });
      expect((await upload(ana, A, blob)).status).toBe(201);
    });
    // NOVO
    it('modo emulador: token sem assinatura de projeto demo-* funciona so com AUTH_EMULATOR=true', async () => {
      const token = mintUnsigned({ uid: 'alice' });
      const blob = await makeBlob(400);
      const off = await call(blobPath(A, blob.sha), { method: 'PUT', token, body: blob.bytes });
      expect(off.status).toBe(401);
      const on = await callWithEnv({ AUTH_EMULATOR: 'true' }, blobPath(A, blob.sha), {
        method: 'PUT',
        token,
        headers: { 'content-length': String(blob.bytes.length) },
        body: blob.bytes
      });
      expect(on.status).toBe(201);
    });
  });

  // ---------- conhecer sha256 / chave R2 / upload_id nao concede autorizacao ----------
  describe('isolamento entre escopos: conhecimento do hash ou do upload_id nao autoriza', () => {
    const srcBody = JSON.stringify({ kind: 'drive', sourceId: 'iso-x' });
    beforeAll(async () => {
      tokens.zed = await mintToken(keys, { uid: 'zed' });
      await seed('churches/igreja-a/members/zed', { role: 'sound_tech', status: 'active', displayName: 'z' });
      await seed('churches/igreja-b/members/zed', { role: 'sound_tech', status: 'active', displayName: 'z' });
    });

    const dbRows = async (sql: string, ...args: unknown[]) =>
      (await env.REGISTRY.prepare(sql).bind(...args).all()).results;

    it('igreja B (tecb) sabendo o sha de um blob da A: HEAD, GET, PUT, origem, multipart e DELETE negados; nada muda', async () => {
      const blob = await makeBlob(1500);
      await seed('churches/igreja-a/library/song-iso', { title: 'iso' });
      await seed('churches/igreja-a/library/song-iso/versions/v1', { stems: [{ sha256: blob.sha }] });
      expect((await upload(tokens.zed!, A, blob)).status).toBe(201);

      const tb = tokens.tecb!;
      expect((await call(blobPath(A, blob.sha), { method: 'HEAD', token: tb })).status).toBe(403);
      expect((await download(tb, A, blob.sha, 'song-iso')).status).toBe(403);
      expect((await upload(tb, A, blob)).status).toBe(403);
      expect((await call(blobPath(A, blob.sha, '/sources'), { method: 'POST', token: tb, body: srcBody })).status).toBe(403);
      expect(
        (await call(blobPath(A, blob.sha, '/multipart'), { method: 'POST', token: tb, body: JSON.stringify({ size: 10 }) })).status
      ).toBe(403);
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tb })).status).toBe(403);

      expect(await dbRows('SELECT 1 FROM blobs WHERE sha256 = ?1', blob.sha)).toHaveLength(1);
      expect(await dbRows('SELECT 1 FROM sources WHERE source_id = ?1', 'iso-x')).toHaveLength(0);
      expect(await env.STEMS.head(`churches/igreja-a/blobs/${blob.sha}`)).not.toBeNull();
    });

    it('registrar/reaproveitar na B um sha que so existe na A exige bytes reais: sem vinculo por hash (sources 404, PUT errado 400, multipart cria upload proprio)', async () => {
      const blob = await makeBlob(1800);
      expect((await upload(tokens.zed!, A, blob)).status).toBe(201);

      // alice escreve em A e em B: conhecer o hash nao cria vinculo na B
      expect((await call(blobPath(B, blob.sha, '/sources'), { method: 'POST', token: tokens.zed!, body: srcBody })).status).toBe(404);
      expect((await call(blobPath(B, blob.sha), { method: 'HEAD', token: tokens.zed! })).status).toBe(404);
      await seed('churches/igreja-b/library/song-iso', { title: 'iso' });
      await seed('churches/igreja-b/library/song-iso/versions/v1', { stems: [{ sha256: blob.sha }] });
      expect((await download(tokens.zed!, B, blob.sha, 'song-iso')).status).toBe(403);
      // PUT na B com bytes que nao sao os do hash: nao deduplica, nao registra
      const wrong = await call(blobPath(B, blob.sha), { method: 'PUT', token: tokens.zed!, body: randomBytes(1800) });
      expect(wrong.status).toBe(400);
      expect(await dbRows('SELECT 1 FROM blobs WHERE scope = ?1 AND sha256 = ?2', 'church:igreja-b', blob.sha)).toHaveLength(0);
      expect(await env.STEMS.head(`churches/igreja-b/blobs/${blob.sha}`)).toBeNull();
      // multipart na B para o mesmo hash NAO responde already_exists (nao vaza existencia na A)
      const create = await call(blobPath(B, blob.sha, '/multipart'), {
        method: 'POST',
        token: tokens.zed!,
        body: JSON.stringify({ size: 1800 })
      });
      expect(create.status).toBe(201);
      const { uploadId: opened } = (await create.json()) as { uploadId: string };
      await call(blobPath(B, blob.sha, `/multipart/${encodeURIComponent(opened)}`), { method: 'DELETE', token: tokens.zed! });
      // so o upload real (bytes corretos) cria o vinculo na B, e vem com sha conferido pelo R2
      const real = await call(blobPath(B, blob.sha), { method: 'PUT', token: tokens.zed!, body: blob.bytes });
      expect(real.status).toBe(201);
      expect(await real.json()).toMatchObject({ existed: false, integrity: 'r2-sha256' });
    });

    it('upload_id aberto na A: outro uid, musico, tecnico da B e o proprio uid apontando a rota B nao completam, enviam parte nem abortam', async () => {
      const bytes = randomBytes(4096);
      const sha = await sha256Hex(bytes);
      const create = await call(blobPath(A, sha, '/multipart'), { method: 'POST', token: tokens.zed!, body: JSON.stringify({ size: bytes.length }) });
      expect(create.status).toBe(201);
      const { uploadId } = (await create.json()) as { uploadId: string };
      const id = encodeURIComponent(uploadId);
      const part = await call(blobPath(A, sha, `/multipart/${id}/1`), { method: 'PUT', token: tokens.zed!, body: bytes });
      const etag = ((await part.json()) as { etag: string }).etag;
      const completeBody = JSON.stringify({ parts: [{ partNumber: 1, etag }] });

      const attempts: Array<[string, string, string]> = [
        ['tecb', A, 'tecnico da B na rota A'],
        ['bob', A, 'musico da A'],
        ['adm', A, 'admin da A mas outro uid'],
        ['zed', B, 'dono do upload, mas rota B (sem upload la)'],
        ['tecb', B, 'tecnico da B na rota B']
      ];
      for (const [who, scope, label] of attempts) {
        const t = tokens[who]!;
        const done = await call(blobPath(scope, sha, `/multipart/${id}/complete`), { method: 'POST', token: t, body: completeBody });
        expect([403, 404], `complete: ${label}`).toContain(done.status);
        const put = await call(blobPath(scope, sha, `/multipart/${id}/2`), { method: 'PUT', token: t, body: bytes });
        expect([403, 404], `parte: ${label}`).toContain(put.status);
        const abort = await call(blobPath(scope, sha, `/multipart/${id}`), { method: 'DELETE', token: t });
        expect([403, 404], `abort: ${label}`).toContain(abort.status);
      }
      // nada foi registrado e o upload do dono continua utilizavel
      expect(await dbRows('SELECT 1 FROM blobs WHERE sha256 = ?1', sha)).toHaveLength(0);
      expect(await dbRows('SELECT 1 FROM uploads WHERE upload_id = ?1', uploadId)).toHaveLength(1);
      const ok = await call(blobPath(A, sha, `/multipart/${id}/complete`), { method: 'POST', token: tokens.zed!, body: completeBody });
      expect(ok.status).toBe(201);
    });

    it('upload_id desconhecido e upload_id de outra pessoa dao a mesma resposta (nao vaza existencia)', async () => {
      const bytes = randomBytes(2048);
      const sha = await sha256Hex(bytes);
      const create = await call(blobPath(A, sha, '/multipart'), { method: 'POST', token: tokens.zed!, body: JSON.stringify({ size: bytes.length }) });
      const { uploadId } = (await create.json()) as { uploadId: string };
      const body = JSON.stringify({ parts: [{ partNumber: 1, etag: 'x' }] });
      // adm e membro ativo (admin) da A com permissao de escrita: so nao e dono do upload
      const foreign = await call(blobPath(A, sha, `/multipart/${encodeURIComponent(uploadId)}/complete`), { method: 'POST', token: tokens.adm!, body });
      const unknown = await call(blobPath(A, sha, `/multipart/${encodeURIComponent('nao-existe-123')}/complete`), { method: 'POST', token: tokens.adm!, body });
      expect(foreign.status).toBe(unknown.status);
      expect(await foreign.json()).toEqual(await unknown.json());
    });

    it('catalogo x igreja: membro (mesmo admin da igreja) nao escreve no catalogo; curador nao escreve em igreja so por ser curador', async () => {
      const blob = await makeBlob(900);
      expect((await upload(tokens.adm!, CATALOG, blob)).status).toBe(403);
      expect((await upload(tokens.zed!, CATALOG, blob)).status).toBe(403);
      expect((await upload(tokens.cura!, A, blob)).status).toBe(403);
      expect((await call(blobPath(CATALOG, blob.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(403);
      expect(await dbRows('SELECT 1 FROM blobs WHERE sha256 = ?1', blob.sha)).toHaveLength(0);
    });

    it('papeis: musico, pendente e sem papel nao escrevem; sound_tech/leader/admin escrevem; so admin exclui', async () => {
      const blob = await makeBlob(700);
      for (const who of ['bob', 'dave', 'carol', 'eve']) expect((await upload(tokens[who]!, A, blob)).status, who).toBe(403);
      expect((await upload(tokens.zed!, A, blob)).status).toBe(201); // sound_tech
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens.zed! })).status).toBe(403); // so admin exclui
      expect((await call(blobPath(A, blob.sha), { method: 'DELETE', token: tokens.adm! })).status).toBe(204);
    });
  });});
