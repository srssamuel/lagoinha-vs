import { describe, expect, it } from 'vitest';
import { applyAnalysisIfCurrent, KeyAnalysisSlot } from '../../../src/infrastructure/audio/KeyAnalysisSlot';
import { keyFromName, type SongKeyInfo } from '../../../src/domain/value-objects/SongKey';

describe('KeyAnalysisSlot', () => {
  it('nova análise exclusiva aborta a anterior e a deixa obsoleta', () => {
    const slot = new KeyAnalysisSlot();
    const a = slot.begin();
    const b = slot.begin();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    expect(b.signal.aborted).toBe(false);
    expect(b.isCurrent()).toBe(true);
  });

  it('cancelAll (reset/fechar o modal) aborta e invalida todas', () => {
    const slot = new KeyAnalysisSlot();
    const a = slot.begin();
    slot.cancelAll();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
  });

  it('cancelar só a análise (botão do operador) aborta sem tornar a importação obsoleta', () => {
    const slot = new KeyAnalysisSlot();
    const a = slot.begin();
    slot.abortAnalyses();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(true);
  });

  it('modo não exclusivo: Cancelar aborta todas as análises em andamento, não só a última', () => {
    const slot = new KeyAnalysisSlot();
    const a = slot.begin(false);
    const b = slot.begin(false);
    expect(a.signal.aborted).toBe(false);
    slot.abortAnalyses();
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it('análise concluída sai da lista e um Cancelar tardio não a afeta', () => {
    const slot = new KeyAnalysisSlot();
    const a = slot.begin(false);
    a.release();
    slot.abortAnalyses();
    expect(a.signal.aborted).toBe(false);
  });
});
describe('applyAnalysisIfCurrent', () => {
  it('ZIP B solto durante a análise de A não recebe o tom de A', async () => {
    const slot = new KeyAnalysisSlot();
    const applied: Array<string | null> = [];
    let finishA: (k: SongKeyInfo) => void = () => undefined;
    const runA = slot.begin();
    const pendingA = applyAnalysisIfCurrent(
      runA,
      () => new Promise<SongKeyInfo>((resolve) => (finishA = resolve)),
      (k) => applied.push(k.value)
    );
    const runB = slot.begin();
    await applyAnalysisIfCurrent(runB, async () => keyFromName('D'), (k) => applied.push(k.value));
    finishA(keyFromName('G')); // A termina tarde
    await pendingA;
    expect(applied).toEqual(['D']);
  });

  it('falha da análise atual vira sem tom; cancelamento não aplica nada', async () => {
    const slot = new KeyAnalysisSlot();
    const applied: Array<string | null> = [];
    await applyAnalysisIfCurrent(slot.begin(), async () => { throw new Error('x'); }, (k) => applied.push(k.value));
    const run = slot.begin();
    await applyAnalysisIfCurrent(run, async () => { throw new DOMException('c', 'AbortError'); }, (k) => applied.push(k.value));
    expect(applied).toEqual([null]);
  });
});
