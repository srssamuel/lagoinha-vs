export class ProceduralClickGenerator {
  /**
   * Gera um buffer de áudio curto com clique percussivo de alta definição
   * @param ctx AudioContext ativo
   * @param isAccent Se true, é o tempo 1 (acento de compasso - agudo e marcante)
   */
  public static createClickBuffer(ctx: AudioContext, isAccent: boolean): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const duration = isAccent ? 0.045 : 0.030; // 30ms a 45ms
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const freq = isAccent ? 1760 : 880; // A6 (agudo acentuado) vs A5
    const decayFactor = isAccent ? 60 : 80;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Envelope percussivo exponencial rápido
      const envelope = Math.exp(-t * decayFactor);
      // Onda combinada senoidal e transiente rápido para clique nítido nos fones
      const tone = Math.sin(2 * Math.PI * freq * t);
      const clickTransient = Math.sin(2 * Math.PI * (freq * 2.5) * t) * Math.exp(-t * 200);
      data[i] = (tone * 0.7 + clickTransient * 0.3) * envelope;
    }

    return buffer;
  }
}
