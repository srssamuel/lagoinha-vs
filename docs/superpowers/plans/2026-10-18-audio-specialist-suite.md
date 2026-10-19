# Audio Specialist Pro Suite Implementation Plan

This plan implements the professional audio engineering features required for a tier-1 worship multitrack station, benchmarked against MultiTracks.com.br Playback and Ableton Live for Church.

## Proposed Architecture & Capabilities
1. **Master Bus Real-Time Spectrum Analyzer (FFT RTA) & Brickwall Limiter Gain Reduction Meter:**
   - Dedicated master output strip pinned to the right of `MultitrackMixer`.
   - 5-Band FFT RTA visualizer (Sub <60Hz, Low 60-250Hz, Mid 250-2.5kHz, High 2.5-8kHz, Air >8kHz).
   - Real-time Gain Reduction meter for Master Limiter №6 (-1.0 dBFS ceiling) to alert FOH engineers of clipping/distortion.
   - Master Stereo Peak L/R meter and dedicated master fader (0.0 to 1.5 with 0dB unity gain snap).
2. **Pre-Roll Count-In (Contagem Prévia de 1 ou 2 compassos):**
   - Click sounds for 1 or 2 bars ahead of stem playback, with visual count-in indicator in TransportBar.
   - Configurable count-in selector (OFF, 1 BAR, 2 BARS).
3. **Continuous Ambient Pad Flow & Key Crossfade:**
   - Smooth 2-second polyphonic crossfade between musical keys without abrupt interruption or silence.
   - "Auto-Follow Setlist" toggle in `AmbientPadBar` to seamlessly follow praise setlist songs.
4. **Mixer Quick Solos & "Clear All Solos" Global Command:**
   - Instant 1-click button to reset all solo tracks back to unity full mix.
   - `clearAllSolos()` in `WebAudioEngine` and `AudioEnginePort`.
5. **Multi-Output Routing Presets & Spacebar / ESC Keyboard Shortcuts:**
   - Dedicated global hotkeys: Spacebar (Play/Pause), ESC (Panic Mute), C (Solo Click), R (Repeat Section).

## Files to Modify & Create
- `src/application/ports/AudioEnginePort.ts`: Add `countInBars`, `isCountingIn`, `countInBeat`, `masterRta` to `AudioEngineState`; add `setCountInBars(bars)` and `clearAllSolos()`.
- `src/infrastructure/audio/WebAudioEngine.ts`: Wire master AnalyserNode, Limiter Gain Reduction computation, Pre-Roll count-in scheduler, `clearAllSolos()`.
- `src/infrastructure/audio/PolyphonicAmbientPad.ts`: Add `crossfadeTo(key, targetVolume, fadeSeconds)`.
- `src/presentation/components/MultitrackMixer.tsx`: Integrate Master Channel Strip (Fader, Peak L/R Meter, Limiter Gain Reduction, 5-Band RTA, Clear All Solos button).
- `src/presentation/components/TransportBar.tsx`: Add Pre-Roll Count-In toggle and visual count indicator.
- `src/presentation/components/AmbientPadBar.tsx`: Add Auto-Follow Setlist toggle.
- `src/presentation/App.tsx`: Connect master volume, count-in, keyboard shortcuts (Space, ESC, C, R), and pad auto-follow.
- `tests/unit/domain/AudioSpecialistSuite.test.ts`: Unit tests verifying RTA bands, Limiter Gain Reduction, Count-In, and Solo clear.

## Verification
- Run Vitest suite (`npm test`).
- Run TypeScript build (`npm run build`).
- Deploy to Firebase (`https://lagoinha-vs-jp.web.app`).
- Multi-viewport visual QA with `visual-qa.mjs` (375x667, 768x1024, 1440x900).
