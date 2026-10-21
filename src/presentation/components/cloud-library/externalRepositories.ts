export interface ExternalRepository {
  name: string;
  url: string;
  badge: string;
  description: string;
}

/** Fontes públicas de multitracks; o operador baixa lá e importa .ZIP/WAV/MP3 no Lagoinha VS. */
export const EXTERNAL_REPOSITORIES: ExternalRepository[] = [
  {
    name: 'MultiTracks.com.br — Conteúdo Gratuito (MultiTrack Gratuita do Mês & Pads)',
    url: 'https://www.multitracks.com.br/products/free/',
    badge: 'CONTEÚDO GRATUITO OFICIAL',
    description:
      'Página oficial de recursos gratuitos da MultiTracks.com.br: inclui a MultiTrack Gratuita do Mês (Free Play), Pacotes de Pads Ambiente gratuitos e recursos de teste que podem ser importados diretamente no Lagoinha VS.'
  },
  {
    name: 'MultiTracks.com.br — Catálogo Completo Gospel & Worship (Brasil)',
    url: 'https://www.multitracks.com.br/songs/',
    badge: 'CATÁLOGO OFICIAL WORSHIP',
    description:
      'Maior acervo mundial de multitracks originais de estúdio (Casa Worship, Gabriel Guedes, Isaías Saad, Lagoinha, Elevation, Bethel) com canais isolados de Violão, Guitarra, Baixo, Bateria, Keys, Click e Guia.'
  },
  {
    name: 'Cambridge MT — Open Multitrack Download Library (500+ Projetos WAV Grátis)',
    url: 'https://cambridge-mt.com/ms/mtk/',
    badge: 'DOWNLOAD DIRETO GRATUITO (WAV)',
    description:
      'Maior biblioteca pública de multitracks reais de estúdio abertas para download gratuito em ZIP/WAV, com canais individuais de Violão Acústico, Guitarra Elétrica, Contrabaixo, Bateria, Piano, Cordas e Vozes.'
  },
  {
    name: 'Telefunken — Live From The Lab (Stems Reais de Estúdio Grátis)',
    url: 'https://www.telefunken-elektroakustik.com/live-from-the-lab-season-4/',
    badge: 'MULTITRACKS DE ESTÚDIO GRÁTIS',
    description:
      'Sessões multitrack reais gravadas ao vivo em estúdio com microfones Telefunken, disponibilizadas gratuitamente em arquivos WAV stem-por-stem.'
  },
  {
    name: 'Loop Community — Prime Multitracks & Community Stems',
    url: 'https://loopcommunity.com/en-us/tracks',
    badge: 'PRODUTORES & COMUNIDADE',
    description:
      'Repositório global de produtores de louvor com pacotes de stems WAV/MP3 prontos para importar diretamente no Lagoinha VS.'
  },
  {
    name: 'Worship Backing Band — MultiTrack Player Stems',
    url: 'https://www.worshipbackingband.com/',
    badge: 'LOUVOR CONGREGACIONAL',
    description: 'Multitracks econômicas em WAV separadas por instrumento para igrejas e ministérios de louvor.'
  }
];
