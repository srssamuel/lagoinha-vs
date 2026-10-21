import React from 'react';
import { ExternalLink } from 'lucide-react';
import { EXTERNAL_REPOSITORIES } from './externalRepositories';

/** Aba Repositórios Externos: onde baixar pacotes .ZIP/WAV/MP3 para importar. */
export const ExternalRepositoriesTab: React.FC = () => (
  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
    <div className="p-3 rounded-2xl bg-blue-950/30 border border-blue-500/30 text-xs text-slate-300">
      Baixe pacotes de Multitracks (<strong className="text-white">.ZIP, WAV ou MP3</strong>) de qualquer um dos repositórios
      abaixo e clique em <strong className="text-white">&ldquo;Subir Track (.ZIP / WAV / MP3)&rdquo;</strong> na barra lateral
      para abrir os canais separados automaticamente.
    </div>

    {EXTERNAL_REPOSITORIES.map((repo) => (
      <a
        key={repo.url}
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-4 rounded-2xl bg-stage-card border border-stage-border hover:border-amber-400/60 transition group"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white group-hover:text-amber-300 transition">{repo.name}</span>
            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {repo.badge}
            </span>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-amber-300 shrink-0" />
        </div>
        <p className="text-xs text-stage-muted leading-relaxed">{repo.description}</p>
      </a>
    ))}
  </div>
);
