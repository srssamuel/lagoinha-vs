import { CloudSong } from '../../domain/entities/CloudSong';
import { CloudVSRepositoryPort } from '../../application/ports/CloudVSRepositoryPort';
import { Song } from '../../domain/entities/Song';
import { TrackStem } from '../../domain/entities/TrackStem';
import { SongSection } from '../../domain/value-objects/SongSection';
import { DemoWorshipSongs } from './DemoWorshipSongs';

const FOLDER_BY_CLOUD_ID: Record<string, string> = {
  'cloud-o-nosso-general': 'o-nosso-general',
  'cloud-casa-e-sua': 'song-casa-sua',
  'cloud-ruja-o-leao': 'song-ruja-o-leao',
  'cloud-bondade-de-deus': 'cloud-bondade-deus',
  'cloud-santo-pra-sempre': 'cloud-santo-pra-sempre',
  'cloud-vitorioso-es': 'song-vitorioso-es',
  'cloud-ousado-amor': 'song-ousado-amor'
};

export class DemoCloudVSLibrary implements CloudVSRepositoryPort {
  private uploadedBlobUrls: Map<string, Map<string, string>> = new Map();

  private library: CloudSong[] = [
    new CloudSong({
      id: 'cloud-o-nosso-general',
      title: 'O Nosso General',
      artist: 'Versão Mateus Brito',
      originalKey: 'B',
      bpm: 140,
      timeSignature: { beats: 4, value: 4 },
      duration: 247,
      stemsCount: 13,
      tags: ['Guerra Espiritual', 'Celebração', 'Multitrack Real 13 Canais'],
      uploadedBy: 'Samuel (Upload ZIP Oficial)',
      uploadedAt: '18/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/o-nosso-general',
      stems: [
        { id: 'click', name: 'Click 140 BPM', type: 'click', fileSizeMb: 2.9 },
        { id: 'guide', name: 'Guia (Voz de Comando)', type: 'guide', fileSizeMb: 2.9 },
        { id: 'drums', name: 'Bateria (Drums)', type: 'drums', fileSizeMb: 4.7 },
        { id: 'loop', name: 'Loop Percussivo (Keys Loop)', type: 'loop', fileSizeMb: 3.9 },
        { id: 'bass', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 4.7 },
        { id: 'eg1', name: 'Guitarra 1 (EG 1 Base)', type: 'guitars', fileSizeMb: 4.7 },
        { id: 'eg2', name: 'Guitarra 2 (EG 2 Riff)', type: 'guitars', fileSizeMb: 4.7 },
        { id: 'eg3', name: 'Guitarra Solo (EG 3 Lead)', type: 'guitars', fileSizeMb: 4.7 },
        { id: 'keys_ep', name: 'Piano Elétrico (Keys EP)', type: 'keys', fileSizeMb: 4.7 },
        { id: 'keys_orgao', name: 'Órgão Hammond (Keys Órgão)', type: 'keys', fileSizeMb: 4.7 },
        { id: 'pad', name: 'Keys Synth Pad', type: 'pad', fileSizeMb: 4.7 },
        { id: 'keys_lead', name: 'Synth Lead (Keys Lead)', type: 'keys', fileSizeMb: 4.7 },
        { id: 'vocals', name: 'Backing Vocals (Coro)', type: 'vocals', fileSizeMb: 3.9 }
      ]
    }),
    new CloudSong({
      id: 'cloud-bondade-de-deus',
      title: 'Bondade de Deus',
      artist: 'Isaías Saad',
      originalKey: 'Ab',
      bpm: 70,
      timeSignature: { beats: 4, value: 4 },
      duration: 120,
      stemsCount: 9,
      tags: ['Intimidade', 'Ofertório', 'Ministração'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '17/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/bondade-de-deus',
      stems: [
        { id: 'st-1', name: 'Click (Metrônomo)', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria (Drums)', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Elétrica', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Atmosphere Pad', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    }),
    new CloudSong({
      id: 'cloud-santo-pra-sempre',
      title: 'Santo Pra Sempre',
      artist: 'Gabriel Guedes',
      originalKey: 'A',
      bpm: 72,
      timeSignature: { beats: 4, value: 4 },
      duration: 120,
      stemsCount: 9,
      tags: ['Adoração', 'Ceia', 'Clamor'],
      uploadedBy: 'Equipe de Louvor Lagoinha JP',
      uploadedAt: '17/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/santo-pra-sempre',
      stems: [
        { id: 'st-1', name: 'Click (Metrônomo)', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria (Drums)', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Elétrica', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Warm Pad', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    }),
    new CloudSong({
      id: 'cloud-casa-e-sua',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      bpm: 130,
      timeSignature: { beats: 4, value: 4 },
      duration: 120,
      stemsCount: 9,
      tags: ['Worship', 'Celebração', 'Entrada'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '17/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/a-casa-e-sua',
      stems: [
        { id: 'st-1', name: 'Click (Metrônomo)', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria / Loops', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Elétrica', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Synth Pad', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    }),
    new CloudSong({
      id: 'cloud-vitorioso-es',
      title: 'Vitorioso És',
      artist: 'Gabriel Guedes',
      originalKey: 'D',
      bpm: 126,
      timeSignature: { beats: 4, value: 4 },
      duration: 120,
      stemsCount: 9,
      tags: ['Júbilo', 'Abertura de Culto'],
      uploadedBy: 'Equipe de Louvor Lagoinha JP',
      uploadedAt: '16/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/vitorioso-es',
      stems: [
        { id: 'st-1', name: 'Click (Metrônomo)', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria (Drums)', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Elétrica', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Synth Pad', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    }),
    new CloudSong({
      id: 'cloud-ousado-amor',
      title: 'Ousado Amor',
      artist: 'Isaías Saad',
      originalKey: 'Gb',
      bpm: 68,
      timeSignature: { beats: 6, value: 8 },
      duration: 120,
      stemsCount: 9,
      tags: ['Adoração', 'Ministração'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '15/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/ousado-amor',
      stems: [
        { id: 'st-1', name: 'Click 6/8', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria (Drums)', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Elétrica', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Pad Contínuo', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    }),
    new CloudSong({
      id: 'cloud-ruja-o-leao',
      title: 'Ruja o Leão',
      artist: 'Talita Catanzaro / FHOP',
      originalKey: 'Em',
      bpm: 74,
      timeSignature: { beats: 4, value: 4 },
      duration: 120,
      stemsCount: 9,
      tags: ['Adoração Profética', 'Clamor', 'Ceia'],
      uploadedBy: 'Equipe de Louvor Lagoinha JP',
      uploadedAt: '15/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/ruja-o-leao',
      stems: [
        { id: 'st-1', name: 'Click', type: 'click', fileSizeMb: 0.9 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 0.9 },
        { id: 'st-3', name: 'Bateria Pesada', type: 'drums', fileSizeMb: 1.4 },
        { id: 'st-4', name: 'Synth Bass', type: 'bass', fileSizeMb: 1.4 },
        { id: 'st-5', name: 'Violão Acústico', type: 'violao', fileSizeMb: 1.4 },
        { id: 'st-6', name: 'Guitarra Drive', type: 'guitars', fileSizeMb: 1.4 },
        { id: 'st-7', name: 'Piano & Strings', type: 'keys', fileSizeMb: 1.4 },
        { id: 'st-8', name: 'Warm Pad', type: 'pad', fileSizeMb: 1.4 },
        { id: 'st-9', name: 'Backing Vocals', type: 'vocals', fileSizeMb: 1.4 }
      ]
    })
  ];

  public async listAllSongs(): Promise<CloudSong[]> {
    return Promise.resolve([...this.library]);
  }

  public async searchSongs(query: string, filterKey?: string): Promise<CloudSong[]> {
    const q = query.toLowerCase().trim();
    return Promise.resolve(
      this.library.filter((s) => {
        const matchesQuery =
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q));

        const matchesKey = !filterKey || s.originalKey === filterKey;
        return matchesQuery && matchesKey;
      })
    );
  }

  public async getSongById(id: string): Promise<CloudSong | null> {
    const found = this.library.find((s) => s.id === id) || null;
    return Promise.resolve(found);
  }

  public async convertCloudSongToPlaybackSong(cloudSong: CloudSong): Promise<Song> {
    if (cloudSong.id === 'cloud-o-nosso-general') {
      const preset = DemoWorshipSongs.getPresetSongs().find(
        (s) => s.id === 'o-nosso-general'
      );
      if (preset) {
        return Promise.resolve(preset);
      }
    }

    const sections = [
      new SongSection({ id: `${cloudSong.id}-intro`, name: 'Intro', type: 'intro', startBar: 1, barCount: 6, startTime: 0, endTime: 18 }),
      new SongSection({ id: `${cloudSong.id}-v1`, name: 'Verso 1', type: 'verse', startBar: 7, barCount: 12, startTime: 18, endTime: 50 }),
      new SongSection({ id: `${cloudSong.id}-ref`, name: 'Refrão', type: 'chorus', startBar: 19, barCount: 12, startTime: 50, endTime: 86 }),
      new SongSection({ id: `${cloudSong.id}-ponte`, name: 'Ponte / Final', type: 'bridge', startBar: 31, barCount: 12, startTime: 86, endTime: 120 })
    ];

    const folder = FOLDER_BY_CLOUD_ID[cloudSong.id] || 'song-casa-sua';
    const customBlobs = this.uploadedBlobUrls.get(cloudSong.id);

    const stems = cloudSong.stems.map((st) => {
      let type: TrackStem['type'] = 'vocals';
      let fileName = 'vocals.mp3';
      if (st.type === 'click') {
        type = 'click';
        fileName = 'click.mp3';
      } else if (st.type === 'guide') {
        type = 'guide';
        fileName = 'guide.mp3';
      } else if (st.type === 'drums') {
        type = 'drums';
        fileName = 'drums.mp3';
      } else if (st.type === 'loop') {
        type = 'loop';
        fileName = 'loop.mp3';
      } else if (st.type === 'bass') {
        type = 'bass';
        fileName = 'bass.mp3';
      } else if (st.type === 'violao') {
        type = 'violao';
        fileName = 'violao.mp3';
      } else if (st.type === 'guitars') {
        type = 'guitars';
        fileName = 'guitarra.mp3';
      } else if (st.type === 'keys') {
        type = 'keys';
        fileName = 'keys.mp3';
      } else if (st.type === 'pad') {
        type = 'pad';
        fileName = 'pad.mp3';
      } else if (st.type === 'vocals' || st.type === 'fx') {
        type = 'vocals';
        fileName = 'vocals.mp3';
      }

      const audioUrl = customBlobs?.get(st.id) || `./stems/${folder}/${fileName}`;

      return new TrackStem({
        id: `${cloudSong.id}-${st.id}`,
        name: st.name,
        type,
        volume: type === 'click' ? 0.85 : type === 'guide' ? 0.95 : 1.0,
        pan: type === 'violao' ? -0.2 : type === 'guitars' ? 0.2 : 0,
        isMuted: false,
        isSolo: false,
        audioUrl
      });
    });

    return new Song({
      id: cloudSong.id,
      title: cloudSong.title,
      artist: cloudSong.artist,
      originalKey: cloudSong.originalKey,
      currentKey: cloudSong.originalKey,
      bpm: cloudSong.bpm,
      timeSignature: cloudSong.timeSignature,
      duration: cloudSong.duration,
      sections,
      stems
    });
  }

  public async uploadSong(newSong: Partial<CloudSong>, files: File[]): Promise<CloudSong> {
    const cloudId = `cloud-${Date.now()}`;
    const blobMap = new Map<string, string>();

    const stems = files.map((f, i) => {
      const stemId = `st-${i}`;
      const classified = TrackStem.classifyStemFromFilename(f.name);

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        blobMap.set(stemId, URL.createObjectURL(f));
      }

      return {
        id: stemId,
        name: classified.displayName,
        type: classified.type,
        fileSizeMb: parseFloat((f.size / (1024 * 1024)).toFixed(1))
      };
    });

    this.uploadedBlobUrls.set(cloudId, blobMap);

    const created = new CloudSong({
      id: cloudId,
      title: newSong.title || 'Novo VS',
      artist: newSong.artist || 'Lagoinha Worship',
      originalKey: newSong.originalKey || 'G',
      bpm: newSong.bpm || 120,
      timeSignature: newSong.timeSignature || { beats: 4, value: 4 },
      duration: newSong.duration || 120,
      stemsCount: files.length || 6,
      tags: newSong.tags || ['Culto'],
      uploadedBy: 'Ministro de Louvor (Lagoinha JP)',
      uploadedAt: 'Hoje',
      storageFolder: `gs://lagoinha-vs-cloud/tracks/${Date.now()}`,
      stems
    });

    this.library.unshift(created);
    return Promise.resolve(created);
  }
}
