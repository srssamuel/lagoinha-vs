/**
 * Setlist do culto como documento da igreja (spec-banco-online, seção 3: churches/{id}/setlists/{id}).
 * Diferente de `Setlist` (estado do player): aqui só há referências a músicas e versões.
 */
export type ServiceSetlistStatus = 'draft' | 'published' | 'locked';

export interface ServiceSetlistItem {
  order: number;
  source: 'global' | 'church';
  songId: string;
  /** Versão exata ensaiada; o culto toca esta mesmo que alguém publique outra depois. */
  versionId: string;
  keyOverride?: string;
  bpmOverride?: number;
  notes?: string;
}

export interface ServiceSetlist {
  id: string;
  churchId: string;
  title: string;
  serviceDate: string;
  status: ServiceSetlistStatus;
  /** Sobe 1 a cada escrita; a gravação só passa se a revisão lida for a do servidor. */
  revision: number;
  updatedBy: string;
  updatedAt: string;
  items: ServiceSetlistItem[];
}

/** Escrita com revisão velha: alguém salvou antes. Sem merge automático (seção 5.4). */
export class SetlistConflictError extends Error {
  constructor(
    public readonly setlistId: string,
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
    public readonly updatedBy: string
  ) {
    super(`Setlist alterado por ${updatedBy}. Recarregue antes de salvar.`);
    this.name = 'SetlistConflictError';
  }
}
