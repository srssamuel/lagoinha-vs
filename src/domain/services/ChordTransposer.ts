const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
};

const SCALE_DEGREE_MAP: Record<number, string> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: '#4',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7'
};

export class ChordTransposer {
  public static transposeNote(note: string, semitones: number, preferFlats = false): string {
    const base = NOTE_TO_SEMITONE[note];
    if (base === undefined) return note;
    const nextIdx = (((base + semitones) % 12) + 12) % 12;
    const scale = preferFlats ? NOTES_FLAT : NOTES_SHARP;
    return scale[nextIdx] ?? note;
  }

  public static transposeKey(key: string, semitones: number): string {
    if (semitones === 0) return key;
    const match = key.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return key;
    const [, root = 'C', suffix = ''] = match;
    const preferFlats = semitones < 0 || root.includes('b');
    return `${ChordTransposer.transposeNote(root, semitones, preferFlats)}${suffix}`;
  }

  public static transposeChordToken(token: string, semitones: number): string {
    if (semitones === 0) return token;
    return token.replace(/([A-G][#b]?)/g, (note) =>
      ChordTransposer.transposeNote(note, semitones, semitones < 0)
    );
  }

  public static transposeChordLine(line: string, semitones: number): string {
    if (semitones === 0) return line;
    return line.replace(/\b([A-G][#b]?[a-zA-Z0-9#b/]*)/g, (chord) =>
      ChordTransposer.transposeChordToken(chord, semitones)
    );
  }

  public static toNashvilleLine(line: string, songKey: string): string {
    const keyMatch = songKey.match(/^([A-G][#b]?)/);
    const keyRoot = keyMatch?.[1] ?? 'C';
    const keySemitone = NOTE_TO_SEMITONE[keyRoot] ?? 0;

    return line.replace(/\b([A-G][#b]?)([a-zA-Z0-9#b]*)/g, (_full, root: string, suffix: string) => {
      const rootSemitone = NOTE_TO_SEMITONE[root];
      if (rootSemitone === undefined) return _full;
      const interval = (((rootSemitone - keySemitone) % 12) + 12) % 12;
      const degree = SCALE_DEGREE_MAP[interval] ?? '1';
      return `${degree}${suffix}`;
    });
  }
}
