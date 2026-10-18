import { TrackStem, StemType } from '../entities/TrackStem';

export type EnsaioMixMode = 'PADRAO' | 'AUMENTADA' | 'DIMINUTA';

/**
 * Engenharia Reversa do EnsaioMix® (RehearsalMix) da MultiTracks.com.br:
 * - Mix Aumentada: destaca o instrumento escolhido (+4.3 dB / 1.65 linear) e atenua o restante da banda (0.55 linear) para o músico tirar a música de ouvido com clareza.
 * - Mix Diminuta (Minus One): silencia apenas o instrumento escolhido e mantém a banda em 0.0 dB (1.0) para o músico tocar por cima ou assumir a linha ao vivo no palco.
 * - Mix Padrão: restaura todos os instrumentos para 0.0 dB nominal.
 */
export class EnsaioMixService {
  public static applyEnsaioMix(
    stems: TrackStem[],
    targetType: StemType,
    mode: EnsaioMixMode
  ): void {
    if (mode === 'PADRAO') {
      stems.forEach((stem) => {
        stem.isSolo = false;
        stem.isMuted = false;
        stem.setVolume(stem.type === 'click' ? 0.85 : stem.type === 'guide' ? 0.95 : 1.0);
      });
      return;
    }

    if (mode === 'AUMENTADA') {
      stems.forEach((stem) => {
        stem.isSolo = false;
        stem.isMuted = false;
        if (stem.type === targetType) {
          stem.setVolume(1.65); // +4.3 dB em evidência para estudo
        } else if (stem.type === 'click' || stem.type === 'guide') {
          stem.setVolume(0.8);
        } else {
          stem.setVolume(0.55); // -5.2 dB na banda de fundo
        }
      });
      return;
    }

    if (mode === 'DIMINUTA') {
      stems.forEach((stem) => {
        stem.isSolo = false;
        if (stem.type === targetType) {
          stem.isMuted = true; // Minus One: silencia o instrumento do músico
        } else {
          stem.isMuted = false;
          stem.setVolume(stem.type === 'click' ? 0.85 : stem.type === 'guide' ? 0.95 : 1.0);
        }
      });
    }
  }
}
