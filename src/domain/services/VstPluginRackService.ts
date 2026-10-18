import { TrackStem, StemDspConfig, StemType } from '../entities/TrackStem';

export interface PluginBoutiqueReference {
  id: string;
  name: string;
  developer: string;
  category: string;
  url: string;
  defectSolved: string;
  dspEquivalentInLagoinhaVS: string;
}

/**
 * Engenharia Reversa & Integração DSP dos Melhores Free VST Plugins da Plugin Boutique
 * (https://www.pluginboutique.com/free-plugins) aplicados em tempo real na WebAudio API
 * para corrigir defeitos de separação neural (stem bleed, falta de ar agudo, lama nos médio-graves
 * e clipping digital em boosts de +6 dB).
 */
export class VstPluginRackService {
  public static readonly PLUGIN_BOUTIQUE_CATALOG: PluginBoutiqueReference[] = [
    {
      id: 'tdr-nova',
      name: 'TDR Nova (Parallel Dynamic EQ)',
      developer: 'Tokyo Dawn Labs',
      category: 'Equalizador Dinâmico & De-Bleed',
      url: 'https://www.pluginboutique.com/product/2-Effects/16-EQ/3017-TDR-Nova',
      defectSolved:
        'Remove vazamento de sub-grave (< 100 Hz) e embolamento (250–350 Hz) que sobram na separação entre Violão Acústico e Guitarra Elétrica.',
      dspEquivalentInLagoinhaVS: 'Filtro High-Pass Cirúrgico (20–350 Hz) + EQ Paramétrico de 3 Bandas por Canal'
    },
    {
      id: 'xfer-ott',
      name: 'OTT (Upward / Downward Compressor)',
      developer: 'Xfer Records',
      category: 'Compressor Multibanda / Punch',
      url: 'https://www.pluginboutique.com/product/2-Effects/8-Compressor/2962-OTT',
      defectSolved:
        'Recupera a presença e firmeza de stems que soam distantes ou inconsistentes no volume durante o louvor.',
      dspEquivalentInLagoinhaVS: 'Compressor Óptico/Punch por Canal (Ratio 4:1, Threshold -18 dB, Make-Up Automático)'
    },
    {
      id: 'sga-1566',
      name: 'SGA1566 MkII / Softube Saturation Knob',
      developer: 'Shattered Glass Audio / Softube',
      category: 'Saturação Valvulada & Exciter Harmônico',
      url: 'https://www.pluginboutique.com/free-plugins',
      defectSolved:
        'Reconstrói os harmônicos agudos ("ar" acima de 8 kHz) perdidos na compressão MP3 ou na separação por IA.',
      dspEquivalentInLagoinhaVS: 'WaveShaper Tube Saturation Assinatura Analógica + Shelf de Brilho 8.5 kHz'
    },
    {
      id: 'limiter-no6',
      name: 'Limiter №6 / LoudMax Brickwall',
      developer: 'VladgSound / Tokyo Dawn Labs',
      category: 'Master Brickwall Limiter',
      url: 'https://www.pluginboutique.com/free-plugins',
      defectSolved:
        'Impede distorção digital e rachaduras no PA/Fone quando o músico aumenta o fader até +6.0 dB ou ativa o EnsaioMix (+4.3 dB).',
      dspEquivalentInLagoinhaVS: 'Master Brickwall Limiter (Threshold -1.0 dBFS, Ratio 20:1, Attack 1ms) sempre ativo no barramento Master'
    },
    {
      id: 'ozone-imager',
      name: 'Ozone Imager v2',
      developer: 'iZotope',
      category: 'Stereo Imaging & Fase',
      url: 'https://www.pluginboutique.com/product/2-Effects/27-Stereo-Width/3692-Ozone-Imager-V2',
      defectSolved:
        'Evita cancelamento de fase entre Violão e Guitarra e abre o campo estéreo sem perder compatibilidade Mono no PA.',
      dspEquivalentInLagoinhaVS: 'Roteamento Dual-Bus L/R Independente + Controle de Panorâmica de Precisão'
    }
  ];

