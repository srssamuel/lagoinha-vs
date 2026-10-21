import { describe, it, expect } from 'vitest';
import { NewServiceSetlist, SetlistRepositoryPort } from '../../src/application/ports/SetlistRepositoryPort';
import { SetlistConflictError } from '../../src/domain/entities/ServiceSetlist';
import { LocalSetlistRepository, MemoryKeyValueStore } from '../../src/infrastructure/storage/LocalSetlistRepository';

const adapters: Array<[string, () => SetlistRepositoryPort]> = [
  ['LocalSetlistRepository', () => new LocalSetlistRepository(new MemoryKeyValueStore())]
];

const draft = (overrides: Partial<NewServiceSetlist> = {}): NewServiceSetlist => ({
  id: 'culto-domingo',
  churchId: 'igreja-a',
  title: 'Culto de Domingo',
  serviceDate: '2026-10-25',
  status: 'draft',
  updatedBy: 'u-leader',
  items: [{ order: 1, source: 'global', songId: 'cloud-o-nosso-general', versionId: 'v1' }],
  ...overrides
});

describe.each(adapters)('SetlistRepositoryPort: %s', (_name, make) => {
  it('cria com revisão 1 e cada gravação sobe a revisão', async () => {
    const repo = make();
    const created = await repo.create(draft());
    expect(created.revision).toBe(1);
    const saved = await repo.save({ ...created, title: 'Culto da Família' }, 1);
    expect(saved.revision).toBe(2);
    expect((await repo.get('igreja-a', 'culto-domingo'))?.title).toBe('Culto da Família');
  });

  it('segunda escrita com revisão velha falha com conflito, sem merge', async () => {
    const repo = make();
    const created = await repo.create(draft());
    const deviceA = { ...created };
    const deviceB = { ...created };

    await repo.save({ ...deviceA, title: 'Versão do líder', updatedBy: 'u-leader' }, deviceA.revision);
    const late = repo.save({ ...deviceB, title: 'Versão atrasada', updatedBy: 'u-admin' }, deviceB.revision);

    await expect(late).rejects.toBeInstanceOf(SetlistConflictError);
    await expect(late).rejects.toThrow(/u-leader/);
    expect((await repo.get('igreja-a', 'culto-domingo'))?.title).toBe('Versão do líder');
  });

  it('I2: setlists de uma igreja não aparecem na outra', async () => {
    const repo = make();
    await repo.create(draft());
    expect(await repo.list('igreja-b')).toEqual([]);
    expect(await repo.get('igreja-b', 'culto-domingo')).toBeNull();
    await expect(repo.save({ ...draft(), churchId: 'igreja-b', revision: 1, updatedAt: '' }, 1)).rejects.toThrow();
  });

  it('id repetido na mesma igreja é recusado', async () => {
    const repo = make();
    await repo.create(draft());
    await expect(repo.create(draft())).rejects.toThrow(/Já existe/);
  });
});
