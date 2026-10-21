// Pagina de captura dos estados do tom (so desenvolvimento): renderiza a barra do mixer com cada estado.
//   ui.html?state=unknown|ambiguous|estimated|confirmed|named
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { MixerToolbar } from '/src/presentation/components/mixer/MixerToolbar.tsx';
import { keyFromAudio, keyFromName, manualKey, UNKNOWN_KEY } from '/src/domain/value-objects/SongKey.ts';

const est = (over) => ({ key: 'F', correlation: 0.8, margin: 0.2, candidates: ['F'], ambiguous: false, chroma: [], ...over });
const states = {
  unknown: { info: UNKNOWN_KEY, shift: 2 },
  ambiguous: { info: keyFromAudio(est({ key: 'G', candidates: ['G', 'Em'], ambiguous: true })), shift: 0 },
  estimated: { info: keyFromAudio(est({})), shift: 0 },
  confirmed: { info: manualKey('F'), shift: 2 },
  named: { info: keyFromName('F'), shift: 0 }
};
const state = new URLSearchParams(location.search).get('state') ?? 'unknown';
const { info, shift } = states[state];
const noop = () => {};
const transposed = info.value ? ['F', 'F#', 'G', 'G#'][shift] ?? info.value : null;

createRoot(document.getElementById('root')).render(
  React.createElement(
    'div',
    { className: 'p-4' },
    React.createElement(MixerToolbar, {
      stems: [], filterGroup: 'ALL', onFilterGroupChange: noop,
      originalKey: info.value, currentKey: transposed, keyInfo: info, onConfirmKey: noop,
      pitchShiftSemitones: shift, isSoloClickActive: false, ensaioTarget: 'guitars', ensaioMode: 'AUMENTADA',
      onToggleMute: noop, onToggleSolo: noop, onResetMixer: noop, onPitchShiftChange: noop
    })
  )
);
