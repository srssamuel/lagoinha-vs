import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Library,
  LoaderCircle,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Upload,
  X
} from 'lucide-react';
import { CatalogAdminServices, CatalogEntry } from '../../application/acervo/CatalogAdminPort';
import {
  CatalogIngestQueue,
  describePublishError,
  IngestItem,
  ItemStatus,
  NewFile,
  RightsClass,
  saveBlockers
} from '../../application/acervo/CatalogIngestQueue';
import { StemType, TrackStem } from '../../domain/entities/TrackStem';
import { User } from '../../domain/entities/User';
import { isAudioName, parsePackageName, planSelection } from '../../domain/services/CatalogPackage';
import { inferStemType } from '../../domain/services/StemNameClassifier';
import { ZipMultitrackExtractor } from '../../infrastructure/audio/ZipMultitrackExtractor';
import { AuthGate } from '../components/AuthGate';
import { useBackend } from '../BackendContext';

const STEM_TYPES: { value: StemType; label: string }[] = [
  { value: 'click', label: 'Click (só fone)' },
  { value: 'guide', label: 'Guia (só fone)' },
  { value: 'drums', label: 'Bateria' },
  { value: 'loop', label: 'Loop' },
  { value: 'bass', label: 'Baixo' },
  { value: 'violao', label: 'Violão' },
  { value: 'guitars', label: 'Guitarras' },
  { value: 'strings', label: 'Cordas' },
  { value: 'keys', label: 'Teclas' },
  { value: 'pad', label: 'Pad' },
  { value: 'vocals', label: 'Vozes' },
  { value: 'fx', label: 'Efeitos / outro' }
];

