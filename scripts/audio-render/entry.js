// Entrada empacotada (esbuild) e executada no Chromium: monta o grafo DE PRODUCAO num OfflineAudioContext.
// Sem mocks de AudioParam: AudioRoutingGraph.buildMasterRouting + createStemChannelStrip + applyStemRoutingGains
// (os mesmos modulos que o WebAudioEngine usa), com o mesmo ajuste de DSP de refreshDspChain para DSP "Flat".
import { buildMasterRouting, createStemChannelStrip, applyStemRoutingGains, stereoWidthFor } from '../../src/infrastructure/audio/AudioRoutingGraph';
import { TrackStem } from '../../src/domain/entities/TrackStem';
import { AudioRouting } from '../../src/domain/value-objects/AudioRouting';
import { VstPluginRackService } from '../../src/domain/services/VstPluginRackService';
import { PitchShifterDspNode } from '../../src/infrastructure/audio/PitchShifterDspNode';
import { MetronomeScheduler, TRANSPORT_START_MARGIN_S } from '../../src/infrastructure/audio/MetronomeScheduler';
import { Song } from '../../src/domain/entities/Song';

function b64ToF32(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}
function f32ToB64(f32) {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

/**
 * spec: { sampleRate, seconds, mode, stems: [{ id, type, name, pitchPolicy, data(b64 f32 mono ou L), dataR?(b64 f32 R), pan?, volume }],
 *         initial: semitones, commands: [{ t, st }] }
 * Devolve { channels: [b64 x4], sampleRate, info }.
 */
async function renderScenario(spec) {
  const sr = spec.sampleRate;
  const frames = Math.round(spec.seconds * sr);
  const ctx = new OfflineAudioContext(4, frames, sr);
  ctx.destination.channelCount = 4;
  ctx.destination.channelCountMode = 'explicit';
  ctx.destination.channelInterpretation = 'discrete';

  const master = buildMasterRouting(ctx, 1.0);
  const strips = [];
  for (const s of spec.stems) {
    const stem = new TrackStem({ id: s.id, name: s.name ?? s.id, type: s.type, volume: s.volume ?? 1, pan: s.pan ?? 0, isMuted: false, isSolo: false, pitchPolicy: s.pitchPolicy });
    const strip = createStemChannelStrip(ctx, stem, spec.initial ?? 0, { vsMerger: master.vsMerger, finalMerger: master.finalMerger });
    // Mesmo ajuste de DSP do WebAudioEngine.refreshDspChain (preset Flat)
    const dsp = stem.dsp;
    strip.highPassFilter.frequency.value = dsp.highPassHz;
    strip.tubeSaturator.curve = VstPluginRackService.createTubeSaturationCurve(dsp.driveAmount, 512);
    strip.compressor.threshold.setValueAtTime(0, 0);
    strip.compressor.ratio.setValueAtTime(1.0, 0);
    const gains = AudioRouting.calculateGains(stem.type, spec.mode, stem.pan, true, stem.volume);
    // Idem WebAudioEngine.applyMixerSettings: ganhos do modo + largura estéreo do stem
    applyStemRoutingGains(strip, gains, 0, stereoWidthFor(spec.mode, stem.type, stem.pan));
    const buf = ctx.createBuffer(s.dataR ? 2 : 1, frames, sr);
    const src = b64ToF32(s.data);
    buf.copyToChannel(src.subarray(0, Math.min(src.length, frames)), 0);
    if (s.dataR) {
      const srcR = b64ToF32(s.dataR);
      buf.copyToChannel(srcR.subarray(0, Math.min(srcR.length, frames)), 1);
    }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(strip.pitchShifter.input);
    node.start(0);
    strips.push({ stem, strip });
  }

  // Comandos no relogio do AudioContext (suspend/resume = granularidade de 128 amostras, como o quantum real)
  const cmds = [...(spec.commands ?? [])].sort((a, b) => a.t - b.t);
  for (const c of cmds) {
    const t = Math.round(c.t * sr / 128) * 128 / sr;
    ctx.suspend(t).then(() => {
      for (const { stem, strip } of strips) {
        // Idem WebAudioEngine.setPitchShift
        strip.pitchShifter.setPitchShiftable(stem.isPitchShiftable);
        strip.pitchShifter.setSemitones(c.st);
      }
      ctx.resume();
    });
  }
  const rendered = await ctx.startRendering();
  const channels = [];
  for (let c = 0; c < 4; c++) channels.push(f32ToB64(rendered.getChannelData(c).slice()));
  // Estado interno ao fim do render (campos privados lidos so para verificar stado final == ultimo comando)
  const state = strips.map(({ stem, strip }) => ({ id: stem.id, semitones: strip.pitchShifter.currentSemitones, wetActive: strip.pitchShifter.wetActive, pitchUp: strip.pitchShifter.pitchUp }));
  return { channels, sampleRate: sr, state };
}

/**
 * Click procedural REAL (MetronomeScheduler de producao) num OfflineAudioContext, com o setTimeout do agendador
 * dirigido por ctx.suspend a cada ~30 ms (o mesmo ritmo do SCHEDULER_INTERVAL_MS).
 * spec: { sampleRate, seconds, mode, switchTo?, switchAt?, skipReroute?, stopAt?, ignoreLead?, withStem?, withClick? }
 * - withStem: um stem de bateria (rajadas a cada 500 ms) iniciado no when comum (margem de partida) pelo PitchShifter.
 * - withClick: o metronomo procedural (start() com a margem de partida, como o WebAudioEngine.play()).
 */
async function renderClickScenario(spec) {
  const sr = spec.sampleRate;
  const frames = Math.round(spec.seconds * sr);
  const ctx = new OfflineAudioContext(4, frames, sr);
  ctx.destination.channelCount = 4;
  ctx.destination.channelCountMode = 'explicit';
  ctx.destination.channelInterpretation = 'discrete';
  const master = buildMasterRouting(ctx, 1.0);

  let mode = spec.mode;
  const T0 = TRANSPORT_START_MARGIN_S; // when comum de partida (posicao 0 da musica)
  const mkStem = (id, type) => new TrackStem({ id, name: id, type, volume: 1, pan: 0, isMuted: false, isSolo: false });
  const clickStem = mkStem('click', 'click');
  const drumsStem = mkStem('drums', 'drums');
  const song = new Song({ id: 's', title: 't', artist: 'a', originalKey: 'C', currentKey: 'C', bpm: 120, timeSignature: { beats: 4, value: 4 }, duration: 60, sections: [], stems: [clickStem, drumsStem] });

  if (spec.withStem) {
    const strip = createStemChannelStrip(ctx, drumsStem, 0, { vsMerger: master.vsMerger, finalMerger: master.finalMerger });
    strip.compressor.threshold.setValueAtTime(0, 0);
    strip.compressor.ratio.setValueAtTime(1.0, 0);
    applyStemRoutingGains(strip, AudioRouting.calculateGains('drums', mode, 0, true, 1), 0);
    const buf = ctx.createBuffer(1, frames, sr);
    const d = buf.getChannelData(0);
    for (let k = 0; k * 0.5 < spec.seconds - 0.1; k++) {
      const s0 = Math.round(k * 0.5 * sr);
      for (let i = 0; i < 480 && s0 + i < frames; i++) d[s0 + i] = 0.8 * Math.sin(2 * Math.PI * 1000 * i / sr) * Math.exp(-i / 160);
    }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(strip.pitchShifter.input);
    node.start(T0, 0);
  }

  let pendingTimer = null;
  // O agendador usa window.setTimeout/clearTimeout. O gancho vale SO enquanto o proprio agendador roda (start, pump,
  // stop): fora disso, qualquer outro codigo da pagina (ex.: o harness do Playwright) usaria o setTimeout falso.
  const realSetTimeout = window.setTimeout;
  const realClearTimeout = window.clearTimeout;
  const hooked = (f) => {
    window.setTimeout = (cb) => { pendingTimer = cb; return 1; };
    window.clearTimeout = () => { pendingTimer = null; };
    try { return f(); } finally { window.setTimeout = realSetTimeout; window.clearTimeout = realClearTimeout; }
  };
  const host = {
    getCtx: () => ctx,
    getSong: () => song,
    getRoutingMode: () => mode,
    getBuses: () => ({ vsMerger: master.vsMerger, finalMerger: master.finalMerger, channelMerger: master.finalMerger }),
    isPlaying: () => true,
    getPlaybackTime: () => ctx.currentTime - T0,
    getTransportLeadSec: spec.ignoreLead ? undefined : () => Math.max(0, T0 - ctx.currentTime),
    notifyState() {}
  };
  const scheduler = new MetronomeScheduler(host);
  scheduler.prepare(ctx);
  if (spec.withClick) {
    hooked(() => scheduler.start());
  }

  const quantum = (t) => Math.round(t * sr / 128) * 128 / sr;
  const times = new Set();
  for (let t = 0.03; t < spec.seconds - 0.05; t += 0.03) times.add(quantum(t));
  const swAt = spec.switchAt != null ? quantum(spec.switchAt) : null;
  const stAt = spec.stopAt != null ? quantum(spec.stopAt) : null;
  if (swAt != null) times.add(swAt);
  if (stAt != null) times.add(stAt);
  for (const t of [...times].sort((a, b) => a - b)) {
    ctx.suspend(t).then(() => {
      if (swAt != null && t === swAt) {
        mode = spec.switchTo; // WebAudioEngine.setRoutingMode: modo novo, depois religa os clicks pendentes
        if (!spec.skipReroute) scheduler.rerouteScheduled();
      }
      if (stAt != null && t === stAt) hooked(() => scheduler.stop()); // pause/stop/seek
      const fn = pendingTimer;
      pendingTimer = null;
      if (fn) hooked(fn);
      ctx.resume();
    });
  }
  const rendered = await ctx.startRendering();
  const channels = [];
  for (let c = 0; c < 4; c++) channels.push(f32ToB64(rendered.getChannelData(c).slice()));
  return { channels, sampleRate: sr, switchAt: swAt, stopAt: stAt };
}

window.AudioRender = { renderScenario, renderClickScenario, PitchShifterDspNode };
