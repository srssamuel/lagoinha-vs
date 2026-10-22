import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Library, LoaderCircle, Music2, Play, Search, WifiOff } from 'lucide-react';
import { GLOBAL_SCOPE } from '../../application/ports/SongLibraryPort';
import { CloudSong } from '../../domain/entities/CloudSong';
import { StemType } from '../../domain/entities/TrackStem';
import { User, VISITOR_UID } from '../../domain/entities/User';
import { formatCloudSongKey } from '../../domain/services/CloudSongKey';
import { useBackend } from '../BackendContext';
import { enterVisitorMode } from '../visitorMode';

const STEM_LABEL: Record<StemType, string> & Record<string, string | undefined> = {
  click: 'Click',
  guide: 'Guia',
  drums: 'Bateria',
  loop: 'Loop',
  bass: 'Baixo',
  violao: 'Violão',
  guitars: 'Guitarras',
  strings: 'Cordas',
  keys: 'Teclas',
  pad: 'Pad',
  vocals: 'Vozes',
  fx: 'Efeitos'
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function minutes(sec: number): string {
  if (!(sec > 0)) return '—';
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** Repertório do aparelho em que a música fica: o mesmo que o player abre para esta pessoa (App/useSetlist). */
const shelfOf = (user: User | null): string => (user ? user.churchId : VISITOR_UID);

export function songPath(songId: string): string {
  return `/biblioteca/${encodeURIComponent(songId)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#0c0c0e] text-slate-100 font-sans select-text">
      <header className="border-b border-stage-border bg-stage-surface/80">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/biblioteca" className="flex items-center gap-2 font-black tracking-tight text-white">
            <Library className="w-5 h-5 text-amber-400" aria-hidden />
            <span>Biblioteca Lagoinha VS</span>
          </a>
          <a href="/" className="ml-auto text-xs font-bold text-slate-300 hover:text-white underline-offset-4 hover:underline">
            Abrir o player
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}

function KeyBpm({ song }: { song: CloudSong }) {
  return (
    <span className="font-mono text-xs text-slate-300">
      {song.originalKey ? <span>Tom {song.originalKey}</span> : <span className="text-stage-muted">Tom desconhecido</span>}
      <span className="text-stage-border"> · </span>
      {song.bpm > 0 ? <span>{song.bpm} BPM</span> : <span className="text-stage-muted">BPM pendente</span>}
    </span>
  );
}

function SongList() {
  const backend = useBackend();
  const [songs, setSongs] = useState<CloudSong[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    backend.library
      .list(GLOBAL_SCOPE)
      .then((list) => alive && setSongs(list))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [backend]);

  const visible = useMemo(
    () => (songs ?? []).filter((s) => !query.trim() || fold(`${s.title} ${s.artist}`).includes(fold(query.trim()))),
    [songs, query]
  );

  return (
    <Shell>
      <h1 className="text-2xl font-black text-white">Músicas publicadas</h1>
      <p className="mt-1 text-sm text-slate-400 max-w-2xl">
        Multitracks liberadas para qualquer pessoa usar no louvor. Abra uma música para tocar no player com click e guia
        separados; ela fica guardada neste aparelho e funciona sem internet.
      </p>

      <label className="mt-5 flex items-center gap-2 rounded-xl border border-stage-border bg-stage-card px-3 py-2 focus-within:border-blue-500">
        <Search className="w-4 h-4 text-stage-muted" aria-hidden />
        <span className="sr-only">Buscar música</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou artista"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-stage-muted outline-none"
        />
      </label>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          Não foi possível carregar a biblioteca: {error}
        </div>
      )}
      {!songs && !error && (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> Carregando…
        </p>
      )}
      {songs && visible.length === 0 && <p className="mt-6 text-sm text-slate-400">Nenhuma música publicada encontrada.</p>}

      <ol className="mt-4 divide-y divide-stage-border border-y border-stage-border">
        {visible.map((song) => (
          <li key={song.id}>
            <a href={songPath(song.id)} className="flex items-center gap-3 py-3 px-1 hover:bg-stage-surface/60 rounded-lg">
              <Music2 className="w-4 h-4 text-amber-400 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-white truncate">{song.title}</span>
                <span className="block text-xs text-slate-400 truncate">{song.artist || 'Artista não informado'}</span>
              </span>
              <span className="hidden sm:block">
                <KeyBpm song={song} />
              </span>
              <span className="font-mono text-xs text-stage-muted w-16 text-right">{song.stemsCount} stems</span>
            </a>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

function SongDetail({ songId }: { songId: string }) {
  const backend = useBackend();
  const [song, setSong] = useState<CloudSong | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState<'idle' | 'busy' | 'done'>('idle');
  const [prepared, setPrepared] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  const versionId = song?.currentVersionId;
  const cloudKey = versionId ? formatCloudSongKey({ source: 'global', songId, versionId }) : null;
  // Com conta (curador, músico): prepara no repertório dela. Sem conta: no do visitante deste aparelho.
  const [owner, setOwner] = useState(() => shelfOf(backend.accounts.getCurrentUser()));
  useEffect(() => backend.accounts.onAuthStateChanged((u) => setOwner(shelfOf(u))), [backend]);

  useEffect(() => {
    let alive = true;
    backend.library
      .getById(GLOBAL_SCOPE, songId)
      .then((s) => alive && setSong(s))
      .catch((err: unknown) => {
        if (!alive) return;
        setSong(null);
        setError(err instanceof Error ? err.message : String(err));
      });
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      alive = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [backend, songId]);

  // Já preparada neste aparelho? (vale também sem internet, quando o Firestore não responde)
  useEffect(() => {
    void backend.deviceCache.loadCustomSongs(owner).then((saved) => {
      setPrepared(saved.some((s) => s.id.startsWith(`cloud:global:${songId}@`) && (!cloudKey || s.id === cloudKey)));
    });
  }, [backend, songId, cloudKey, owner]);

  const openPlayer = (id: string) => {
    if (owner === VISITOR_UID) enterVisitorMode();
    window.location.assign(`/?tocar=${encodeURIComponent(id)}`);
  };

  const prepareAndOpen = async () => {
    if (!versionId || !cloudKey) return;
    setPreparing('busy');
    setError('');
    try {
      await backend.prepareService.prepareItem({ order: 0, source: 'global', songId, versionId }, owner);
      setPreparing('done');
      setPrepared(true);
      openPlayer(cloudKey);
    } catch (err) {
      setPreparing('idle');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openPrepared = async () => {
    const saved = await backend.deviceCache.loadCustomSongs(owner);
    const match = saved.find((s) => s.id === cloudKey) ?? saved.find((s) => s.id.startsWith(`cloud:global:${songId}@`));
    if (match) openPlayer(match.id);
  };

  return (
    <Shell>
      <a href="/biblioteca" className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Todas as músicas
      </a>

      {song === undefined && (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> Carregando…
        </p>
      )}

      {song === null && (
        <div className="mt-6">
          <h1 className="text-xl font-black text-white">Música indisponível</h1>
          <p className="mt-1 text-sm text-slate-400">
            {offline ? 'Sem internet agora.' : 'Ela não está publicada (ou foi retirada da biblioteca).'}
          </p>
          {prepared && (
            <button
              type="button"
              onClick={() => void openPrepared()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
            >
              <WifiOff className="w-4 h-4" aria-hidden /> Abrir a cópia deste aparelho
            </button>
          )}
          {error && !offline && <p className="mt-3 text-xs text-stage-muted">{error}</p>}
        </div>
      )}

      {song && (
        <article className="mt-4">
          <h1 className="text-3xl font-black text-white leading-tight">{song.title}</h1>
          <p className="mt-1 text-slate-300">{song.artist || 'Artista não informado'}</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <KeyBpm song={song} />
            <span className="font-mono text-xs text-slate-400">{minutes(song.duration)}</span>
            <span className="font-mono text-xs text-slate-400">{song.stemsCount} stems</span>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void prepareAndOpen()}
              disabled={preparing === 'busy' || !versionId || song.bpm <= 0}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {preparing === 'busy' ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}
              {preparing === 'busy' ? 'Baixando e conferindo os stems…' : prepared ? 'Abrir no player' : 'Preparar e abrir no player'}
            </button>
            {prepared && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Download className="w-3.5 h-3.5" aria-hidden /> Guardada neste aparelho: abre sem internet
              </span>
            )}
          </div>
          {song.bpm <= 0 && <p className="mt-2 text-xs text-amber-400">O BPM desta música está pendente; ela ainda não toca no player.</p>}
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          <h2 className="mt-8 text-xs font-black uppercase tracking-widest text-stage-muted">Stems</h2>
          <ul className="mt-2 divide-y divide-stage-border border-y border-stage-border">
            {song.stems.map((stem) => (
              <li key={stem.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wide text-amber-300">{STEM_LABEL[stem.type] ?? stem.type}</span>
                <span className="min-w-0 flex-1 truncate text-slate-200">{stem.name}</span>
                <span className="font-mono text-xs text-stage-muted">{stem.fileSizeMb} MB</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stage-muted">
            Click e guia saem só no fone (canal L no modo Split); o PA recebe apenas a banda. Os arquivos são os originais, sem
            normalização, conferidos pelo sha256 ao baixar.
          </p>
        </article>
      )}
    </Shell>
  );
}

/** /biblioteca e /biblioteca/{songId}: catálogo publicado, sem login. */
export const PublicLibraryPage: React.FC<{ songId: string | null }> = ({ songId }) =>
  songId ? <SongDetail songId={songId} /> : <SongList />;

export default PublicLibraryPage;
