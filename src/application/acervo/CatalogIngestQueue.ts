import { StemType } from '../../domain/entities/TrackStem';
import { catalogIds, ManifestEntry } from '../../domain/services/CatalogPackage';

/**
 * Fila de envio da biblioteca pública (docs/architecture/biblioteca-publica.md, seção 3).
 * Uma entrada por música. "Salvar no acervo" envia, confere e grava a versão (fica "pronto para publicar");
 * "Publicar" é outro passo, conferido pelo Worker. Nada aqui toca o áudio: o arquivo sobe como veio.
 */

export type FileStatus = 'pendente' | 'calculando' | 'enviando' | 'conferindo' | 'conferido' | 'falhou' | 'aguardando_arquivo';

export type ItemStatus =
  | 'revisao' // metadados e funções para revisar antes de enviar
  | 'enviando'
  | 'verificando'
  | 'pausado'
  | 'pronto' // arquivos conferidos e versão gravada: pronto para publicar
  | 'publicando'
  | 'publicado'
  | 'falhou'
  | 'aguardando_arquivos'; // a página recarregou: selecione os arquivos de novo para continuar

export type RightsClass = 'own' | 'licensed_redistributable' | 'unknown';

export interface MultipartResumeState {
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; etag: string; size: number }[];
}

export interface IngestFile {
  /** nome + tamanho: como o arquivo é reconhecido quando a pessoa o seleciona de novo */
  key: string;
  name: string;
  size: number;
  contentType: string;
  type: StemType;
  durationSec?: number;
  sha256?: string;
  sent: number;
  status: FileStatus;
  error?: string;
  /** falha temporária (tentar de novo continua) x definitiva (precisa mudar algo) */
  errorKind?: 'transient' | 'definitive';
  resume?: MultipartResumeState | null;
}

