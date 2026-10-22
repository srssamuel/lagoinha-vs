import { LibraryScope } from '../../application/ports/SongLibraryPort';
import { IdTokenProvider, SINGLE_PUT_LIMIT } from './R2WorkerStemStore';

/** Partes iguais (o R2 exige) e pequenas o bastante para repetir uma parte sem custo grande. */
export const PART_SIZE = 32 * 1024 * 1024;

/** O que foi recebido de um multipart: guardado no aparelho para retomar em outra carga da página. */
export interface MultipartResume {
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; etag: string; size: number }[];
}

export type Integrity = 'r2-sha256' | 'client-declared';

/**
 * transient: rede, 5xx, 429, 408, 409 in_progress — tentar de novo continua de onde parou;
 * definitive: o servidor recusou (4xx) — tentar de novo sem mudar nada não resolve;
 * cancelled: a pessoa parou (pausa ou cancelamento; quem chama decide se aborta o multipart).
 */
export type UploadErrorKind = 'transient' | 'definitive' | 'cancelled';

export class UploadError extends Error {
  constructor(
    public readonly kind: UploadErrorKind,
    message: string,
    public readonly status = 0,
    public readonly code = ''
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface SendRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Blob | string;
  signal?: AbortSignal;
  onUploadProgress?: (loaded: number) => void;
}

export interface SendResponse {
  status: number;
  text: string;
}

export type Sender = (req: SendRequest) => Promise<SendResponse>;

/** XHR no navegador: é o único jeito de saber quantos bytes já subiram de um PUT. */
export const xhrSender: Sender = (req) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(req.method, req.url);
    for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v);
    if (req.onUploadProgress) xhr.upload.onprogress = (e) => req.onUploadProgress?.(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new TypeError('falha de rede'));
    xhr.ontimeout = () => reject(new TypeError('tempo esgotado'));
    xhr.onabort = () => reject(new DOMException('cancelado', 'AbortError'));
    if (req.signal) {
      if (req.signal.aborted) return xhr.abort();
      req.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(req.body ?? null);
  });

export interface UploadOptions {
  scope: LibraryScope;
  name?: string;
  contentType?: string;
  resume?: MultipartResume | null;
  signal?: AbortSignal;
  /** Bytes já confirmados pelo servidor + bytes em trânsito. */
  onProgress?: (sent: number, total: number) => void;
  /** Chamado a cada parte confirmada: quem chama grava no aparelho. */
  onResumeState?: (state: MultipartResume | null) => void;
}

export interface UploadResult {
  integrity: Integrity;
  /** O arquivo já estava no acervo (nada foi enviado). */
  existed: boolean;
}

export interface UploadClientOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  partConcurrency?: number;
  sleep?: (ms: number) => Promise<void>;
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

function scopePath(scope: LibraryScope): string {
  return scope.kind === 'global' ? 'catalog' : `churches/${encodeURIComponent(scope.churchId)}`;
}

function errorCode(text: string): string {
  try {
    return ((JSON.parse(text) as { error?: string }).error ?? '').slice(0, 60);
  } catch {
    return '';
  }
}

/**
 * Envio confiável para o Worker de stems: tentativas limitadas com espera crescente, partes do multipart
 * em paralelo limitado, retomada pelas partes que o SERVIDOR diz ter recebido (com etag) e conferência
 * do multipart pelo próprio R2 (`verify`). Falha transitória nunca aborta o multipart: só o cancelamento.
 */
