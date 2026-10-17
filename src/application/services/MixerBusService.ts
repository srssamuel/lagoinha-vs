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
