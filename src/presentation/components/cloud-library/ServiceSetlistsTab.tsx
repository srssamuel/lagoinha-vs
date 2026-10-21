import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CloudDownload, Send, RefreshCw } from 'lucide-react';
import { ServiceSetlist, ServiceSetlistItem, SetlistConflictError } from '../../../domain/entities/ServiceSetlist';
import { Song } from '../../../domain/entities/Song';
import { parseCloudSongKey } from '../../../domain/services/CloudSongKey';
import { PrepareReport } from '../../../application/service/PrepareServiceUseCase';
import { useBackend } from '../../BackendContext';

interface ServiceSetlistsTabProps {
  churchId: string;
  uid: string;
  canEdit: boolean;
  /** Repertório que está no player agora: vira o culto publicado. */
  currentSongs: Song[];
  /** Troca o repertório do player pelas músicas preparadas no aparelho. */
  onOpenPrepared: (songs: Song[]) => void;
}

function itemsFrom(songs: Song[]): { items: ServiceSetlistItem[]; localOnly: string[] } {
  const items: ServiceSetlistItem[] = [];
  const localOnly: string[] = [];
  for (const song of songs) {
    const key = parseCloudSongKey(song.id);
    if (!key) {
      localOnly.push(song.title);
      continue;
    }
    items.push({ order: items.length + 1, source: key.source, songId: key.songId, versionId: key.versionId });
  }
  return { items, localOnly };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Cultos da igreja no banco online: a liderança publica o repertório (com a versão de cada música)
 * e qualquer integrante abre o mesmo culto, prepara no aparelho e toca sem internet.
 */
export const ServiceSetlistsTab: React.FC<ServiceSetlistsTabProps> = ({
  churchId,
  uid,
  canEdit,
  currentSongs,
  onOpenPrepared
}) => {
  const { setlists, prepareService } = useBackend();
  const [services, setServices] = useState<ServiceSetlist[]>([]);
  const [title, setTitle] = useState('Culto de domingo');
  const [serviceDate, setServiceDate] = useState(today());
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<PrepareReport | null>(null);

  const refresh = useCallback(async () => {
    try {
      setServices(await setlists.list(churchId));
    } catch (err) {
      setMessage({ tone: 'warn', text: err instanceof Error ? err.message : 'Não foi possível carregar os cultos.' });
    }
  }, [setlists, churchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { items, localOnly } = itemsFrom(currentSongs);

  const publish = async () => {
    if (items.length === 0) {
      setMessage({ tone: 'warn', text: 'Adicione músicas do acervo online ao repertório antes de publicar.' });
      return;
    }
    setBusyId('new');
    try {
      const id = `culto-${serviceDate}-${Math.random().toString(36).slice(2, 8)}`;
      await setlists.create({
        id,
        churchId,
        title: title.trim() || 'Culto',
        serviceDate,
        status: 'published',
        updatedBy: uid,
        items
      });
      setMessage({
        tone: localOnly.length ? 'warn' : 'ok',
        text: localOnly.length
          ? `Culto publicado com ${items.length} músicas. Ficaram só neste aparelho: ${localOnly.join(', ')}.`
          : `Culto publicado com ${items.length} músicas.`
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'warn', text: err instanceof Error ? err.message : 'Falha ao publicar.' });
    } finally {
      setBusyId(null);
    }
  };

  const replaceWithCurrent = async (service: ServiceSetlist) => {
    setBusyId(service.id);
    try {
      await setlists.save({ ...service, items, updatedBy: uid }, service.revision);
      setMessage({ tone: 'ok', text: `"${service.title}" atualizado com o repertório atual.` });
      await refresh();
    } catch (err) {
      setMessage({
        tone: 'warn',
        text:
          err instanceof SetlistConflictError
            ? 'Outra pessoa salvou este culto antes. A lista foi recarregada; revise e salve de novo.'
            : err instanceof Error
              ? err.message
              : 'Falha ao salvar.'
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const prepare = async (service: ServiceSetlist) => {
    setBusyId(service.id);
    setReport(null);
    setProgress('');
    try {
      const result = await prepareService.prepare(service, (done, total) => setProgress(`${done} de ${total}`));
      setReport(result);
      if (result.prepared.length > 0) onOpenPrepared(result.prepared.map((p) => p.song));
    } catch (err) {
      setMessage({ tone: 'warn', text: err instanceof Error ? err.message : 'Falha ao preparar.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      {canEdit && (
        <section className="p-4 rounded-2xl bg-stage-card border border-stage-border">
          <h4 className="text-sm font-bold text-white mb-1">Publicar o repertório atual como culto</h4>
          <p className="text-xs text-stage-muted mb-3">
            {items.length} música(s) do acervo online no player
            {localOnly.length > 0 ? `; ${localOnly.length} local(is) ficam fora do culto publicado` : ''}. Cada uma vai
            com a versão ensaiada.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-[11px] text-slate-300 gap-1 flex-1 min-w-[160px]">
              Nome do culto
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="px-3 py-2 rounded-xl bg-[#0c0f16] border border-stage-border text-sm text-white"
              />
            </label>
            <label className="flex flex-col text-[11px] text-slate-300 gap-1">
              Data
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#0c0f16] border border-stage-border text-sm text-white"
              />
            </label>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void publish()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Publicar culto
            </button>
          </div>
        </section>
      )}

      {message && (
        <p
          role="status"
          className={`text-xs font-semibold rounded-xl px-3 py-2 border ${message.tone === 'ok' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-300 bg-amber-500/10 border-amber-500/30'}`}
        >
          {message.text}
        </p>
      )}

      {report && (
        <div className="text-xs rounded-xl px-3 py-2 border border-stage-border bg-stage-card">
          <p className="font-bold text-white">
            Preparado no aparelho: {report.prepared.length} música(s)
            {report.failed.length ? `; ${report.failed.length} com problema` : ''}.
          </p>
          {report.failed.map((f) => (
            <p key={`${f.order}-${f.songId}`} className="text-amber-300">
              #{f.order}: {f.reason}
            </p>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Cultos da igreja</h4>
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1.5 rounded-lg text-stage-muted hover:text-white"
            aria-label="Recarregar cultos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {services.length === 0 && <p className="text-xs text-stage-muted">Nenhum culto publicado ainda.</p>}
        {services.map((service) => (
          <div
            key={service.id}
            className="p-3.5 rounded-2xl bg-stage-card border border-stage-border flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-bold text-sm text-white truncate">{service.title}</p>
              <p className="text-xs text-stage-muted flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {service.serviceDate} • {service.items.length} música(s) • revisão {service.revision}
              </p>
            </div>
            <div className="flex gap-2">
              {canEdit && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void replaceWithCurrent(service)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  Salvar repertório atual
                </button>
              )}
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void prepare(service)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                {busyId === service.id && progress ? `Preparando ${progress}` : 'Preparar e abrir offline'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
