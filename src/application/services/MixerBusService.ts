import { TrackStem } from '../../domain/entities/TrackStem';
import { AudioRouting, ChannelAssignment, RoutingMode } from '../../domain/value-objects/AudioRouting';

export interface StemBusEvaluation {
  stemId: string;
  isAudible: boolean;
  gains: ChannelAssignment;
}

export class MixerBusService {
  /**
   * Avalia todos os stems de uma música com base nas regras de Solo, Mute, Volume, Roteamento e Solo Click (Live Rescue)
   */
  public static evaluateAllStems(
    stems: TrackStem[],
    routingMode: RoutingMode,
    isSoloClickActive: boolean = false
  ): StemBusEvaluation[] {
    const hasAnySolo = stems.some((s) => s.isSolo);

    return stems.map((stem) => {
      // Se Solo Click está ativo, apenas click e guia passam para o fone, mutando o resto da banda
      let isAudible = stem.isAudible(hasAnySolo);
      if (isSoloClickActive) {
        if (stem.type !== 'click' && stem.type !== 'guide') {
          isAudible = false;
        }
      }

      const gains = AudioRouting.calculateGains(
        stem.type,
        routingMode,
        stem.pan,
        isAudible,
        stem.volume
      );

      // Verificação fail-safe estrita em SPLIT_IEM_PA: Click/Guia NUNCA podem vazar para o PA (Right)
      if (routingMode === 'SPLIT_IEM_PA' && (stem.type === 'click' || stem.type === 'guide')) {
        if (gains.rightGain !== 0 || gains.ch2_vsR !== 0) {
          throw new Error(`SECURITY AUDIT FAIL: Stem "${stem.name}" (${stem.type}) leaked to FOH PA!`);
        }
      }

      // Verificação fail-safe estrita em MULTI_4CH_DISCRETE (Padrão Leandro Machado):
      if (routingMode === 'MULTI_4CH_DISCRETE') {
        if (stem.type === 'click' || stem.type === 'guide') {
          // Monitoração NUNCA pode vazar para os canais 1 e 2 do PA / FOH
          if (gains.ch1_vsL !== 0 || gains.ch2_vsR !== 0) {
            throw new Error(`SECURITY AUDIT FAIL: Monitor stem "${stem.name}" (${stem.type}) leaked to FOH PA (Ch 1/2)!`);
          }
          if (stem.type === 'click' && gains.ch4_guide !== 0) {
            throw new Error(`SECURITY AUDIT FAIL: Click stem "${stem.name}" leaked to Guide channel (Ch 4)!`);
          }
          if (stem.type === 'guide' && gains.ch3_click !== 0) {
            throw new Error(`SECURITY AUDIT FAIL: Guide stem "${stem.name}" leaked to Click channel (Ch 3)!`);
          }
        } else {
          // Instrumentos de playback NUNCA podem vazar para as saídas 3 (Click) ou 4 (Guide)
          if (gains.ch3_click !== 0 || gains.ch4_guide !== 0) {
            throw new Error(`SECURITY AUDIT FAIL: Playback stem "${stem.name}" leaked to Click/Guide discrete outputs!`);
          }
        }
      }

      return {
        stemId: stem.id,
        isAudible,
        gains
      };
    });
  }
}
