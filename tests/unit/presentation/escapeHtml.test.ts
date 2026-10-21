import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../../src/presentation/utils/escapeHtml';

describe('escapeHtml (impressão da Cifra Pro)', () => {
  it('neutraliza tags e atributos vindos de título/letra importados', () => {
    const payload = '<img src=x onerror="alert(1)">Tá & "Pronto"\'';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('"');
    expect(escaped).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Tá &amp; &quot;Pronto&quot;&#39;');
  });

  it('aceita número e vazio', () => {
    expect(escapeHtml(120)).toBe('120');
    expect(escapeHtml(undefined)).toBe('');
  });
});
