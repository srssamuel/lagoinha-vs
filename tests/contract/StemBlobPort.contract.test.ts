import { describe, it, expect } from 'vitest';
import { StemBlobPort } from '../../src/application/ports/StemBlobPort';
import { LocalStemStore } from '../../src/infrastructure/storage/LocalStemStore';

const adapters: Array<[string, () => StemBlobPort]> = [['LocalStemStore', () => new LocalStemStore()]];

describe.each(adapters)('StemBlobPort: %s', (_name, make) => {
  it('put devolve o sha256 do conteúdo e get devolve os mesmos bytes', async () => {
    const store = make();
    // sha256("abc"), vetor de teste do FIPS 180-2
    const sha = await store.put(new Blob(['abc']));
    expect(sha).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const back = await store.get(sha);
    expect(back).not.toBeNull();
    expect(await back!.text()).toBe('abc');
    expect(await store.has(sha)).toBe(true);
  });

  it('mesmo conteúdo, mesma chave; conteúdo diferente, chave diferente', async () => {
    const store = make();
    const a = await store.put(new Blob(['stem']));
    const b = await store.put(new Blob(['stem']));
    const c = await store.put(new Blob(['stem2']));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('chave inexistente ou malformada não devolve nada', async () => {
    const store = make();
    expect(await store.get('0'.repeat(64))).toBeNull();
    expect(await store.get('../stems/x')).toBeNull();
    expect(await store.has('ZZ')).toBe(false);
  });
});
