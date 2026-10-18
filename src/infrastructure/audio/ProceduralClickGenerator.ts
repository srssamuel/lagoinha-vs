export type ClickSoundStyle = 'WOODBLOCK' | 'ABLETON' | 'BEEP';

export class ProceduralClickGenerator {
  /**
   * Gera um buffer de áudio curto com clique percussivo de alta definição
   * @param ctx AudioContext ativo
   * @param isAccent Se true, é o tempo 1 (acento de compasso - agudo e marcante)
   * @param style Estilo sonoro do clique ('WOODBLOCK' | 'ABLETON' | 'BEEP')
   */
  public static createClickBuffer(
    ctx: AudioContext,
    isAccent: boolean,
    style: ClickSoundStyle = 'WOODBLOCK'
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const duration = isAccent ? 0.045 : 0.030; // 30ms a 45ms
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    if (style === 'WOODBLOCK') {
      // Woodblock acústico de estúdio: ressonância orgânica quente em 1200Hz / 800Hz com ataque seco
      const fundamental = isAccent ? 1320 : 880;
      const decay = isAccent ? 75 : 95;
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * decay);
        const body = Math.sin(2 * Math.PI * fundamental * t) * 0.7;
        const resonance = Math.sin(2 * Math.PI * (fundamental * 1.6) * t) * 0.3;
        const woodClick = (Math.random() * 2 - 1) * Math.exp(-t * 350) * 0.4;
        data[i] = (body + resonance + woodClick) * env;
      }
      return buffer;
    }

    if (style === 'ABLETON') {
      // Estilo Ableton Live / Logic Pro: clique curto hiper-preciso (2500Hz / 1250Hz)
      const freq = isAccent ? 2500 : 1250;
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * (isAccent ? 90 : 120));
        const tone = Math.sin(2 * Math.PI * freq * t);
        const punch = Math.sin(2 * Math.PI * (freq * 2) * t) * Math.exp(-t * 250);
        data[i] = (tone * 0.75 + punch * 0.25) * env;
      }
      return buffer;
    }

    // Estilo BEEP clássico
    const freq = isAccent ? 1760 : 880; // A6 vs A5
    const decayFactor = isAccent ? 60 : 80;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * decayFactor);
      const tone = Math.sin(2 * Math.PI * freq * t);
      const clickTransient = Math.sin(2 * Math.PI * (freq * 2.5) * t) * Math.exp(-t * 200);
      data[i] = (tone * 0.7 + clickTransient * 0.3) * envelope;
    }

    return buffer;
  }
}
