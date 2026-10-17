import { CloudSong } from '../../domain/entities/CloudSong';
import { CloudVSRepositoryPort } from '../../application/ports/CloudVSRepositoryPort';
import { Song } from '../../domain/entities/Song';
import { TrackStem } from '../../domain/entities/TrackStem';
import { SongSection } from '../../domain/value-objects/SongSection';

export class DemoCloudVSLibrary implements CloudVSRepositoryPort {
  private library: CloudSong[] = [
    new CloudSong({
      id: 'cloud-casa-e-sua',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      bpm: 130,
      timeSignature: { beats: 4, value: 4 },
      duration: 320,
      stemsCount: 8,
      tags: ['Worship', 'Celebração', 'Entrada'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '17/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/a-casa-e-sua',
      stems: [
        { id: 'st-1', name: 'Click', type: 'click', fileSizeMb: 2.1 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 4.8 },
        { id: 'st-3', name: 'Bateria / Loops', type: 'drums', fileSizeMb: 12.4 },
        { id: 'st-4', name: 'Baixo (Bass)', type: 'bass', fileSizeMb: 9.6 },
        { id: 'st-5', name: 'Guitarras', type: 'guitars', fileSizeMb: 15.2 },
        { id: 'st-6', name: 'Teclado / Piano', type: 'keys', fileSizeMb: 11.0 },
        { id: 'st-7', name: 'Synth Pad', type: 'pad', fileSizeMb: 8.5 },
        { id: 'st-8', name: 'Backing Vocals', type: 'fx', fileSizeMb: 7.2 }
      ]
    }),
    new CloudSong({
      id: 'cloud-ruja-o-leao',
      title: 'Ruja o Leão',
      artist: 'Talitha Pereira / FHOP',
      originalKey: 'Em',
      bpm: 74,
      timeSignature: { beats: 4, value: 4 },
      duration: 410,
      stemsCount: 9,
      tags: ['Adoração Profética', 'Clamor', 'Ceia'],
      uploadedBy: 'Equipe de Louvor Lagoinha JP',
      uploadedAt: '15/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/ruja-o-leao',
      stems: [
        { id: 'st-1', name: 'Click', type: 'click', fileSizeMb: 2.4 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 5.1 },
        { id: 'st-3', name: 'Bateria Pesada', type: 'drums', fileSizeMb: 14.2 },
        { id: 'st-4', name: 'Synth Bass', type: 'bass', fileSizeMb: 11.3 },
        { id: 'st-5', name: 'Gtr Drive', type: 'guitars', fileSizeMb: 16.0 },
        { id: 'st-6', name: 'Piano & Strings', type: 'keys', fileSizeMb: 12.8 },
        { id: 'st-7', name: 'Warm Pad', type: 'pad', fileSizeMb: 10.1 }
      ]
    }),
    new CloudSong({
      id: 'cloud-bondade-de-deus',
      title: 'Bondade de Deus',
      artist: 'Isaías Saad',
      originalKey: 'Ab',
      bpm: 70,
      timeSignature: { beats: 4, value: 4 },
      duration: 340,
      stemsCount: 7,
      tags: ['Intimidade', 'Ofertório', 'Ministração'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '12/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/bondade-de-deus',
      stems: [
        { id: 'st-1', name: 'Click', type: 'click', fileSizeMb: 2.0 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 4.5 },
        { id: 'st-3', name: 'Bateria', type: 'drums', fileSizeMb: 11.0 },
        { id: 'st-4', name: 'Baixo Acústico', type: 'bass', fileSizeMb: 8.9 },
        { id: 'st-5', name: 'Violão Aço', type: 'guitars', fileSizeMb: 13.4 },
        { id: 'st-6', name: 'Piano Rhodes', type: 'keys', fileSizeMb: 10.2 },
        { id: 'st-7', name: 'Atmosphere Pad', type: 'pad', fileSizeMb: 9.1 }
      ]
    }),
    new CloudSong({
      id: 'cloud-ele-vem',
      title: 'Ele Vem (O Céu Se Abre)',
      artist: 'Gabriel Guedes',
      originalKey: 'D',
      bpm: 124,
      timeSignature: { beats: 4, value: 4 },
      duration: 290,
      stemsCount: 8,
      tags: ['Júbilo', 'Abertura de Culto'],
      uploadedBy: 'Equipe de Louvor Lagoinha JP',
      uploadedAt: '10/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/ele-vem',
      stems: [
        { id: 'st-1', name: 'Click', type: 'click', fileSizeMb: 2.1 },
        { id: 'st-2', name: 'Guia Vocal', type: 'guide', fileSizeMb: 4.8 },
        { id: 'st-3', name: 'Drums', type: 'drums', fileSizeMb: 13.5 },
        { id: 'st-4', name: 'Bass', type: 'bass', fileSizeMb: 9.0 },
        { id: 'st-5', name: 'Lead Guitars', type: 'guitars', fileSizeMb: 14.8 },
        { id: 'st-6', name: 'Synth Arp', type: 'keys', fileSizeMb: 11.2 }
      ]
    }),
    new CloudSong({
      id: 'cloud-me-atraiu',
      title: 'Me Atraiu',
      artist: 'Gabriela Rocha',
      originalKey: 'E',
      bpm: 68,
      timeSignature: { beats: 6, value: 8 },
      duration: 380,
      stemsCount: 7,
      tags: ['Clamor', 'Palavra'],
      uploadedBy: 'Leandro Machado (Lagoinha JP)',
      uploadedAt: '08/10/2026',
      storageFolder: 'gs://lagoinha-vs-cloud/tracks/me-atraiu',
      stems: [
        { id: 'st-1', name: 'Click 6/8', type: 'click', fileSizeMb: 2.3 },
        { id: 'st-2', name: 'Guia', type: 'guide', fileSizeMb: 5.0 },
        { id: 'st-3', name: 'Bateria', type: 'drums', fileSizeMb: 12.0 },
        { id: 'st-4', name: 'Baixo', type: 'bass', fileSizeMb: 8.5 },
        { id: 'st-5', name: 'Piano & Pad', type: 'keys', fileSizeMb: 14.0 }
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
    const barSeconds = (60 / cloudSong.bpm) * cloudSong.timeSignature.beats;

    const sections = [
      new SongSection({ id: `${cloudSong.id}-intro`, name: 'Intro', type: 'intro', startBar: 1, barCount: 4, startTime: 0, endTime: 4 * barSeconds }),
      new SongSection({ id: `${cloudSong.id}-v1`, name: 'Verso 1', type: 'verse', startBar: 5, barCount: 8, startTime: 4 * barSeconds, endTime: 12 * barSeconds }),
      new SongSection({ id: `${cloudSong.id}-ref`, name: 'Refrão', type: 'chorus', startBar: 13, barCount: 8, startTime: 12 * barSeconds, endTime: 20 * barSeconds }),
      new SongSection({ id: `${cloudSong.id}-ponte`, name: 'Ponte', type: 'bridge', startBar: 21, barCount: 8, startTime: 20 * barSeconds, endTime: 28 * barSeconds }),
      new SongSection({ id: `${cloudSong.id}-vamp`, name: 'Espontâneo', type: 'vamp', startBar: 29, barCount: 8, startTime: 28 * barSeconds, endTime: 36 * barSeconds }),
      new SongSection({ id: `${cloudSong.id}-final`, name: 'Final', type: 'outro', startBar: 37, barCount: 4, startTime: 36 * barSeconds, endTime: 40 * barSeconds })
    ];

    const stems = cloudSong.stems.map((st) => {
      let type: TrackStem['type'] = 'fx';
      if (st.type === 'click') type = 'click';
      else if (st.type === 'guide') type = 'guide';
      else if (st.type === 'drums') type = 'drums';
      else if (st.type === 'bass') type = 'bass';
      else if (st.type === 'guitars') type = 'guitars';
      else if (st.type === 'keys') type = 'keys';
      else if (st.type === 'pad') type = 'pad';

      return new TrackStem({
        id: st.id,
        name: st.name,
        type,
        volume: type === 'click' ? 0.85 : type === 'guide' ? 0.9 : 0.75,
        pan: 0,
        isMuted: false,
        isSolo: false
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
    const created = new CloudSong({
      id: `cloud-${Date.now()}`,
      title: newSong.title || 'Novo VS',
      artist: newSong.artist || 'Lagoinha Worship',
      originalKey: newSong.originalKey || 'G',
      bpm: newSong.bpm || 120,
      timeSignature: newSong.timeSignature || { beats: 4, value: 4 },
      duration: newSong.duration || 300,
      stemsCount: files.length || 6,
      tags: newSong.tags || ['Culto'],
      uploadedBy: 'Ministro de Louvor (Lagoinha JP)',
      uploadedAt: 'Hoje',
      storageFolder: `gs://lagoinha-vs-cloud/tracks/${Date.now()}`,
      stems: files.map((f, i) => ({
        id: `st-${i}`,
        name: f.name.replace(/\.[^/.]+$/, ''),
        type: 'other',
        fileSizeMb: parseFloat((f.size / (1024 * 1024)).toFixed(1))
      }))
    });

    this.library.unshift(created);
    return Promise.resolve(created);
  }
}
