const NOTE_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Classe de altura (0–11) da fundamental do tom: "Gb" e "F#m" -> 6. Null se não reconhecer. */
export function pitchClass(key: string | null | undefined): number | null {
  const match = /^\s*([A-Ga-g])([#b]?)/.exec(key ?? '');
  if (!match) return null;
  const base = NOTE_PITCH[match[1]!.toUpperCase()]!;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (base + accidental + 12) % 12;
}

/** "Em", "F#m", "Bbm" são menores; "B", "Bb" e "Dm7"... só olha o sufixo depois da fundamental. */
export function isMinorKey(key: string | null | undefined): boolean {
  return /^\s*[A-Ga-g][#b]?m(?!aj)/.test(key ?? '');
}
