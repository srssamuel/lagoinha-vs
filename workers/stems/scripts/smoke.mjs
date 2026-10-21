// Fumaca contra o Worker publicado. Nao roda em CI; quem tem login no app gera o ID token.
//
//   WORKER_URL=https://lagoinha-vs-stems.<conta>.workers.dev ^
//   TOKEN_FILE=C:\caminho\idtoken.txt CHURCH_ID=<id-da-igreja> node scripts/smoke.mjs
//
// Variaveis:
//   WORKER_URL   (obrigatoria) base do Worker, sem /v1
//   TOKEN_FILE   (obrigatoria) arquivo com o ID token do Firebase (1 linha). O token nunca e impresso.
//   CHURCH_ID    escopo churches/{id} (padrao); ou SCOPE=catalog para o catalogo (exige curador)
//   SONG_ID, VERSION_ID   versao que JA lista os hashes, para o download; sem elas o download e pulado
//   SMOKE_CREATE_VERSION=1  (so igreja) cria library/smoke-test e uma versao listando os 2 arquivos (via regras, com o
//                           token do usuario) para exercitar o download. Deixa 1 doc de versao por execucao.
//   FIREBASE_PROJECT_ID, FIRESTORE_BASE   so para SMOKE_CREATE_VERSION (padrao: projeto real)
//   MULTIPART_MB  tamanho do arquivo multipart (padrao 120)
//   PART_MB       tamanho de cada parte (padrao 50; entre 5 e 95)
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIB = 1024 * 1024;
const workerUrl = (process.env.WORKER_URL ?? '').replace(/\/+$/, '');
const tokenFile = process.env.TOKEN_FILE ?? '';
if (!workerUrl || !tokenFile) {
  console.error('Defina WORKER_URL e TOKEN_FILE (veja o cabecalho de scripts/smoke.mjs).');
  process.exit(2);
}
const token = (await readFile(tokenFile, 'utf8')).trim();
const scopePath = process.env.SCOPE === 'catalog' ? 'catalog' : `churches/${process.env.CHURCH_ID ?? ''}`;
if (scopePath === 'churches/') {
  console.error('Defina CHURCH_ID (ou SCOPE=catalog).');
  process.exit(2);
}
const multipartMb = Number(process.env.MULTIPART_MB ?? 120);
const partMb = Math.min(95, Math.max(5, Number(process.env.PART_MB ?? 50)));

const auth = { authorization: `Bearer ${token}` };
const timings = [];
let failures = 0;