  /**
   * Retorna o preset de correção automática ideal para cada tipo de instrumento,
   * eliminando artefatos de separação neural e realçando a definição de palco.
   */
  public static getSmartPresetForStem(type: StemType): StemDspConfig {
    switch (type) {
      case 'violao':
        return {
          presetName: 'TDR Nova Acoustic De-Bleed + Air',
          highPassHz: 105, // Corta vazamento de bumbo e baixo no violão
          eqLowDb: -1.5,
          eqMidDb: -2.0,   // Limpa embolamento de caixa acústica
          eqHighDb: 3.5,   // Devolve o brilho das cordas de aço (8.5 kHz+)
          driveAmount: 0.08,
          compressorEnabled: true
        };
      case 'guitars':
      case 'strings':
        return {
          presetName: 'SGA1566 Tube Drive + Mid Focus',
          highPassHz: 90,  // Remove rumble grave da guitarra
          eqLowDb: -1.0,
          eqMidDb: 2.5,    // Destaca riffs e solos no meio da mix
          eqHighDb: 1.5,
          driveAmount: 0.22, // Saturação valvulada quente
          compressorEnabled: true
        };
      case 'bass':
        return {
          presetName: 'OTT Sub-Bass Lock & Punch',
          highPassHz: 32,
          eqLowDb: 3.2,    // Corpo sub-grave firme (80–100 Hz)
          eqMidDb: -2.0,   // Limpa lama em 300 Hz
          eqHighDb: -1.5,  // Reduz ruído de artefato agudo no baixo
          driveAmount: 0.14,
          compressorEnabled: true
        };
      case 'drums':
        return {
          presetName: 'Transient Punch & Bus Glue',
          highPassHz: 28,
          eqLowDb: 2.5,    // Punch de bumbo
          eqMidDb: -1.5,   // Limpa som encaixotado
          eqHighDb: 2.5,   // Nitidez de chimbal e pratos
          driveAmount: 0.1,
          compressorEnabled: true
        };
      case 'keys':
      case 'pad':
        return {
          presetName: 'Warm Analog Keys & Shimmer',
          highPassHz: 75,
          eqLowDb: 0.5,
          eqMidDb: 1.0,
          eqHighDb: 2.0,
          driveAmount: 0.06,
          compressorEnabled: false
        };
      case 'vocals':
        return {
          presetName: 'Vocal Silk Air & De-Mud (TDR Nova)',
          highPassHz: 115,
          eqLowDb: -2.0,
          eqMidDb: 1.5,
          eqHighDb: 3.0,
          driveAmount: 0.08,
          compressorEnabled: true
        };
      case 'click':
      case 'guide':
      case 'fx':
      default:
        return {
          presetName: 'Flat (Clock Precision)',
          highPassHz: 20,
          eqLowDb: 0,
          eqMidDb: 0,
          eqHighDb: 0,
          driveAmount: 0,
          compressorEnabled: false
        };
    }
  }

  /**
   * Aplica a correção DSP inteligente em todos os canais da música de uma só vez.
   */
  public static applySmartAutoFixAll(stems: TrackStem[]): void {
    for (const stem of stems) {
      stem.setDsp(this.getSmartPresetForStem(stem.type));
    }
  }

  /**
   * Remove todos os filtros e restaura resposta Flat (Bypass) em todos os canais.
   */
  public static resetAllDsp(stems: TrackStem[]): void {
    for (const stem of stems) {
      stem.resetDsp();
    }
  }

  /**
   * Gera curva matemática de saturação analógica suave (tanh soft-clipping)
   * para uso no WaveShaperNode do WebAudio API.
   */
  public static createTubeSaturationCurve(
    driveAmount: number,
    samples: number = 1024
  ): Float32Array<ArrayBuffer> {
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const clampedDrive = Math.max(0, Math.min(1, driveAmount));

    if (clampedDrive <= 0.001) {
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / (samples - 1) - 1;
        curve[i] = x;
      }
      return curve;
    }

    const k = 1 + clampedDrive * 6;
    const norm = Math.tanh(k);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
  }
}
