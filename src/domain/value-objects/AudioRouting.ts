export type RoutingMode = 'SPLIT_IEM_PA' | 'STEREO_FULL';

export interface ChannelAssignment {
  leftGain: number;  // 0.0 to 1.0 (Canal 0 / Left)
  rightGain: number; // 0.0 to 1.0 (Canal 1 / Right)
}

export class AudioRouting {
  /**
   * Calcula o ganho para saída física Left (Fone/IEM) e Right (PA/Auditório).
   * No modo SPLIT_IEM_PA:
   * - Click e Guia vão com 100% no canal Left (Fone) e RIGOROSAMENTE 0% no canal Right (PA).
   * - Instrumentos (Drums, Bass, Guitarras, etc.) vão 100% no canal Right (PA) e também no canal Left (Fone) para que a banda ouça a si mesma.
   * No modo STEREO_FULL (Ensaio em fone ou gravação):
   * - Todos os stems respeitam o Pan configurado individualmente.
   */
  public static calculateGains(
    stemType: string,
    mode: RoutingMode,
    pan: number,
    isAudible: boolean,
    volume: number
  ): ChannelAssignment {
    if (!isAudible || volume <= 0) {
      return { leftGain: 0, rightGain: 0 };
    }

    if (mode === 'SPLIT_IEM_PA') {
      const isMonitorOnly = stemType === 'click' || stemType === 'guide';
      if (isMonitorOnly) {
        // Estritamente fone L, ZERO no PA R
        return {
          leftGain: volume,
          rightGain: 0.0
        };
      } else {
        // Instrumentos vão para o PA (R) e também para o fone da banda (L)
        return {
          leftGain: volume * 0.85, // um pouco atenuado no fone para o click sobressair
          rightGain: volume
        };
      }
    }

    // STEREO_FULL: Stereo Pan padrão (-1 = Left, 0 = Center, 1 = Right)
    // Pan law de potência constante aproximada
    const normalizedPan = (pan + 1) / 2; // 0 (Left) a 1 (Right)
    const leftGain = Math.cos(normalizedPan * (Math.PI / 2)) * volume;
    const rightGain = Math.sin(normalizedPan * (Math.PI / 2)) * volume;

    return { leftGain, rightGain };
  }
}
