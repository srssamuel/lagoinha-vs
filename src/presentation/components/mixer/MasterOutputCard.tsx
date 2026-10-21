import React, { useRef } from 'react';
import { Sliders } from 'lucide-react';
import { MasterRtaData, MeterSource } from '../../../application/ports/AudioEnginePort';
import { useMeterListener } from '../../hooks/useMeterListener';
import { MixerFader, FaderTrimButtons } from './MixerFader';
import { masterPeakColor, masterPeakPercent } from './meterMath';

interface MasterOutputCardProps {
  isPlaying: boolean;
  masterVolume: number;
  meterSource?: MeterSource;
  onMasterVolumeChange?: (vol: number) => void;
}

type RtaBand = keyof Pick<MasterRtaData, 'sub' | 'low' | 'mid' | 'high' | 'air'>;

const RTA_BANDS: { key: RtaBand; label: string; color: string; title: string }[] = [
  { key: 'sub', label: 'SUB', color: 'bg-indigo-500', title: 'SUBGRAVE (<60Hz): Peso do bumbo e subgraves eletrônicos' },
  { key: 'low', label: 'LOW', color: 'bg-blue-500', title: 'GRAVES (60-250Hz): Linha de contrabaixo e corpo rítmico' },
  { key: 'mid', label: 'MID', color: 'bg-emerald-500', title: 'MÉDIOS (250Hz-2.5kHz): Vocais, guitarras elétricas e piano' },
  { key: 'high', label: 'HIGH', color: 'bg-amber-500', title: 'AGUDOS (2.5kHz-8kHz): Ataque da caixa, estalo e violão' },
  { key: 'air', label: 'AIR', color: 'bg-rose-500', title: 'AR (>8kHz): Pratos da bateria, reverberação e ambiência' }
];

const LIMITER_IDLE_CLASS = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
const LIMITER_ACTIVE_CLASS = 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse';

/** Master Output Channel Strip (FOH & Stage Master Bus): Limiter №6, RTA 5 bandas, peaks L/R e fader. */
export const MasterOutputCard: React.FC<MasterOutputCardProps> = ({
  isPlaying,
  masterVolume,
  meterSource,
  onMasterVolumeChange
}) => {
  const limiterRef = useRef<HTMLSpanElement>(null);
  const bandRefs = useRef<Partial<Record<RtaBand, HTMLDivElement | null>>>({});
  const peakLRef = useRef<HTMLDivElement>(null);
  const peakRRef = useRef<HTMLDivElement>(null);

  useMeterListener(meterSource, ({ masterRta }) => {
    for (const band of RTA_BANDS) {
      const el = bandRefs.current[band.key];
      if (el) el.style.height = `${Math.round(masterRta[band.key] * 100)}%`;
    }
    const paintPeak = (el: HTMLDivElement | null, peak: number, side: 'L' | 'R') => {
      if (!el) return;
      el.style.transform = `scaleY(${masterPeakPercent(peak) / 100})`;
      el.style.backgroundColor = masterPeakColor(peak, side);
    };
    paintPeak(peakLRef.current, masterRta.peakL, 'L');
    paintPeak(peakRRef.current, masterRta.peakR, 'R');

    const limiter = limiterRef.current;
    if (limiter) {
      const label = masterRta.isLimiting ? `${masterRta.gainReductionDb}dB GR` : 'LIM №6';
      if (limiter.textContent !== label) limiter.textContent = label;
      const stateClass = masterRta.isLimiting ? LIMITER_ACTIVE_CLASS : LIMITER_IDLE_CLASS;
      if (limiter.dataset.state !== stateClass) {
        limiter.dataset.state = stateClass;
        limiter.className = `text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${stateClass}`;
      }
    }
  });

  const setVolume = (vol: number) => onMasterVolumeChange?.(vol);

  return (
    <div className="w-36 flex flex-col items-center bg-[#10141f] border-2 border-blue-500/40 rounded-2xl p-2.5 shadow-2xl relative shrink-0">
      {/* Header do Master Bus */}
      <div className="w-full flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5">
        <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1">
          <Sliders className="w-3 h-3 text-blue-400" />
          <span>MASTER</span>
        </span>
        <span
          ref={limiterRef}
          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${LIMITER_IDLE_CLASS}`}
          title="Master Brickwall Limiter №6 (-1.0 dBFS Ceiling): Impede distorção no PA da igreja"
        >
          LIM №6
        </span>
      </div>

      {/* RTA 5 Bandas em Tempo Real (Sub, Low, Mid, High, Air) */}
      <div className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-1.5 mb-2">
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 mb-1">
          <span>RTA FFT</span>
          <span className="text-blue-300 font-bold">{isPlaying ? 'LIVE' : 'IDLE'}</span>
        </div>
        <div className="grid grid-cols-5 gap-1 h-10 items-end bg-slate-900/60 p-1 rounded">
          {RTA_BANDS.map((band) => (
            <div key={band.key} className="flex flex-col items-center h-full justify-end cursor-help" title={band.title}>
              <div
                ref={(el) => {
                  bandRefs.current[band.key] = el;
                }}
                className={`w-full ${band.color} rounded-xs min-h-[2px]`}
                style={{ height: '0%' }}
              />
              <span className="text-[7px] font-mono text-slate-500 mt-0.5">{band.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Medidores Estéreo Master L/R + Fader Vertical */}
      <div className="flex items-center justify-center gap-2 w-full my-auto">
        <div className="flex items-center gap-1 h-32 py-1">
          <div className="w-2 h-full bg-slate-950 rounded-xs overflow-hidden border border-slate-800">
            <div ref={peakLRef} className="w-full h-full rounded-xs origin-bottom will-change-transform" style={{ transform: 'scaleY(0)' }} />
          </div>
          <div className="w-2 h-full bg-slate-950 rounded-xs overflow-hidden border border-slate-800">
            <div ref={peakRRef} className="w-full h-full rounded-xs origin-bottom will-change-transform" style={{ transform: 'scaleY(0)' }} />
          </div>
        </div>

        <MixerFader
          value={masterVolume}
          max={1.5}
          step={0.01}
          label="Master"
          unityLineClassName="bg-blue-400/60"
          onChange={setVolume}
        />
      </div>

      {/* Ajuste Fino Master (- / 0dB / +) */}
      <div className="flex items-center justify-between gap-1 w-full mt-2">
        <FaderTrimButtons
          value={masterVolume}
          max={1.5}
          nudge={0.1}
          label="Master"
          centerClassName="bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30"
          plusHoverClassName="hover:border-blue-400"
          onChange={setVolume}
        />
      </div>
    </div>
  );
};
