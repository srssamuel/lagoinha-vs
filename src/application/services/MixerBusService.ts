import { TrackStem } from '../../domain/entities/TrackStem';
import { AudioRouting, ChannelAssignment, RoutingMode } from '../../domain/value-objects/AudioRouting';

export interface StemBusEvaluation {
  stemId: string;
  isAudible: boolean;
  gains: ChannelAssignment;
}

export class MixerBusService {
  /**
   * Avalia todos os stems de uma música com base nas regras de Solo, Mute, Volume e Roteamento
   */
  public static evaluateAllStems(
    stems: TrackStem[],
    routingMode: RoutingMode
  ): StemBusEvaluation[] {
    const hasAnySolo = stems.some((s) => s.isSolo);

    return stems.map((stem) => {
      const isAudible = stem.isAudible(hasAnySolo);
      const gains = AudioRouting.calculateGains(
        stem.type,
        routingMode,
        stem.pan,
        isAudible,
        stem.volume
      );

      // Verificação fail-safe estrita: Click/Guia NUNCA podem vazar para o PA (Right) no modo Split
      if (routingMode === 'SPLIT_IEM_PA' && (stem.type === 'click' || stem.type === 'guide')) {
        if (gains.rightGain !== 0) {
          throw new Error(`SECURITY AUDIT FAIL: Stem "${stem.name}" (${stem.type}) leaked to FOH PA!`);
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
