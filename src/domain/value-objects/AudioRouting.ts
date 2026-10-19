export type RoutingMode = 'MULTI_4CH_DISCRETE' | 'SPLIT_IEM_PA' | 'STEREO_FULL';

export interface ChannelAssignment {
  ch1_vsL: number;    // Output 1: Playback L (Mesa FOH)
  ch2_vsR: number;    // Output 2: Playback R (Mesa FOH)
  ch3_click: number;  // Output 3: Click Track (somente monitoração/IEM músicos)
  ch4_guide: number;  // Output 4: Guide Track (cues de voz, contagens, somente monitoração/IEM músicos)
  leftGain: number;   // Alias / Fallback para Ch 1 (Left FOH / Split L)
  rightGain: number;  // Alias / Fallback para Ch 2 (Right FOH / Split R)
}

export class AudioRouting {
  /**
   * Calcula o ganho de roteamento conforme a necessidade do sistema ao vivo da Lagoinha.
   * Modos suportados:
   * 1. MULTI_4CH_DISCRETE (Padrão Pro Oficial Leandro Machado - Lagoinha):
   *    - Output 1: VS Left (Playback L para mesa FOH)
   *    - Output 2: VS Right (Playback R para mesa FOH)
   *    - Output 3: Click Track dedicado (somente monitoração/IEM dos músicos, zero PA)
   *    - Output 4: Guide Track dedicado (cues de voz e contagens, somente IEM, zero PA)
   * 2. SPLIT_IEM_PA (Cabo em Y para saídas estéreo simples 2 canais):
   *    - Canal Left (1): Click + Guia + Instrumentos (para fones dos músicos)
   *    - Canal Right (2): Instrumentos apenas para o PA (Click e Guia com ZERO absoluto)
   * 3. STEREO_FULL (Ensaio geral / fone / estúdio):
   *    - Mixagem estéreo com Pan independente para todos os instrumentos.
   */
  public static calculateGains(
    stemType: string,
    mode: RoutingMode,
    pan: number,
    isAudible: boolean,
    volume: number
  ): ChannelAssignment {
    if (!isAudible || volume <= 0) {
      return {
        ch1_vsL: 0,
        ch2_vsR: 0,
        ch3_click: 0,
        ch4_guide: 0,
        leftGain: 0,
        rightGain: 0
      };
    }

    if (mode === 'MULTI_4CH_DISCRETE') {
      if (stemType === 'click') {
        // Output 3 exclusivo: Click dedicado para monitoração dos músicos (IEM), zero PA e zero Guide
        return {
          ch1_vsL: 0,
          ch2_vsR: 0,
          ch3_click: volume,
          ch4_guide: 0,
          leftGain: 0,
          rightGain: 0
        };
      }

      if (stemType === 'guide') {
        // Output 4 exclusivo: Guide dedicado para monitoração dos músicos (IEM), zero PA e zero Click
        return {
          ch1_vsL: 0,
          ch2_vsR: 0,
          ch3_click: 0,
          ch4_guide: volume,
          leftGain: 0,
          rightGain: 0
        };
      }

      // Todos os outros stems da banda (Playback / VS) vão exclusivamente para Canais 1 e 2 (Mesa FOH)
      const normalizedPan = (pan + 1) / 2; // 0 (Left) a 1 (Right)
      const ch1_vsL = Math.cos(normalizedPan * (Math.PI / 2)) * volume;
      const ch2_vsR = Math.sin(normalizedPan * (Math.PI / 2)) * volume;

      return {
        ch1_vsL,
        ch2_vsR,
        ch3_click: 0,
        ch4_guide: 0,
        leftGain: ch1_vsL,
        rightGain: ch2_vsR
      };
    }

    if (mode === 'SPLIT_IEM_PA') {
      const isMonitorOnly = stemType === 'click' || stemType === 'guide';
      if (isMonitorOnly) {
        // Estritamente fone L, ZERO no PA R
        return {
          ch1_vsL: volume,
          ch2_vsR: 0.0,
          ch3_click: 0,
          ch4_guide: 0,
          leftGain: volume,
          rightGain: 0.0
        };
      } else {
        // Instrumentos vão para o PA (R) e também para o fone da banda (L)
        const left = volume * 0.85; // atenuado no fone para o click sobressair
        const right = volume;
        return {
          ch1_vsL: left,
          ch2_vsR: right,
          ch3_click: 0,
          ch4_guide: 0,
          leftGain: left,
          rightGain: right
        };
      }
    }

    // STEREO_FULL: Stereo Pan padrão (-1 = Left, 0 = Center, 1 = Right)
    const normalizedPan = (pan + 1) / 2; // 0 (Left) a 1 (Right)
    const leftGain = Math.cos(normalizedPan * (Math.PI / 2)) * volume;
    const rightGain = Math.sin(normalizedPan * (Math.PI / 2)) * volume;

    return {
      ch1_vsL: leftGain,
      ch2_vsR: rightGain,
      ch3_click: 0,
      ch4_guide: 0,
      leftGain,
      rightGain
    };
  }
}