export interface IngestItem {
  id: string;
  sourceKind: 'zip' | 'stems';
  sourceLabel: string;
  /** chave do .zip de origem (nome + tamanho), para reconhecer o pacote na retomada */
  sourceKey?: string;
  title: string;
  artist: string;
  key: string | null;
  keyOrigin: 'name' | 'manual' | 'unknown';
  bpm: number | null;
  rightsClass: RightsClass;
  licenseHolder: string;
  licenseDocument: string;
  files: IngestFile[];
  status: ItemStatus;
  error?: string;
  songId?: string;
  versionId?: string;
  manifestSha256?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadOutcome {
  integrity: 'r2-sha256' | 'client-declared';
  existed: boolean;
}

export interface IngestUploader {
  exists(sha256: string, signal?: AbortSignal): Promise<boolean>;
  /** Conferência do conteúdo pelo próprio R2 (idempotente). */
  verify(sha256: string, signal?: AbortSignal): Promise<'r2-sha256'>;
  upload(
    blob: Blob,
    sha256: string,
    options: {
      name: string;
      contentType: string;
      resume?: MultipartResumeState | null;
      signal?: AbortSignal;
      onProgress?: (sent: number, total: number) => void;
      onResumeState?: (state: MultipartResumeState | null) => void;
    }
  ): Promise<UploadOutcome>;
  abort(sha256: string, uploadId: string): Promise<void>;
}

export interface VersionStemInput {
  sha256: string;
  name: string;
  type: StemType;
  size: number;
  contentType: string;
  durationSec?: number;
}

export interface SaveVersionInput {
  songId: string;
  versionId: string;
  title: string;
  artist: string;
  key: string | null;
  keyOrigin: IngestItem['keyOrigin'];
  bpm: number | null;
  durationSec: number;
  rightsClass: RightsClass;
  licenseHolder: string;
  licenseDocument: string;
  stems: VersionStemInput[];
}

export interface CatalogWriter {
  /** Idempotente: versão existente não é regravada; música existente é atualizada. */
  saveVersion(input: SaveVersionInput): Promise<void>;
  publish(songId: string, versionId: string): Promise<{ manifestSha256: string }>;
  withdraw(songId: string): Promise<void>;
}

export interface IngestStore {
  load(): Promise<IngestItem[]>;
  save(item: IngestItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export type Hasher = (blob: Blob, onProgress?: (read: number, total: number) => void) => Promise<string>;

export interface NewFile {
  name: string;
  size: number;
  blob: Blob;
  contentType: string;
  type: StemType;
  durationSec?: number;
}

export interface NewItem {
  sourceKind: 'zip' | 'stems';
  sourceLabel: string;
  sourceKey?: string;
  title: string;
  artist: string;
  key: string | null;
  bpm: number | null;
  files: NewFile[];
}

export const fileKey = (name: string, size: number): string => `${name}\u0000${size}`;

const ERRORS: Record<string, string> = {
  bpm_pending: 'BPM pendente: informe o BPM antes de publicar.',
  rights_missing: 'Faltam os direitos de redistribuição (classe, titular e documento).',
  not_verified: 'Há arquivo ainda não conferido pelo servidor.',
  blob_missing: 'Há arquivo da versão que não está no acervo.',
  size_mismatch: 'Um arquivo no acervo tem tamanho diferente do da versão.',
  no_band_stem: 'A música precisa de ao menos um stem de banda (além de click e guia).',
  no_stems: 'A música não tem stems.'
};

export function describePublishError(code: string): string {
  return ERRORS[code] ?? `Publicação recusada (${code}).`;
}

/** O que impede salvar no acervo; vazio = pode salvar. Tom e BPM desconhecidos não impedem salvar. */
export function saveBlockers(item: IngestItem): string[] {
  const out: string[] = [];
  if (!item.title.trim()) out.push('Informe o título.');
  if (item.files.length === 0) out.push('Nenhum stem.');
  if (item.files.length > 64) out.push('Mais de 64 stems.');
  if (item.rightsClass === 'unknown') out.push('Escolha a classe de direitos (próprio ou licenciado).');
  if (!item.licenseHolder.trim()) out.push('Informe o titular dos direitos.');
  if (!item.licenseDocument.trim()) out.push('Informe o documento ou referência da licença.');
  if (!item.files.some((f) => f.type !== 'click' && f.type !== 'guide')) out.push('Marque ao menos um stem de banda (além de click e guia).');
  return out;
}

const FILE_CONCURRENCY = 2;

/**
 * Orquestra as músicas da fila. Os arquivos (Blob) ficam só na memória desta página; o resto (metadados,
 * hashes, partes recebidas) vai para o IngestStore, então uma recarga continua de onde parou depois
 * que a pessoa seleciona os arquivos de novo.
 */
export class CatalogIngestQueue {
  private items: IngestItem[] = [];
  private readonly blobs = new Map<string, Blob>();
  private readonly running = new Map<string, AbortController>();
  private readonly listeners = new Set<(items: IngestItem[]) => void>();
  private persistTimer: Record<string, ReturnType<typeof setTimeout>> = {};

  constructor(
    private readonly uploader: IngestUploader,
    private readonly writer: CatalogWriter,
    private readonly store: IngestStore,
    private readonly hash: Hasher,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  private restoring: Promise<IngestItem[]> | null = null;

  /**
   * Traz a fila gravada no aparelho. Idempotente, e nunca sobrescreve o que já está em memória
   * (música adicionada nesta carga da página, com os arquivos selecionados).
   */
  public restore(): Promise<IngestItem[]> {
    this.restoring ??= this.store.load().then((saved) => {
      const known = new Set(this.items.map((i) => i.id));
      const restored = saved
        .filter((item) => !known.has(item.id))
        .map((item) => {
          // Sem os arquivos desta carga da página: o que não terminou espera a nova seleção.
          const files = item.files.map((f) =>
            f.status === 'conferido' ? f : { ...f, status: 'aguardando_arquivo' as FileStatus, error: undefined }
          );
          const busy = ['enviando', 'verificando', 'pausado', 'falhou'].includes(item.status);
          const needsFiles = files.some((f) => f.status === 'aguardando_arquivo');
          const status: ItemStatus = item.status === 'publicando' ? 'pronto' : needsFiles && busy ? 'aguardando_arquivos' : item.status;
          return { ...item, files, status };
        });
      this.items = [...restored, ...this.items];
      this.emit();
      return this.snapshot();
    });
    return this.restoring;
  }

  public snapshot(): IngestItem[] {
    return this.items.map((i) => ({ ...i, files: i.files.map((f) => ({ ...f })) }));
  }

  public subscribe(fn: (items: IngestItem[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private find(id: string): IngestItem {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error('Música não está mais na fila.');
    return item;
  }

  private async persist(item: IngestItem): Promise<void> {
    item.updatedAt = this.now();
    await this.store.save(item);
  }

  /** Progresso muda muito rápido: grava no máximo a cada 1 s (estado de retomada vai junto). */
  private persistSoon(item: IngestItem): void {
    if (this.persistTimer[item.id]) return;
    this.persistTimer[item.id] = setTimeout(() => {
      delete this.persistTimer[item.id];
      void this.store.save(item).catch(() => undefined);
    }, 1000);
  }

  private change(item: IngestItem, patch: Partial<IngestItem>): void {
    Object.assign(item, patch);
    this.emit();
  }

  public async add(input: NewItem): Promise<IngestItem> {
    const at = this.now();
    const item: IngestItem = {
      id: this.newId(),
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      sourceKey: input.sourceKey,
      title: input.title,
      artist: input.artist,
      key: input.key,
      keyOrigin: input.key ? 'name' : 'unknown',
      bpm: input.bpm,
      rightsClass: 'unknown',
      licenseHolder: '',
      licenseDocument: '',
      files: input.files.map((f) => ({
        key: fileKey(f.name, f.size),
        name: f.name,
        size: f.size,
        contentType: f.contentType,
        type: f.type,
        durationSec: f.durationSec,
        sent: 0,
        status: 'pendente'
      })),
      status: 'revisao',
      createdAt: at,
      updatedAt: at
    };
    for (const f of input.files) this.blobs.set(`${item.id}/${fileKey(f.name, f.size)}`, f.blob);
    this.items.push(item);
    await this.persist(item);
    this.emit();
    return item;
  }

  /**
   * Reaproveita a nova seleção: liga cada arquivo ao stem com o mesmo nome e tamanho.
   * Devolve quantos stems ainda faltam.
   */
  public async attachFiles(id: string, files: { name: string; size: number; blob: Blob }[]): Promise<number> {
    const item = this.find(id);
    for (const f of files) {
      const target = item.files.find((x) => x.key === fileKey(f.name, f.size));
      if (!target) continue;
      this.blobs.set(`${item.id}/${target.key}`, f.blob);
      if (target.status === 'aguardando_arquivo') target.status = 'pendente';
    }
    const missing = item.files.filter((f) => f.status === 'aguardando_arquivo').length;
    if (missing === 0 && item.status === 'aguardando_arquivos') item.status = 'pausado';
    await this.persist(item);
    this.emit();
    return missing;
  }

  public async update(id: string, patch: Partial<Pick<IngestItem, 'title' | 'artist' | 'key' | 'keyOrigin' | 'bpm' | 'rightsClass' | 'licenseHolder' | 'licenseDocument'>>): Promise<void> {
    const item = this.find(id);
    Object.assign(item, patch);
    // Metadado mudou depois de salvo: precisa salvar de novo antes de publicar a mudança.
    if (item.status === 'pronto' || item.status === 'publicado') item.status = 'revisao';
    await this.persist(item);
    this.emit();
  }

  public async setStemType(id: string, key: string, type: StemType): Promise<void> {
    const item = this.find(id);
    const file = item.files.find((f) => f.key === key);
    if (!file) return;
    file.type = type;
    if (item.status === 'pronto' || item.status === 'publicado') item.status = 'revisao';
    await this.persist(item);
    this.emit();
  }

  public isRunning(id: string): boolean {
    return this.running.has(id);
  }

  /** Salvar no acervo: envia o que falta, confere cada arquivo e grava a versão. Repetível. */
  public async save(id: string): Promise<void> {
    const item = this.find(id);
    if (this.running.has(id)) return;
    const blockers = saveBlockers(item);
    if (blockers.length > 0) {
      this.change(item, { status: 'falhou', error: blockers.join(' ') });
      await this.persist(item);
      return;
    }
    const missing = item.files.filter((f) => f.status !== 'conferido' && !this.blobs.has(`${item.id}/${f.key}`));
    if (missing.length > 0) {
      for (const f of missing) f.status = 'aguardando_arquivo';
      this.change(item, { status: 'aguardando_arquivos', error: `Selecione de novo: ${missing.map((f) => f.name).join(', ')}.` });
      await this.persist(item);
      return;
    }

    const controller = new AbortController();
    this.running.set(id, controller);
    this.change(item, { status: 'enviando', error: undefined });
    await this.persist(item);
    try {
      const queue = item.files.filter((f) => f.status !== 'conferido');
      const failures: unknown[] = [];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          if (controller.signal.aborted) return;
          try {
            await this.sendFile(item, f, controller.signal);
          } catch (err) {
            failures.push(err);
          }
        }
      };
      await Promise.all(Array.from({ length: FILE_CONCURRENCY }, worker));
      if (controller.signal.aborted) return;
      if (failures.length > 0) {
        const definitive = item.files.some((f) => f.status === 'falhou' && f.errorKind === 'definitive');
        this.change(item, {
          status: 'falhou',
          error: definitive
            ? 'Algum arquivo foi recusado pelo acervo. Veja o motivo no arquivo.'
            : 'Falha temporária no envio. Tente de novo: o que já subiu é aproveitado.'
        });
        return;
      }

      this.change(item, { status: 'verificando' });
      const stems: VersionStemInput[] = item.files.map((f) => ({
        sha256: f.sha256!,
        name: f.name,
        type: f.type,
        size: f.size,
        contentType: f.contentType,
        ...(f.durationSec ? { durationSec: f.durationSec } : {})
      }));
      const manifest: ManifestEntry[] = stems.map((s) => ({ sha256: s.sha256, name: s.name, type: s.type, size: s.size }));
      const { songId, versionId } = await catalogIds(manifest);
      await this.writer.saveVersion({
        songId,
        versionId,
        title: item.title.trim(),
        artist: item.artist.trim(),
        key: item.key,
        keyOrigin: item.keyOrigin,
        bpm: item.bpm,
        durationSec: Math.max(0, ...item.files.map((f) => f.durationSec ?? 0)),
        rightsClass: item.rightsClass,
        licenseHolder: item.licenseHolder.trim(),
        licenseDocument: item.licenseDocument.trim(),
        stems
      });
      this.change(item, { status: 'pronto', songId, versionId, error: undefined });
    } catch (err) {
      if (!controller.signal.aborted) {
        this.change(item, { status: 'falhou', error: `Não foi possível gravar a música: ${err instanceof Error ? err.message : String(err)}` });
      }
    } finally {
      this.running.delete(id);
      await this.persist(item);
      this.emit();
    }
  }

  private async sendFile(item: IngestItem, f: IngestFile, signal: AbortSignal): Promise<void> {
    const blob = this.blobs.get(`${item.id}/${f.key}`)!;
    f.error = undefined;
    f.errorKind = undefined;
    try {
      if (!f.sha256) {
        f.status = 'calculando';
        this.emit();
        f.sha256 = await this.hash(blob);
        await this.persist(item);
      }
      const sha = f.sha256;
      f.status = 'enviando';
      this.emit();
      // Arquivo já no acervo (mesmo conteúdo): não sobe de novo, só confere.
      let declared = true;
      if (!f.resume && (await this.uploader.exists(sha, signal))) {
        f.sent = f.size;
      } else {
        const outcome = await this.uploader.upload(blob, sha, {
          name: f.name,
          contentType: f.contentType,
          resume: f.resume ?? null,
          signal,
          onProgress: (sent) => {
            f.sent = sent;
            this.emit();
          },
          onResumeState: (state) => {
            f.resume = state;
            this.persistSoon(item);
          }
        });
        declared = outcome.integrity === 'client-declared';
      }
      if (declared) {
        f.status = 'conferindo';
        this.emit();
        await this.uploader.verify(sha, signal);
      }
      f.status = 'conferido';
      f.sent = f.size;
      f.resume = null;
      await this.persist(item);
      this.emit();
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      if (kind === 'cancelled' || signal.aborted) {
        f.status = 'pendente';
        throw err;
      }
      f.status = 'falhou';
      f.errorKind = kind === 'definitive' ? 'definitive' : 'transient';
      f.error = err instanceof Error ? err.message : String(err);
      // Conteúdo não conferiu: o hash é recalculado no próximo envio.
      if ((err as { code?: string }).code === 'sha256_mismatch') f.sha256 = undefined;
      await this.persist(item);
      this.emit();
      throw err;
    }
  }

  /** Pausa: interrompe sem descartar nada (as partes recebidas ficam para continuar). */
  public async pause(id: string): Promise<void> {
    const item = this.find(id);
    this.running.get(id)?.abort();
    this.running.delete(id);
    for (const f of item.files) if (f.status === 'enviando' || f.status === 'calculando' || f.status === 'conferindo') f.status = 'pendente';
    this.change(item, { status: 'pausado', error: undefined });
    await this.persist(item);
  }

  /** Cancelar: interrompe, descarta as partes enviadas no R2 e tira a música da fila. */
  public async cancel(id: string): Promise<void> {
    const item = this.find(id);
    this.running.get(id)?.abort();
    this.running.delete(id);
    for (const f of item.files) {
      if (f.resume && f.sha256) await this.uploader.abort(f.sha256, f.resume.uploadId).catch(() => undefined);
    }
    await this.forget(id);
  }

  /** Tira da fila (não mexe no acervo). */
  public async forget(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    for (const key of [...this.blobs.keys()]) if (key.startsWith(`${id}/`)) this.blobs.delete(key);
    await this.store.remove(id);
    this.emit();
  }

  /** Publicar: só depois de salvo; quem confere arquivos e manifesto é o Worker. Repetível. */
  public async publish(id: string): Promise<void> {
    const item = this.find(id);
    if (!item.songId || !item.versionId || (item.status !== 'pronto' && item.status !== 'publicado' && item.status !== 'falhou')) {
      throw new Error('Salve no acervo antes de publicar.');
    }
    this.change(item, { status: 'publicando', error: undefined });
    try {
      const { manifestSha256 } = await this.writer.publish(item.songId, item.versionId);
      this.change(item, { status: 'publicado', manifestSha256 });
    } catch (err) {
      const code = (err as { code?: string }).code;
      this.change(item, { status: 'pronto', error: code ? describePublishError(code) : err instanceof Error ? err.message : String(err) });
    } finally {
      await this.persist(item);
      this.emit();
    }
  }
}
