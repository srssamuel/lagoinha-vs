import { Song } from '../../domain/entities/Song';

export interface QuantizedJumpCalculation {
  shouldJumpNow: boolean;
  targetTime: number;
  remainingSecondsInBar: number;
  nextBarNumber: number;
}

export class QuantizedSectionService {
  /**
   * Calcula o momento exato em que a transição de seção deve ocorrer.
   * Em vez de cortar abruptamente, aguarda o final do compasso corrente (downbeat do próximo compasso).
   */
  public static calculateNextDownbeatTime(
    currentTime: number,
    song: Song
  ): { nextDownbeatTime: number; nextBar: number } {
    const secondsPerBar = song.secondsPerBar;
    const currentBarDecimal = currentTime / secondsPerBar;
    const currentBar = Math.floor(currentBarDecimal) + 1;
    const nextBar = currentBar + 1;
    const nextDownbeatTime = (nextBar - 1) * secondsPerBar;

    return { nextDownbeatTime, nextBar };
  }

  /**
   * Verifica se o tempo atual alcançou o ponto agendado de transição
   */
  public static isTimeToExecuteJump(
    currentTime: number,
    scheduledTransitionTime: number,
    toleranceSeconds: number = 0.05
  ): boolean {
    return Math.abs(currentTime - scheduledTransitionTime) <= toleranceSeconds || currentTime >= scheduledTransitionTime;
  }
}
