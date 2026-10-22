import { describe, expect, it } from 'vitest';
import { catalogIds, parsePackageName, planSelection } from '../../../src/domain/services/CatalogPackage';
import { Sha256, sha256OfBlob } from '../../../src/infrastructure/storage/sha256Incremental';

describe('planSelection', () => {
  it('cada ZIP vira uma música, avulsos agrupam por pasta e o resto aparece recusado com motivo', () => {
    const plan = planSelection([
      { name: 'A 120bpm - G.zip', size: 10 },
      { name: 'B.zip', size: 20 },
      { name: 'click.wav', size: 5, relativePath: 'Musica C/click.wav' },
      { name: 'bass.wav', size: 5, relativePath: 'Musica C/bass.wav' },
      { name: 'drums.wav', size: 5, relativePath: 'Musica D/drums.wav' },
      { name: 'capa.jpg', size: 3 },
      { name: 'vazio.wav', size: 0 }
    ]);
    expect(plan.groups.filter((g) => g.kind === 'zip').map((g) => g.label)).toEqual(['A 120bpm - G.zip', 'B.zip']);
    const stems = plan.groups.filter((g) => g.kind === 'stems');
    expect(stems.map((g) => g.label).sort()).toEqual(['Musica C', 'Musica D']);
    expect(plan.rejected).toEqual([
      { name: 'capa.jpg', reason: 'não é áudio nem .zip' },
      { name: 'vazio.wav', reason: 'arquivo vazio' }
    ]);
  });

  it('arquivos soltos sem pasta viram uma única música', () => {
    const plan = planSelection([
      { name: 'click.wav', size: 1 },
      { name: 'guia.wav', size: 1 },
      { name: 'bass.wav', size: 1 }
    ]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]).toMatchObject({ kind: 'stems', label: '3 stems avulsos' });
  });
});

describe('parsePackageName', () => {
  it('lê título, versão, BPM e tom do nome', () => {
    expect(parsePackageName('Canção Exemplo (Versão Ao Vivo) 140Bpm - B.zip')).toEqual({
      title: 'Canção Exemplo',
      artist: 'Versão Ao Vivo',
      bpm: 140,
      key: 'B'
    });
  });

  it('não inventa: sem BPM, tom ou artista no nome fica null', () => {
    const info = parsePackageName('Musica Nova.zip');
    expect(info).toEqual({ title: 'Musica Nova', artist: null, bpm: null, key: null });
  });
});

describe('catalogIds', () => {
  const m = [
    { sha256: 'a'.repeat(64), name: 'click.wav', type: 'click', size: 1 },
    { sha256: 'b'.repeat(64), name: 'bass.wav', type: 'bass', size: 2 }
  ];

  it('são estáveis: o mesmo pacote gera os mesmos ids (confirmar de novo não duplica)', async () => {
    expect(await catalogIds(m)).toEqual(await catalogIds([...m]));
  });

  it('mudar a função de um stem gera versão nova da mesma música', async () => {
    const a = await catalogIds(m);
    const b = await catalogIds([m[0]!, { ...m[1]!, type: 'keys' }]);
    expect(b.songId).toBe(a.songId);
    expect(b.versionId).not.toBe(a.versionId);
  });
});

describe('sha256 incremental', () => {
  const hex = async (bytes: Uint8Array) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

  it('bate com o WebCrypto em tamanhos de borda e em pedaços irregulares', async () => {
    for (const size of [0, 1, 55, 56, 63, 64, 65, 1000, 70_001]) {
      const data = new Uint8Array(size).map((_, i) => (i * 31 + 7) & 0xff);
      const h = new Sha256();
      for (let i = 0; i < size; i += 777) h.update(data.subarray(i, Math.min(size, i + 777)));
      expect(h.hex()).toBe(await hex(data));
    }
  });

  it('sha256OfBlob dá o mesmo hash que o WebCrypto', async () => {
    const data = new Uint8Array(300_000).map((_, i) => i & 0xff);
    expect(await sha256OfBlob(new Blob([data]))).toBe(await hex(data));
  });
});
