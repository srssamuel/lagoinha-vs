import { describe, expect, it } from 'vitest';
import { getPwaSnapshot, patchPwa, shouldOfferUpdate, subscribePwa } from '../../../src/infrastructure/pwa/pwaStore';

describe('pwaStore — momento seguro de atualizar', () => {
  it('nunca oferece atualização com reprodução/pad ao vivo', () => {
    expect(shouldOfferUpdate({ updatePending: true, live: true, dismissed: false })).toBe(false);
  });

  it('oferece só com atualização pendente, palco parado e sem adiamento', () => {
    expect(shouldOfferUpdate({ updatePending: true, live: false, dismissed: false })).toBe(true);
    expect(shouldOfferUpdate({ updatePending: false, live: false, dismissed: false })).toBe(false);
    expect(shouldOfferUpdate({ updatePending: true, live: false, dismissed: true })).toBe(false);
  });

  it('notifica assinantes e distingue app offline de atualização pendente', () => {
    let calls = 0;
    const off = subscribePwa(() => calls++);
    patchPwa({ shell: 'ready' });
    expect(getPwaSnapshot()).toMatchObject({ shell: 'ready', updatePending: false });
    patchPwa({ updatePending: true });
    expect(getPwaSnapshot().updatePending).toBe(true);
    expect(calls).toBe(2);
    off();
    patchPwa({ updatePending: false });
    expect(calls).toBe(2);
  });
});
