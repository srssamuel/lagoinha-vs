import React, { useState } from 'react';
import { TrackStem, StemType } from '../../domain/entities/TrackStem';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { EnsaioMixMode } from '../../domain/services/EnsaioMixService';
import { MeterSource } from '../../application/ports/AudioEnginePort';
import { MixerToolbar, MixerFilterGroup, matchesFilterGroup } from './mixer/MixerToolbar';
import { StemChannelStrip } from './mixer/StemChannelStrip';
import { MasterOutputCard } from './mixer/MasterOutputCard';

interface MultitrackMixerProps {
  stems: TrackStem[];
  routingMode: RoutingMode;
  isPlaying: boolean;
  isSoloClickActive: boolean;
  /** Fonte dos medidores (VU/RTA), desenhados por requestAnimationFrame fora do React. */
  meterSource?: MeterSource;
  originalKey?: string;
  currentKey?: string;
  pitchShiftSemitones?: number;
  masterVolume?: number;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
  onClearAllSolos?: () => void;
  onMasterVolumeChange?: (vol: number) => void;
  onResetMixer: () => void;
  onPitchShiftChange?: (semitones: number) => void;
  onTogglePitchLock?: (stemId: string) => void;
  onApplyEnsaioMix?: (targetType: StemType, mode: EnsaioMixMode) => void;
  onOpenVstRack?: (stemId?: string) => void;
  onAutoFixAllStems?: () => void;
}

export const MultitrackMixer: React.FC<MultitrackMixerProps> = ({
  stems,
  routingMode,
  isPlaying,
  isSoloClickActive,
  meterSource,
  originalKey = 'B',
  currentKey = 'B',
  pitchShiftSemitones = 0,
  masterVolume = 1.0,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onClearAllSolos,
  onMasterVolumeChange,
  onResetMixer,
  onPitchShiftChange,
  onTogglePitchLock,
  onApplyEnsaioMix,
  onOpenVstRack,
  onAutoFixAllStems
}) => {
  const [filterGroup, setFilterGroup] = useState<MixerFilterGroup>('ALL');
  const [ensaioTarget, setEnsaioTarget] = useState<StemType>('guitars');
  const [ensaioMode, setEnsaioMode] = useState<EnsaioMixMode>('PADRAO');
  const hasAnySolo = stems.some((s) => s.isSolo);

  const triggerEnsaioMix = (target: StemType, mode: EnsaioMixMode) => {
    setEnsaioTarget(target);
    setEnsaioMode(mode);
    onApplyEnsaioMix?.(target, mode);
  };

  return (
    <div className="flex-1 bg-[#0c0c0e] p-3.5 lg:p-4 overflow-x-auto select-none flex flex-col justify-between">
      <MixerToolbar
        stems={stems}
        filterGroup={filterGroup}
        onFilterGroupChange={setFilterGroup}
        originalKey={originalKey}
        currentKey={currentKey}
        pitchShiftSemitones={pitchShiftSemitones}
        isSoloClickActive={isSoloClickActive}
        ensaioTarget={ensaioTarget}
        ensaioMode={ensaioMode}
        onTriggerEnsaioMix={onApplyEnsaioMix ? triggerEnsaioMix : undefined}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
        onClearAllSolos={onClearAllSolos}
        onResetMixer={() => {
          setEnsaioMode('PADRAO');
          onResetMixer();
        }}
        onPitchShiftChange={onPitchShiftChange}
        onOpenVstRack={onOpenVstRack}
        onAutoFixAllStems={onAutoFixAllStems}
      />

      {/* Canais do Mixer */}
      <div className="flex items-stretch gap-2 min-w-max pb-1">
        {stems
          .filter((stem) => matchesFilterGroup(stem, filterGroup))
          .map((stem) => {
            const isAudible =
              stem.isAudible(hasAnySolo) && !(isSoloClickActive && stem.type !== 'click' && stem.type !== 'guide');

            return (
              <StemChannelStrip
                key={stem.id}
                stem={stem}
                routingMode={routingMode}
                pitchShiftSemitones={pitchShiftSemitones}
                isPlaying={isPlaying}
                isAudible={isAudible}
                meterSource={meterSource}
                onVolumeChange={onVolumeChange}
                onPanChange={onPanChange}
                onToggleMute={onToggleMute}
                onToggleSolo={onToggleSolo}
                onTogglePitchLock={onTogglePitchLock}
                onOpenVstRack={onOpenVstRack}
              />
            );
          })}

        {/* Divisor Físico de Barramento Master */}
        <div className="w-[1.5px] bg-slate-800 self-stretch my-1 mx-1.5 shrink-0" />

        <MasterOutputCard
          isPlaying={isPlaying}
          masterVolume={masterVolume}
          meterSource={meterSource}
          onMasterVolumeChange={onMasterVolumeChange}
        />
      </div>
    </div>
  );
};