export class WorkerUploadClient {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly partConcurrency: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly baseUrl: string,
    private readonly idToken: IdTokenProvider,
    private readonly send: Sender = xhrSender,
    options: UploadClientOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.partConcurrency = options.partConcurrency ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private url(scope: LibraryScope, sha256: string, suffix = ''): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/v1/${scopePath(scope)}/blobs/${sha256}${suffix}`;
  }

  /** Uma requisição com as tentativas: devolve a resposta final (2xx ou 4xx definitivo) ou lança. */
  private async request(req: Omit<SendRequest, 'headers'> & { headers?: Record<string, string> }, accept: number[] = []): Promise<SendResponse> {
    let lastError = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (req.signal?.aborted) throw new UploadError('cancelled', 'Envio interrompido.');
      const token = await this.idToken();
      if (!token) throw new UploadError('definitive', 'Sessão expirada: entre de novo.', 401);
      let res: SendResponse;
      try {
        res = await this.send({ ...req, headers: { authorization: `Bearer ${token}`, ...(req.headers ?? {}) } });
      } catch (err) {
        if (req.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          throw new UploadError('cancelled', 'Envio interrompido.');
        }
        lastError = 'sem conexão com o acervo';
        await this.backoff(attempt, req.signal);
        continue;
      }
      if ((res.status >= 200 && res.status < 300) || accept.includes(res.status)) return res;
      const code = errorCode(res.text);
      if (TRANSIENT.has(res.status) || (res.status === 409 && code === 'in_progress') || res.status === 401) {
        // 401: o token venceu no meio; a próxima volta pega um novo
        lastError = `acervo respondeu ${res.status}${code ? ` (${code})` : ''}`;
        await this.backoff(attempt, req.signal, res.status === 429 ? 4 : 1);
        continue;
      }
      throw new UploadError('definitive', `O acervo recusou (${res.status}${code ? `: ${code}` : ''}).`, res.status, code);
    }
    throw new UploadError('transient', `Falha temporária: ${lastError}. Tente de novo; o que já subiu é aproveitado.`);
  }

  private async backoff(attempt: number, signal?: AbortSignal, factor = 1): Promise<void> {
    if (attempt >= this.maxAttempts) return;
    await this.sleep(this.baseDelayMs * factor * 2 ** (attempt - 1));
    if (signal?.aborted) throw new UploadError('cancelled', 'Envio interrompido.');
  }

  /** O arquivo já está registrado no acervo (conferido ou não)? A integridade sai de `verify`. */
  public async exists(scope: LibraryScope, sha256: string, signal?: AbortSignal): Promise<boolean> {
    const res = await this.request({ method: 'HEAD', url: this.url(scope, sha256), signal }, [404]);
    return res.status === 200;
  }

  /** HEAD não traz corpo: a integridade vem da conferência (idempotente, rápida quando já conferido). */
  public async verify(scope: LibraryScope, sha256: string, signal?: AbortSignal): Promise<Integrity> {
    const res = await this.request({ method: 'POST', url: this.url(scope, sha256, '/verify'), signal }, [422]);
    if (res.status === 422) {
      throw new UploadError('definitive', 'O conteúdo recebido não confere com o arquivo (sha256). Envie de novo.', 422, 'sha256_mismatch');
    }
    return 'r2-sha256';
  }

  public async upload(blob: Blob, sha256: string, options: UploadOptions): Promise<UploadResult> {
    const { scope, signal } = options;
    const total = blob.size;
    const meta: Record<string, string> = { 'content-type': options.contentType || blob.type || 'application/octet-stream' };
    if (options.name) meta['x-original-name'] = encodeURIComponent(options.name.slice(0, 255));

    if (total <= SINGLE_PUT_LIMIT) {
      options.onProgress?.(0, total);
      const res = await this.request({
        method: 'PUT',
        url: this.url(scope, sha256),
        headers: meta,
        body: blob,
        signal,
        onUploadProgress: (loaded) => options.onProgress?.(Math.min(loaded, total), total)
      });
      options.onProgress?.(total, total);
      const body = JSON.parse(res.text || '{}') as { existed?: boolean };
      return { integrity: 'r2-sha256', existed: body.existed === true };
    }
    return this.multipart(blob, sha256, meta, options);
  }

  private async openMultipart(scope: LibraryScope, sha256: string, meta: Record<string, string>, size: number, signal?: AbortSignal) {
    const res = await this.request(
      {
        method: 'POST',
        url: this.url(scope, sha256, '/multipart'),
        headers: { ...meta, 'content-type': 'application/json' },
        body: JSON.stringify({ size, contentType: meta['content-type'] }),
        signal
      },
      [409]
    );
    if (res.status === 409) return null; // já registrado no acervo
    return (JSON.parse(res.text) as { uploadId: string }).uploadId;
  }

  /** Partes que o servidor confirma ter (fonte da verdade na retomada); null = upload não existe mais. */
  private async serverParts(scope: LibraryScope, sha256: string, uploadId: string, signal?: AbortSignal) {
    const res = await this.request({ method: 'GET', url: this.url(scope, sha256, `/multipart/${encodeURIComponent(uploadId)}`), signal }, [404]);
    if (res.status === 404) return null;
    const body = JSON.parse(res.text) as { parts: { partNumber: number; size: number; etag: string | null }[] };
    return body.parts.filter((p): p is { partNumber: number; size: number; etag: string } => typeof p.etag === 'string' && p.etag !== '');
  }

  private async multipart(blob: Blob, sha256: string, meta: Record<string, string>, options: UploadOptions): Promise<UploadResult> {
    const { scope, signal } = options;
    const total = blob.size;
    const partCount = Math.ceil(total / PART_SIZE);
    const expectedSize = (n: number) => Math.min(PART_SIZE, total - (n - 1) * PART_SIZE);

    let state: MultipartResume | null = null;
    if (options.resume && options.resume.partSize === PART_SIZE) {
      const parts = await this.serverParts(scope, sha256, options.resume.uploadId, signal);
      if (parts) {
        state = {
          uploadId: options.resume.uploadId,
          partSize: PART_SIZE,
          parts: parts.filter((p) => p.partNumber <= partCount && p.size === expectedSize(p.partNumber))
        };
      }
    }
    if (!state) {
      const uploadId = await this.openMultipart(scope, sha256, meta, total, signal);
      if (!uploadId) {
        options.onProgress?.(total, total);
        options.onResumeState?.(null);
        return { integrity: 'client-declared', existed: true };
      }
      state = { uploadId, partSize: PART_SIZE, parts: [] };
    }
    options.onResumeState?.(state);

    const done = new Map(state.parts.map((p) => [p.partNumber, p]));
    const inFlight = new Map<number, number>();
    const report = () => {
      let sent = 0;
      for (const p of done.values()) sent += p.size;
      for (const v of inFlight.values()) sent += v;
      options.onProgress?.(Math.min(sent, total), total);
    };
    report();

    const pending = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    const uploadId = state.uploadId;
    // Uma parte que falha de vez para as outras (sem abortar o multipart: as recebidas ficam para retomar).
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const worker = async () => {
      for (let n = pending.shift(); n !== undefined && !stop.signal.aborted; n = pending.shift()) {
        const start = (n - 1) * PART_SIZE;
        const partNumber = n;
        const res = await this.request({
          method: 'PUT',
          url: this.url(scope, sha256, `/multipart/${encodeURIComponent(uploadId)}/${partNumber}`),
          body: blob.slice(start, start + PART_SIZE),
          signal: stop.signal,
          onUploadProgress: (loaded) => {
            inFlight.set(partNumber, loaded);
            report();
          }
        });
        inFlight.delete(partNumber);
        const { etag } = JSON.parse(res.text) as { etag: string };
        done.set(partNumber, { partNumber, etag, size: expectedSize(partNumber) });
        options.onResumeState?.({ uploadId, partSize: PART_SIZE, parts: [...done.values()].sort((a, b) => a.partNumber - b.partNumber) });
        report();
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(this.partConcurrency, Math.max(1, pending.length)) }, () =>
          worker().catch((err: unknown) => {
            stop.abort();
            throw err;
          })
        )
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    if (signal?.aborted) throw new UploadError('cancelled', 'Envio interrompido.');

    const parts = [...done.values()].sort((a, b) => a.partNumber - b.partNumber).map(({ partNumber, etag }) => ({ partNumber, etag }));
    const res = await this.request(
      {
        method: 'POST',
        url: this.url(scope, sha256, `/multipart/${encodeURIComponent(uploadId)}/complete`),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts }),
        signal
      },
      [409]
    );
    options.onResumeState?.(null);
    // 409 already_exists: outra tentativa (ou outra aba) registrou o mesmo arquivo antes; nada se perde.
    return { integrity: 'client-declared', existed: res.status === 409 };
  }

  /** Cancelamento explícito: descarta as partes no R2. Pausa e falha temporária nunca chamam isto. */
  public async abort(scope: LibraryScope, sha256: string, uploadId: string): Promise<void> {
    await this.request(
      { method: 'DELETE', url: this.url(scope, sha256, `/multipart/${encodeURIComponent(uploadId)}`) },
      [404]
    ).catch(() => undefined);
  }
}
