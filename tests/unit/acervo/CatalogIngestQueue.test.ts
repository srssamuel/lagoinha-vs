import { describe, expect, it } from 'vitest';
import {
  CatalogIngestQueue,
  CatalogWriter,
  IngestUploader,
  MultipartResumeState,
  NewItem,
  SaveVersionInput
} from '../../../src/application/acervo/CatalogIngestQueue';
import { MemoryIngestStore } from '../../../src/infrastructure/storage/IndexedDbIngestStore';

const blob = (text: string) => new Blob([text]);
const hash = async (b: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

class FakeUploader implements IngestUploader {
  public readonly stored = new Set<string>();
  public uploads: { sha: string; resume: MultipartResumeState | null }[] = [];
  public verifies: string[] = [];
  public aborts: string[] = [];
  public failNext = 0;

  async exists(sha: string) {
    return this.stored.has(sha);
  }
  async verify(sha: string) {
    this.verifies.push(sha);
    return 'r2-sha256' as const;
  }
  async upload(b: Blob, sha: string, o: { resume?: MultipartResumeState | null; onProgress?: (s: number, t: number) => void; onResumeState?: (s: MultipartResumeState | null) => void }) {
    this.uploads.push({ sha, resume: o.resume ?? null });
    o.onResumeState?.({ uploadId: `up-${sha.slice(0, 4)}`, partSize: 1, parts: [{ partNumber: 1, etag: 'e1', size: 1 }] });
    if (this.failNext > 0) {
      this.failNext--;
      throw Object.assign(new Error('acervo respondeu 503'), { kind: 'transient' });
    }
    o.onProgress?.(b.size, b.size);
    this.stored.add(sha);
    return { integrity: 'client-declared' as const, existed: false };
  }
  async abort(sha: string) {
    this.aborts.push(sha);
  }
}

class FakeWriter implements CatalogWriter {
  public saved: SaveVersionInput[] = [];
  public publishError: string | null = null;
  async saveVersion(input: SaveVersionInput) {
    this.saved.push(input);
  }
  async publish() {
    if (this.publishError) throw Object.assign(new Error('recusado'), { code: this.publishError });
    return { manifestSha256: 'f'.repeat(64) };
  }
  async withdraw() {}
}

function song(title: string, extra = ''): NewItem {
  return {
    sourceKind: 'zip',
    sourceLabel: `${title}.zip`,
    sourceKey: `${title}.zip\u000099`,
    title,
    artist: '',
    key: null,
    bpm: 120,
    files: [
      { name: 'click.wav', size: 5 + extra.length, blob: blob(`click${extra}`), contentType: 'audio/wav', type: 'click' },
      { name: 'bass.wav', size: 4 + title.length, blob: blob(`bass${title}`), contentType: 'audio/wav', type: 'bass' }
    ]
  };
}

const rights = { rightsClass: 'own' as const, licenseHolder: 'Teste', licenseDocument: 'audio gerado' };

function makeQueue(store = new MemoryIngestStore(), uploader = new FakeUploader(), writer = new FakeWriter()) {
  let n = 0;
  return { queue: new CatalogIngestQueue(uploader, writer, store, hash, () => `item${++n}`), store, uploader, writer };
}

describe('CatalogIngestQueue', () => {
  it('vários ZIPs viram músicas independentes, cada uma salva com seus próprios ids', async () => {
    const { queue, writer, uploader } = makeQueue();
    const a = await queue.add(song('Alfa', 'a'));
    const b = await queue.add(song('Beta', 'b'));
    await queue.update(a.id, rights);
    await queue.update(b.id, rights);
    await Promise.all([queue.save(a.id), queue.save(b.id)]);

    const items = queue.snapshot();
    expect(items.map((i) => i.status)).toEqual(['pronto', 'pronto']);
    expect(writer.saved).toHaveLength(2);
    expect(new Set(writer.saved.map((s) => s.songId)).size).toBe(2);
    expect(uploader.verifies).toHaveLength(4); // multipart/declarado: conferido pelo servidor, um por arquivo
    expect(items.every((i) => i.files.every((f) => f.status === 'conferido' && f.sent === f.size))).toBe(true);
  });

  it('não salva sem direitos e explica o porquê (nada some em silêncio)', async () => {
    const { queue, writer } = makeQueue();
    const a = await queue.add(song('Alfa'));
    await queue.save(a.id);
    const item = queue.snapshot()[0]!;
    expect(item.status).toBe('falhou');
    expect(item.error).toMatch(/direitos/);
    expect(writer.saved).toHaveLength(0);
  });

  it('salvar de novo não duplica: mesmos ids, nada é reenviado', async () => {
    const { queue, writer, uploader } = makeQueue();
    const a = await queue.add(song('Alfa'));
    await queue.update(a.id, rights);
    await queue.save(a.id);
    const uploadsBefore = uploader.uploads.length;
    await queue.update(a.id, { title: 'Alfa (revisada)' });
    await queue.save(a.id);
    expect(uploader.uploads.length).toBe(uploadsBefore);
    expect(writer.saved[1]!.songId).toBe(writer.saved[0]!.songId);
    expect(writer.saved[1]!.versionId).toBe(writer.saved[0]!.versionId);
  });

  it('falha temporária: fica "falhou", e tentar de novo continua do estado de retomada', async () => {
    const { queue, uploader } = makeQueue();
    uploader.failNext = 1;
    const a = await queue.add(song('Alfa'));
    await queue.update(a.id, rights);
    await queue.save(a.id);
    let item = queue.snapshot()[0]!;
    expect(item.status).toBe('falhou');
    const failed = item.files.find((f) => f.status === 'falhou')!;
    expect(failed.errorKind).toBe('transient');
    expect(failed.resume?.uploadId).toBeTruthy();

    await queue.save(a.id);
    item = queue.snapshot()[0]!;
    expect(item.status).toBe('pronto');
    const retry = uploader.uploads.filter((u) => u.sha === failed.sha256);
    expect(retry.at(-1)!.resume?.uploadId).toBe(failed.resume!.uploadId);
  });

  it('recarga da página: pede os arquivos de novo, reaproveita o que já foi conferido', async () => {
    const store = new MemoryIngestStore();
    const uploader = new FakeUploader();
    uploader.failNext = 1;
    const first = makeQueue(store, uploader);
    const a = await first.queue.add(song('Alfa'));
    await first.queue.update(a.id, rights);
    await first.queue.save(a.id);
    const conferidos = first.queue.snapshot()[0]!.files.filter((f) => f.status === 'conferido').length;
    expect(conferidos).toBe(1);

    const second = makeQueue(store, uploader);
    const [restored] = await second.queue.restore();
    expect(restored!.status).toBe('aguardando_arquivos');
    const missing = await second.queue.attachFiles(
      restored!.id,
      song('Alfa').files.map((f) => ({ name: f.name, size: f.size, blob: f.blob }))
    );
    expect(missing).toBe(0);
    const uploadsBefore = uploader.uploads.length;
    await second.queue.save(restored!.id);
    expect(second.queue.snapshot()[0]!.status).toBe('pronto');
    expect(uploader.uploads.length - uploadsBefore).toBe(1); // só o que faltava
  });

  it('restore tardio (ou repetido) não apaga a música adicionada nesta carga nem pede os arquivos de novo', async () => {
    const { queue } = makeQueue();
    const pending = queue.restore();
    const a = await queue.add(song('Alfa'));
    await pending;
    await queue.restore();
    const items = queue.snapshot();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(a.id);
    expect(items[0]!.files.every((f) => f.status === 'pendente')).toBe(true);
  });

  it('publicar só depois de salvo; recusa do servidor volta para "pronto" com o motivo', async () => {
    const { queue, writer } = makeQueue();
    const a = await queue.add(song('Alfa'));
    await expect(queue.publish(a.id)).rejects.toThrow(/Salve no acervo/);
    await queue.update(a.id, rights);
    await queue.save(a.id);
    writer.publishError = 'bpm_pending';
    await queue.publish(a.id);
    expect(queue.snapshot()[0]).toMatchObject({ status: 'pronto', error: expect.stringMatching(/BPM/) });
    writer.publishError = null;
    await queue.publish(a.id);
    expect(queue.snapshot()[0]!.status).toBe('publicado');
  });

  it('cancelar descarta as partes do multipart; pausar não', async () => {
    const { queue, uploader } = makeQueue();
    uploader.failNext = 2;
    const a = await queue.add(song('Alfa'));
    await queue.update(a.id, rights);
    await queue.save(a.id);
    await queue.pause(a.id);
    expect(uploader.aborts).toHaveLength(0);
    await queue.cancel(a.id);
    expect(uploader.aborts.length).toBeGreaterThan(0);
    expect(queue.snapshot()).toHaveLength(0);
  });
});