async function step(name, fn) {
  const started = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - started);
    timings.push({ name, ms });
    console.log(`PASS  ${name.padEnd(46)} ${String(ms).padStart(7)} ms${detail ? `  ${detail}` : ''}`);
    return true;
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    failures += 1;
    console.log(`FAIL  ${name.padEnd(46)} ${String(ms).padStart(7)} ms  ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function expectStatus(response, ...allowed) {
  if (!allowed.includes(response.status)) throw new Error(`status ${response.status}, esperado ${allowed.join('/')}`);
}

const blobUrl = (sha, tail = '') => `${workerUrl}/v1/${scopePath}/blobs/${sha}${tail}`;

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function hashResponse(response) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha: hash.digest('hex'), bytes };
}

async function createVersion(songId, versionId, shas) {
  const base = process.env.FIRESTORE_BASE ?? 'https://firestore.googleapis.com';
  const project = process.env.FIREBASE_PROJECT_ID ?? 'lagoinha-joao-pessoa';
  const docs = `${base}/v1/projects/${project}/databases/(default)/documents`;
  const headers = { ...auth, 'content-type': 'application/json' };
  const str = (stringValue) => ({ stringValue });
  const prefix = scopePath === 'catalog' ? 'catalog' : `${scopePath}/library`;
  if (scopePath !== 'catalog') {
    const song = await fetch(`${docs}/${prefix}/${songId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: { title: str('Fumaca do Worker'), rightsClass: str('unknown') } })
    });
    if (!song.ok) throw new Error(`criar musica de fumaca: ${song.status}`);
  }
  const version = await fetch(`${docs}/${prefix}/${songId}/versions?documentId=${versionId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fields: {
        createdAt: { timestampValue: new Date().toISOString() },
        createdBy: str(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub),
        changelog: str('fumaca'),
        stems: {
          arrayValue: {
            values: shas.map((sha) => ({ mapValue: { fields: { sha256: str(sha), name: str('smoke'), type: str('other') } } }))
          }
        }
      }
    })
  });
  if (!version.ok) throw new Error(`criar versao de fumaca: ${version.status}`);
}

// ---------- execucao ----------

const dir = await mkdtemp(join(tmpdir(), 'lagoinha-stems-smoke-'));
try {
  console.log(`Worker: ${workerUrl}  escopo: ${scopePath}  multipart: ${multipartMb} MB em partes de ${partMb} MB`);

  await step('GET /health', async () => {
    const response = await fetch(`${workerUrl}/health`);
    expectStatus(response, 200);
    return JSON.stringify(await response.json());
  });
  await step('sem token = 401', async () => {
    const response = await fetch(blobUrl('0'.repeat(64)), { method: 'HEAD' });
    expectStatus(response, 401);
  });

  // upload simples
  const small = randomBytes(256 * 1024);
  const smallSha = createHash('sha256').update(small).digest('hex');
  await step('PUT simples (256 KiB)', async () => {
    const response = await fetch(blobUrl(smallSha), {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'audio/wav', 'x-original-name': 'smoke.wav' },
      body: small
    });
    expectStatus(response, 201, 200);
    return `status ${response.status}`;
  });
  await step('PUT com hash errado = 400', async () => {
    const response = await fetch(blobUrl('1'.repeat(64)), { method: 'PUT', headers: auth, body: small });
    expectStatus(response, 400);
  });
  await step('HEAD (tamanho e integridade)', async () => {
    const response = await fetch(blobUrl(smallSha), { method: 'HEAD', headers: auth });
    expectStatus(response, 200);
    if (response.headers.get('content-length') !== String(small.length)) throw new Error('content-length diferente');
    return `x-integrity=${response.headers.get('x-integrity')}`;
  });

  // multipart
  const bigPath = join(dir, 'smoke-multipart.bin');
  const bigSize = multipartMb * MIB;
  {
    const handle = await open(bigPath, 'w');
    try {
      for (let written = 0; written < bigSize; written += 8 * MIB) {
        await handle.write(randomBytes(Math.min(8 * MIB, bigSize - written)));
      }
    } finally {
      await handle.close();
    }
  }
  const bigSha = await hashFile(bigPath);
  let multipartOk = false;
  await step(`multipart ${multipartMb} MB (criar, partes, completar)`, async () => {
    const create = await fetch(blobUrl(bigSha, '/multipart'), {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'x-original-name': 'smoke-multipart.bin' },
      body: JSON.stringify({ size: bigSize, contentType: 'application/octet-stream' })
    });
    expectStatus(create, 201);
    const { uploadId } = await create.json();
    const parts = [];
    const handle = await open(bigPath, 'r');
    try {
      const partBytes = partMb * MIB;
      for (let offset = 0, n = 1; offset < bigSize; offset += partBytes, n += 1) {
        const length = Math.min(partBytes, bigSize - offset);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        const partStarted = performance.now();
        const response = await fetch(blobUrl(bigSha, `/multipart/${encodeURIComponent(uploadId)}/${n}`), {
          method: 'PUT',
          headers: auth,
          body: buffer
        });
        expectStatus(response, 200);
        const { etag } = await response.json();
        parts.push({ partNumber: n, etag });
        const seconds = (performance.now() - partStarted) / 1000;
        console.log(`        parte ${n}: ${(length / MIB).toFixed(0)} MB em ${seconds.toFixed(1)} s (${(length / MIB / seconds).toFixed(1)} MB/s)`);
      }
    } finally {
      await handle.close();
    }
    const done = await fetch(blobUrl(bigSha, `/multipart/${encodeURIComponent(uploadId)}/complete`), {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ parts })
    });
    expectStatus(done, 201);
    multipartOk = true;
    return `${parts.length} partes`;
  });
  if (multipartOk) {
    await step('registrar origem do multipart', async () => {
      const response = await fetch(blobUrl(bigSha, '/sources'), {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'app', sourceId: 'smoke', name: 'smoke-multipart.bin', size: (await stat(bigPath)).size })
      });
      expectStatus(response, 201);
    });
  }

  // download (precisa de uma versao que liste os hashes)
  let songId = process.env.SONG_ID;
  let versionId = process.env.VERSION_ID;
  if (process.env.SMOKE_CREATE_VERSION === '1' && scopePath !== 'catalog') {
    songId = 'smoke-test';
    versionId = `smoke-${smallSha.slice(0, 12)}`;
    await step('criar versao de fumaca no Firestore', () =>
      createVersion(songId, versionId, multipartOk ? [smallSha, bigSha] : [smallSha])
    );
  }
  if (songId && versionId) {
    const query = `?song=${encodeURIComponent(songId)}&version=${encodeURIComponent(versionId)}`;
    await step('GET simples confere o sha256', async () => {
      const response = await fetch(blobUrl(smallSha) + query, { headers: auth });
      expectStatus(response, 200);
      const { sha, bytes } = await hashResponse(response);
      if (sha !== smallSha) throw new Error(`sha256 diferente (${sha})`);
      return `${bytes} bytes`;
    });
    await step('GET com Range (bytes 0-1023)', async () => {
      const response = await fetch(blobUrl(smallSha) + query, { headers: { ...auth, range: 'bytes=0-1023' } });
      expectStatus(response, 206);
      const { sha } = await hashResponse(response);
      if (sha !== createHash('sha256').update(small.subarray(0, 1024)).digest('hex')) throw new Error('faixa diferente');
    });
    if (multipartOk) {
      await step(`GET multipart ${multipartMb} MB confere o sha256`, async () => {
        const response = await fetch(blobUrl(bigSha) + query, { headers: auth });
        expectStatus(response, 200);
        const { sha, bytes } = await hashResponse(response);
        if (sha !== bigSha || bytes !== bigSize) throw new Error(`conteudo diferente (${bytes} bytes, ${sha})`);
        return `${(bytes / MIB).toFixed(0)} MB`;
      });
    }
  } else {
    console.log('SKIP  download: defina SONG_ID e VERSION_ID (versao que liste os hashes) ou SMOKE_CREATE_VERSION=1');
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

const total = timings.reduce((sum, t) => sum + t.ms, 0);
console.log(`\n${failures === 0 ? 'FUMACA OK' : `FUMACA FALHOU (${failures})`}  total ${(total / 1000).toFixed(1)} s`);
process.exit(failures === 0 ? 0 : 1);