const STATUS: Record<ItemStatus, { label: string; tone: string }> = {
  revisao: { label: 'Revisar e salvar', tone: 'text-slate-200 border-slate-500/40 bg-slate-500/10' },
  enviando: { label: 'Enviando', tone: 'text-blue-300 border-blue-500/40 bg-blue-500/10' },
  verificando: { label: 'Verificando', tone: 'text-blue-300 border-blue-500/40 bg-blue-500/10' },
  pausado: { label: 'Pausado', tone: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  pronto: { label: 'Pronto para publicar', tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
  publicando: { label: 'Publicando', tone: 'text-blue-300 border-blue-500/40 bg-blue-500/10' },
  publicado: { label: 'Publicado', tone: 'text-emerald-200 border-emerald-400/60 bg-emerald-500/20' },
  falhou: { label: 'Falhou', tone: 'text-rose-300 border-rose-500/40 bg-rose-500/10' },
  aguardando_arquivos: { label: 'Selecione os arquivos de novo', tone: 'text-amber-300 border-amber-500/40 bg-amber-500/10' }
};

const FILE_STATUS: Record<string, string> = {
  pendente: 'na fila',
  calculando: 'calculando sha256',
  enviando: 'enviando',
  conferindo: 'conferindo no servidor',
  conferido: 'conferido',
  falhou: 'falhou',
  aguardando_arquivo: 'selecione de novo'
};

const RIGHTS_KEY = 'lagoinha-vs:acervo-direitos';

interface RememberedRights {
  rightsClass: RightsClass;
  licenseHolder: string;
  licenseDocument: string;
}

function loadRights(): RememberedRights | null {
  try {
    const raw = localStorage.getItem(RIGHTS_KEY);
    return raw ? (JSON.parse(raw) as RememberedRights) : null;
  } catch {
    return null;
  }
}

function saveRights(r: RememberedRights): void {
  try {
    localStorage.setItem(RIGHTS_KEY, JSON.stringify(r));
  } catch {
    // sem armazenamento: só não pré-preenche na próxima vez
  }
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const baseName = (path: string) => path.replace(/^.*[\\/]/, '');

/** Lê a duração do WAV pelo cabeçalho (sem decodificar o áudio). Outros formatos: desconhecida. */
async function wavDuration(blob: Blob, name: string): Promise<number | undefined> {
  if (!/\.wave?$/i.test(name)) return undefined;
  const head = await blob.slice(0, 256 * 1024).arrayBuffer();
  return ZipMultitrackExtractor.parseWavDurationFromHeader(head, blob.size);
}

/** Classificação do import do player, com o vocabulário em português como reserva; o curador corrige na tabela. */
function stemTypeOf(name: string): StemType {
  const byPlayer = TrackStem.classifyStemFromFilename(name).type;
  return byPlayer === 'fx' ? (inferStemType(name) ?? 'fx') : byPlayer;
}

type Pick = { file: File; relativePath: string };

interface Extraction {
  id: string;
  label: string;
  file: File;
  progress: number;
  total: number;
  error?: string;
}

function ProgressBar({ value, total, tone = 'bg-blue-500' }: { value: number; total: number; tone?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-stage-border/60 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${tone} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-stage-muted">{label}</span>
      {children}
      {hint && <span className="block mt-0.5 text-[11px] text-stage-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  'mt-1 w-full rounded-lg border border-stage-border bg-stage-bg px-2.5 py-1.5 text-sm text-white placeholder:text-stage-muted focus:border-blue-500 outline-none disabled:opacity-60';

function ItemCard({ item, queue, busy }: { item: IngestItem; queue: CatalogIngestQueue; busy: boolean }) {
  const [draft, setDraft] = useState({
    title: item.title,
    artist: item.artist,
    key: item.key ?? '',
    bpm: item.bpm ? String(item.bpm) : '',
    licenseHolder: item.licenseHolder,
    licenseDocument: item.licenseDocument
  });
  useEffect(() => {
    setDraft({
      title: item.title,
      artist: item.artist,
      key: item.key ?? '',
      bpm: item.bpm ? String(item.bpm) : '',
      licenseHolder: item.licenseHolder,
      licenseDocument: item.licenseDocument
    });
  }, [item.title, item.artist, item.key, item.bpm, item.licenseHolder, item.licenseDocument]);

  const locked = busy || item.status === 'enviando' || item.status === 'verificando' || item.status === 'publicando';
  const total = item.files.reduce((s, f) => s + f.size, 0);
  const sent = item.files.reduce((s, f) => s + Math.min(f.sent, f.size), 0);
  const checked = item.files.filter((f) => f.status === 'conferido').length;
  const blockers = saveBlockers(item);
  const status = STATUS[item.status];

  const commit = (patch: Parameters<CatalogIngestQueue['update']>[1]) => void queue.update(item.id, patch);
  const commitRights = (patch: Partial<RememberedRights>) => {
    commit(patch);
    saveRights({
      rightsClass: patch.rightsClass ?? item.rightsClass,
      licenseHolder: patch.licenseHolder ?? item.licenseHolder,
      licenseDocument: patch.licenseDocument ?? item.licenseDocument
    });
  };

  return (
    <li className="rounded-2xl border border-stage-border bg-stage-card/70 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono text-stage-muted truncate" title={item.sourceLabel}>
            {item.sourceKind === 'zip' ? 'ZIP' : 'Stems avulsos'} · {item.sourceLabel}
          </p>
          <h3 className="mt-0.5 text-lg font-black text-white truncate">{item.title || 'Sem título'}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${status.tone}`}>{status.label}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Título">
          <input className={inputCls} value={draft.title} disabled={locked} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => draft.title !== item.title && commit({ title: draft.title })} />
        </Field>
        <Field label="Artista / versão">
          <input className={inputCls} value={draft.artist} disabled={locked} placeholder="não informado" onChange={(e) => setDraft({ ...draft, artist: e.target.value })} onBlur={() => draft.artist !== item.artist && commit({ artist: draft.artist })} />
        </Field>
        <Field label="Tom" hint={item.key ? (item.keyOrigin === 'manual' ? 'informado à mão' : 'lido do nome') : 'desconhecido'}>
          <input
            className={inputCls}
            value={draft.key}
            disabled={locked}
            placeholder="desconhecido"
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            onBlur={() => {
              const key = draft.key.trim() || null;
              if (key !== item.key) commit({ key, keyOrigin: key ? 'manual' : 'unknown' });
            }}
          />
        </Field>
        <Field label="BPM" hint={item.bpm ? undefined : 'pendente: obrigatório para publicar'}>
          <input
            className={inputCls}
            inputMode="numeric"
            value={draft.bpm}
            disabled={locked}
            placeholder="pendente"
            onChange={(e) => setDraft({ ...draft, bpm: e.target.value.replace(/[^\d.]/g, '') })}
            onBlur={() => {
              const n = Number(draft.bpm);
              const bpm = draft.bpm && n >= 30 && n <= 300 ? n : null;
              if (bpm !== item.bpm) commit({ bpm });
              if (!bpm) setDraft((d) => ({ ...d, bpm: '' }));
            }}
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Direitos">
          <select className={inputCls} value={item.rightsClass} disabled={locked} onChange={(e) => commitRights({ rightsClass: e.target.value as RightsClass })}>
            <option value="unknown">escolha…</option>
            <option value="own">Próprio (gravação da igreja)</option>
            <option value="licensed_redistributable">Licenciado para redistribuir</option>
          </select>
        </Field>
        <Field label="Titular">
          <input className={inputCls} value={draft.licenseHolder} disabled={locked} onChange={(e) => setDraft({ ...draft, licenseHolder: e.target.value })} onBlur={() => draft.licenseHolder !== item.licenseHolder && commitRights({ licenseHolder: draft.licenseHolder })} />
        </Field>
        <Field label="Documento / referência">
          <input className={inputCls} value={draft.licenseDocument} disabled={locked} onChange={(e) => setDraft({ ...draft, licenseDocument: e.target.value })} onBlur={() => draft.licenseDocument !== item.licenseDocument && commitRights({ licenseDocument: draft.licenseDocument })} />
        </Field>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
          <span>
            {checked}/{item.files.length} stems conferidos · {mb(sent)} de {mb(total)}
          </span>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={sent} total={total} tone={checked === item.files.length && item.files.length > 0 ? 'bg-emerald-500' : 'bg-blue-500'} />
        </div>
      </div>

      <ul className="mt-3 divide-y divide-stage-border/70 border-y border-stage-border/70">
        {item.files.map((f) => (
          <li key={f.key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_10rem_9rem] items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-100" title={f.name}>
                {f.name}
              </span>
              <span className={`block text-[11px] ${f.status === 'falhou' ? 'text-rose-300' : f.status === 'conferido' ? 'text-emerald-400' : f.status === 'aguardando_arquivo' ? 'text-amber-300' : 'text-stage-muted'}`}>
                {mb(f.size)} · {f.durationSec ? `${Math.round(f.durationSec)} s · ` : ''}
                {FILE_STATUS[f.status] ?? f.status}
                {f.error ? `: ${f.error}` : ''}
              </span>
            </span>
            <select
              aria-label={`Função de ${f.name}`}
              className="rounded-lg border border-stage-border bg-stage-bg px-2 py-1 text-xs text-white disabled:opacity-60"
              value={f.type}
              disabled={locked}
              onChange={(e) => void queue.setStemType(item.id, f.key, e.target.value as StemType)}
            >
              {STEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="col-span-2 sm:col-span-1">
              <ProgressBar value={Math.min(f.sent, f.size)} total={f.size} tone={f.status === 'conferido' ? 'bg-emerald-500' : f.status === 'falhou' ? 'bg-rose-500' : 'bg-blue-500'} />
            </span>
          </li>
        ))}
      </ul>

      {item.error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {item.error}
        </p>
      )}
      {item.status === 'revisao' && blockers.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">Antes de salvar: {blockers.join(' ')}</p>
      )}
      {item.status === 'aguardando_arquivos' && (
        <p className="mt-3 text-xs text-amber-300">
          A página foi recarregada e o navegador não guarda o acesso aos arquivos. Selecione {item.sourceKind === 'zip' ? `o mesmo ZIP (${item.sourceLabel})` : 'os mesmos arquivos'} de novo: o que já foi conferido não sobe outra vez e os envios grandes continuam das partes já recebidas.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(item.status === 'revisao' || item.status === 'pausado' || item.status === 'falhou') && (
          <button
            type="button"
            disabled={busy || blockers.length > 0}
            onClick={() => void queue.save(item.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {item.status === 'revisao' ? <Upload className="w-4 h-4" aria-hidden /> : item.status === 'pausado' ? <Play className="w-4 h-4" aria-hidden /> : <RotateCcw className="w-4 h-4" aria-hidden />}
            {item.status === 'revisao' ? 'Salvar no acervo' : item.status === 'pausado' ? 'Continuar' : 'Tentar de novo'}
          </button>
        )}
        {(item.status === 'enviando' || item.status === 'verificando') && (
          <button type="button" onClick={() => void queue.pause(item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-stage-border px-3.5 py-2 text-sm font-bold text-slate-100 hover:bg-stage-surface">
            <Pause className="w-4 h-4" aria-hidden /> Pausar
          </button>
        )}
        {(item.status === 'pronto' || (item.status === 'publicado' && item.error)) && (
          <button type="button" onClick={() => void queue.publish(item.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-500">
            <Send className="w-4 h-4" aria-hidden /> Publicar na biblioteca
          </button>
        )}
        {item.status === 'publicando' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-blue-300">
            <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> O servidor está conferindo arquivos e manifesto…
          </span>
        )}
        {item.status === 'publicado' && item.songId && (
          <a href={`/biblioteca/${encodeURIComponent(item.songId)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 px-3.5 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/10">
            <ExternalLink className="w-4 h-4" aria-hidden /> Abrir na biblioteca (e no player)
          </a>
        )}
        <span className="flex-1" />
        {(item.status === 'enviando' || item.status === 'pausado' || item.status === 'aguardando_arquivos' || item.status === 'falhou') && (
          <button
            type="button"
            onClick={() => window.confirm('Cancelar descarta as partes já enviadas desta música e a tira da fila. Os arquivos já conferidos continuam no acervo. Cancelar?') && void queue.cancel(item.id)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
          >
            <X className="w-3.5 h-3.5" aria-hidden /> Cancelar envio
          </button>
        )}
        {(item.status === 'revisao' || item.status === 'pronto' || item.status === 'publicado') && (
          <button type="button" onClick={() => void queue.forget(item.id)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 hover:bg-stage-surface">
            <Trash2 className="w-3.5 h-3.5" aria-hidden /> Tirar da fila
          </button>
        )}
      </div>
    </li>
  );
}

const ENTRY_STATUS: Record<CatalogEntry['status'], string> = {
  pending: 'pendente',
  ready: 'pronta para publicar',
  published: 'publicada',
  withdrawn: 'retirada'
};

function CatalogTable({ services, refreshKey }: { services: CatalogAdminServices; refreshKey: number }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState<string | null>(null);

  const reload = useCallback(() => {
    services.admin
      .list()
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [services]);
  useEffect(reload, [reload, refreshKey]);

  const act = async (entry: CatalogEntry, action: 'publish' | 'withdraw') => {
    setWorking(entry.songId);
    setError('');
    try {
      if (action === 'publish') {
        const version = entry.draftVersionId ?? entry.currentVersionId;
        if (!version) throw new Error('Sem versão salva.');
        await services.admin.publish(entry.songId, version);
      } else {
        await services.admin.withdraw(entry.songId);
      }
      reload();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(`${entry.title}: ${code ? describePublishError(code) : err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-sm font-black uppercase tracking-widest text-stage-muted">Acervo</h2>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {!entries && !error && <p className="mt-2 text-sm text-slate-400">Carregando…</p>}
      {entries && entries.length === 0 && <p className="mt-2 text-sm text-slate-400">Nenhuma música no acervo ainda.</p>}
      {entries && entries.length > 0 && (
        <ul className="mt-2 divide-y divide-stage-border border-y border-stage-border">
          {entries.map((e) => {
            const newerDraft = e.status === 'published' && e.draftVersionId && e.draftVersionId !== e.currentVersionId;
            return (
              <li key={e.songId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-white">{e.title}</span>
                  <span className="block text-xs text-slate-400">
                    {e.artist || 'artista não informado'} · {e.key ?? 'tom desconhecido'} · {e.bpm ? `${e.bpm} BPM` : 'BPM pendente'} · {e.stemsCount} stems
                  </span>
                </span>
                <span className={`text-xs font-bold ${e.status === 'published' ? 'text-emerald-400' : e.status === 'withdrawn' ? 'text-amber-300' : 'text-slate-300'}`}>
                  {ENTRY_STATUS[e.status]}
                  {newerDraft ? ' · versão nova salva' : ''}
                </span>
                {e.status === 'published' && (
                  <a href={`/biblioteca/${encodeURIComponent(e.songId)}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-300 hover:underline">
                    abrir
                  </a>
                )}
                {(e.status === 'ready' || e.status === 'withdrawn' || newerDraft) && (
                  <button
                    type="button"
                    disabled={working === e.songId}
                    onClick={() => void act(e, 'publish')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" aria-hidden /> {e.status === 'withdrawn' ? 'Republicar' : newerDraft ? 'Publicar versão nova' : 'Publicar'}
                  </button>
                )}
                {e.status === 'published' && (
                  <button
                    type="button"
                    disabled={working === e.songId}
                    onClick={() =>
                      window.confirm(`Retirar "${e.title}" da biblioteca? Ela some para os visitantes, mas os arquivos e as versões continuam guardados e ela pode ser republicada.`) &&
                      void act(e, 'withdraw')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stage-border px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-stage-surface disabled:opacity-50"
                  >
                    <Undo2 className="w-3 h-3" aria-hidden /> Retirar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CuratorPanel({ services, queue, user, onSignOut }: { services: CatalogAdminServices; queue: CatalogIngestQueue; user: User; onSignOut: () => void }) {
  const [items, setItems] = useState<IngestItem[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const lastStatuses = useRef<Record<string, ItemStatus>>({});

  useEffect(() => {
    const off = queue.subscribe((next) => {
      setItems(next);
      // Recarrega a lista do acervo quando algo foi salvo ou publicado.
      let changed = false;
      for (const i of next) {
        if (lastStatuses.current[i.id] !== i.status && (i.status === 'pronto' || i.status === 'publicado')) changed = true;
        lastStatuses.current[i.id] = i.status;
      }
      if (changed) setRefreshKey((k) => k + 1);
    });
    void queue.restore();
    return off;
  }, [queue]);

  // Fechar a aba no meio de um envio perde só o que está em trânsito; avisa mesmo assim.
  useEffect(() => {
    const busy = items.some((i) => i.status === 'enviando' || i.status === 'verificando' || i.status === 'publicando');
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [items]);

  const applyRights = async (id: string) => {
    const r = loadRights();
    if (r) await queue.update(id, r);
  };

  const extractZip = async (job: Extraction): Promise<NewFile[] | null> => {
    setExtractions((xs) => xs.map((x) => (x.id === job.id ? { ...x, error: undefined, progress: 0 } : x)));
    try {
      const entries = await ZipMultitrackExtractor.extractFromZipBlob(job.file, (current, total) =>
        setExtractions((xs) => xs.map((x) => (x.id === job.id ? { ...x, progress: current, total } : x)))
      );
      const audio = entries.filter((e) => isAudioName(e.filename));
      if (audio.length === 0) throw new Error('O ZIP não tem arquivos de áudio.');
      return audio.map((e) => {
        const name = baseName(e.filename);
        return {
          name,
          size: e.blob.size,
          blob: e.blob,
          contentType: ZipMultitrackExtractor.getAudioMimeType(name),
          type: stemTypeOf(name),
          durationSec: e.durationSeconds
        };
      });
    } catch (err) {
      setExtractions((xs) => xs.map((x) => (x.id === job.id ? { ...x, error: err instanceof Error ? err.message : String(err) } : x)));
      return null;
    }
  };

  const addZip = async (job: Extraction) => {
    const files = await extractZip(job);
    if (!files) return;
    const info = parsePackageName(job.file.name);
    const item = await queue.add({
      sourceKind: 'zip',
      sourceLabel: job.file.name,
      sourceKey: `${job.file.name}\u0000${job.file.size}`,
      title: info.title,
      artist: info.artist ?? '',
      key: info.key,
      bpm: info.bpm,
      files
    });
    await applyRights(item.id);
    setExtractions((xs) => xs.filter((x) => x.id !== job.id));
  };

  const handleSelection = async (picks: Pick[]) => {
    if (picks.length === 0) return;
    setNotice('');
    const current = queue.snapshot();
    const waiting = current.filter((i) => i.files.some((f) => f.status === 'aguardando_arquivo'));
    let remaining = picks;
    let reattached = 0;

    // 1) Retomada: o mesmo ZIP ou os mesmos arquivos voltam para a música que os esperava.
    for (const item of waiting) {
      if (item.sourceKind === 'zip' && item.sourceKey) {
        const zip = remaining.find((p) => `${p.file.name}\u0000${p.file.size}` === item.sourceKey);
        if (!zip) continue;
        remaining = remaining.filter((p) => p !== zip);
        const job: Extraction = { id: crypto.randomUUID(), label: zip.file.name, file: zip.file, progress: 0, total: 0 };
        setExtractions((xs) => [...xs, job]);
        const files = await extractZip(job);
        if (!files) continue;
        const missing = await queue.attachFiles(item.id, files);
        setExtractions((xs) => xs.filter((x) => x.id !== job.id));
        reattached++;
        if (missing === 0) void queue.save(item.id);
      } else {
        const matches = remaining.filter((p) => item.files.some((f) => f.name === p.file.name && f.size === p.file.size));
        if (matches.length === 0) continue;
        remaining = remaining.filter((p) => !matches.includes(p));
        const missing = await queue.attachFiles(
          item.id,
          matches.map((p) => ({ name: p.file.name, size: p.file.size, blob: p.file }))
        );
        reattached++;
        if (missing === 0) void queue.save(item.id);
      }
    }

    // 2) Músicas novas: cada ZIP uma música; áudios avulsos agrupados por pasta.
    const plan = planSelection(remaining.map((p) => ({ name: p.file.name, size: p.file.size, relativePath: p.relativePath, file: p.file })));
    setRejected(plan.rejected);
    const jobs: Extraction[] = [];
    for (const group of plan.groups) {
      if (group.kind === 'zip') {
        jobs.push({ id: crypto.randomUUID(), label: group.label, file: group.file.file, progress: 0, total: 0 });
      } else {
        const files: NewFile[] = await Promise.all(
          group.files.map(async (f) => ({
            name: f.name,
            size: f.size,
            blob: f.file,
            contentType: f.file.type || ZipMultitrackExtractor.getAudioMimeType(f.name),
            type: stemTypeOf(f.name),
            durationSec: await wavDuration(f.file, f.name).catch(() => undefined)
          }))
        );
        const info = parsePackageName(group.label);
        const item = await queue.add({
          sourceKind: 'stems',
          sourceLabel: group.label,
          // Pasta escolhida: o nome dela é o título. Arquivos soltos: o curador informa.
          title: group.files[0]?.relativePath ? info.title : '',
          artist: info.artist ?? '',
          key: info.key,
          bpm: info.bpm,
          files
        });
        await applyRights(item.id);
      }
    }
    if (jobs.length > 0) {
      setExtractions((xs) => [...xs, ...jobs]);
      // Um ZIP por vez: cada extração usa a memória do tamanho do pacote.
      for (const job of jobs) await addZip(job);
    }
    const added = plan.groups.length;
    setNotice(
      [
        added ? `${added} ${added === 1 ? 'música adicionada' : 'músicas adicionadas'} à fila.` : '',
        reattached ? `${reattached} ${reattached === 1 ? 'música retomada' : 'músicas retomadas'} com os arquivos selecionados.` : '',
        plan.rejected.length ? `${plan.rejected.length} ${plan.rejected.length === 1 ? 'arquivo recusado' : 'arquivos recusados'} (veja abaixo).` : ''
      ]
        .filter(Boolean)
        .join(' ')
    );
  };

  const fromInput = (list: FileList | null): Pick[] =>
    list ? Array.from(list).map((file) => ({ file, relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '' })) : [];

  const saveAll = () => {
    for (const i of items) if ((i.status === 'revisao' || i.status === 'pausado' || i.status === 'falhou') && saveBlockers(i).length === 0) void queue.save(i.id);
  };
  const readyCount = items.filter((i) => (i.status === 'revisao' || i.status === 'pausado' || i.status === 'falhou') && saveBlockers(i).length === 0).length;

  return (
    <div className="min-h-screen w-full bg-[#0c0c0e] text-slate-100 font-sans">
      <header className="border-b border-stage-border bg-stage-surface/80">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Library className="w-5 h-5 text-amber-400" aria-hidden />
          <h1 className="font-black tracking-tight text-white">Acervo · biblioteca pública</h1>
          <a href="/biblioteca" target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold text-slate-300 hover:text-white hover:underline underline-offset-4">
            Ver a biblioteca
          </a>
          <span className="hidden sm:inline text-xs text-stage-muted truncate max-w-[14rem]">{user.email || user.displayName}</span>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 hover:bg-stage-card">
            <LogOut className="w-3.5 h-3.5" aria-hidden /> Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleSelection(fromInput(e.dataTransfer.files));
          }}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-blue-500 bg-blue-500/10' : 'border-stage-border bg-stage-card/40'}`}
        >
          <Upload className="mx-auto w-7 h-7 text-amber-400" aria-hidden />
          <p className="mt-2 font-bold text-white">Arraste ZIPs de multitrack ou stems avulsos</p>
          <p className="mt-1 text-sm text-slate-400">
            Cada ZIP vira uma música. Stems avulsos viram uma música por pasta. Os arquivos sobem como estão: sem converter nem normalizar.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => filesInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
              <Upload className="w-4 h-4" aria-hidden /> Escolher arquivos
            </button>
            <button type="button" onClick={() => folderInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-stage-border px-4 py-2 text-sm font-bold text-slate-100 hover:bg-stage-surface">
              <FolderOpen className="w-4 h-4" aria-hidden /> Escolher pasta
            </button>
          </div>
          <input
            ref={filesInput}
            type="file"
            multiple
            accept=".zip,audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a"
            className="hidden"
            data-testid="acervo-arquivos"
            onChange={(e) => {
              const picks = fromInput(e.target.files);
              e.target.value = '';
              void handleSelection(picks);
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => {
              const picks = fromInput(e.target.files);
              e.target.value = '';
              void handleSelection(picks);
            }}
          />
        </div>

        {notice && <p className="mt-3 text-sm text-slate-200" role="status">{notice}</p>}

        {rejected.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p className="font-bold">Fora da fila:</p>
            <ul className="mt-1 list-disc pl-5">
              {rejected.map((r) => (
                <li key={r.name}>
                  {r.name}: {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {extractions.length > 0 && (
          <ul className="mt-4 space-y-2">
            {extractions.map((x) => (
              <li key={x.id} className="rounded-xl border border-stage-border bg-stage-card/60 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {x.error ? <AlertTriangle className="w-4 h-4 text-rose-400" aria-hidden /> : <LoaderCircle className="w-4 h-4 animate-spin text-blue-400" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                  <span className="text-xs text-stage-muted">{x.error ? 'não foi possível abrir' : x.total ? `abrindo ${x.progress}/${x.total}` : 'abrindo o ZIP'}</span>
                </div>
                {!x.error && (
                  <div className="mt-2">
                    <ProgressBar value={x.progress} total={x.total} />
                  </div>
                )}
                {x.error && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="flex-1 text-xs text-rose-300">{x.error}</p>
                    <button type="button" onClick={() => void addZip(x)} className="inline-flex items-center gap-1 rounded-lg border border-stage-border px-2.5 py-1 text-xs font-bold hover:bg-stage-surface">
                      <RotateCcw className="w-3 h-3" aria-hidden /> Tentar de novo
                    </button>
                    <button type="button" onClick={() => setExtractions((xs) => xs.filter((y) => y.id !== x.id))} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-stage-surface">
                      Descartar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <section className="mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-stage-muted">Fila ({items.length})</h2>
              <span className="text-xs text-stage-muted">
                {items.filter((i) => i.status === 'publicado').length} publicadas · {items.filter((i) => i.status === 'pronto').length} prontas ·{' '}
                {items.filter((i) => i.status === 'falhou').length} com falha
              </span>
              {readyCount > 1 && (
                <button type="button" onClick={saveAll} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500">
                  <Upload className="w-3.5 h-3.5" aria-hidden /> Salvar todas ({readyCount})
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-4">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} queue={queue} busy={queue.isRunning(item.id)} />
              ))}
            </ul>
          </section>
        )}

        <CatalogTable services={services} refreshKey={refreshKey} />

        <p className="mt-8 flex items-start gap-2 text-xs text-stage-muted">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
          Salvar no acervo envia, confere o sha256 de cada arquivo no servidor e grava a versão (imutável). Publicar é outro passo: o servidor confere de novo
          arquivos, direitos e BPM antes de liberar para qualquer pessoa. Retirar esconde da biblioteca sem apagar nada.
        </p>
      </main>
    </div>
  );
}

/** /admin/acervo: envio e publicação da biblioteca pública (só curadores). */
export const AdminAcervoPage: React.FC = () => {
  const backend = useBackend();
  const services = backend.catalogAdmin;
  const [user, setUser] = useState<User | null>(() => backend.accounts.getCurrentUser());
  const [curator, setCurator] = useState<{ uid: string; ok: boolean } | null>(null);
  // Uma fila por carga da página: os arquivos selecionados vivem nela e não podem sumir num re-render.
  const queue = useMemo(() => services?.createQueue() ?? null, [services]);

  useEffect(() => backend.accounts.onAuthStateChanged(setUser), [backend]);
  // O Firebase avisa o login mais de uma vez (objetos novos para a mesma conta): a checagem segue o uid.
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid || !services) return;
    let alive = true;
    void services.admin.isCurator().then((ok) => alive && setCurator({ uid, ok }));
    return () => {
      alive = false;
    };
  }, [uid, services]);

  const signOut = () => void backend.accounts.signOut().then(() => setUser(null));

  if (!services || !queue) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] p-8 text-slate-200">
        <h1 className="text-xl font-black text-white">Acervo indisponível neste modo</h1>
        <p className="mt-2 text-sm text-slate-400">O envio para a biblioteca pública precisa do backend Firebase com o Worker de stems.</p>
      </div>
    );
  }
  if (!user) return <AuthGate authService={backend.accounts} onAuthenticated={setUser} />;
  if (curator === null || curator.uid !== user.uid) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] flex items-center justify-center text-slate-300">
        <LoaderCircle className="w-5 h-5 animate-spin" aria-hidden />
        <span className="ml-2 text-sm">Conferindo acesso…</span>
      </div>
    );
  }
  if (!curator.ok) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] p-8 text-slate-200">
        <h1 className="text-xl font-black text-white">Acesso restrito</h1>
        <p className="mt-2 max-w-lg text-sm text-slate-400">
          Esta conta não é curadora do acervo. Só curadores enviam, editam, publicam ou retiram músicas. A biblioteca continua aberta para ouvir e tocar.
        </p>
        <div className="mt-4 flex gap-3">
          <a href="/biblioteca" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
            Ir para a biblioteca
          </a>
          <button type="button" onClick={signOut} className="rounded-xl border border-stage-border px-4 py-2 text-sm font-bold hover:bg-stage-surface">
            Entrar com outra conta
          </button>
        </div>
      </div>
    );
  }
  return <CuratorPanel services={services} queue={queue} user={user} onSignOut={signOut} />;
};

export default AdminAcervoPage;
