/**
 * Trajetória linear por partes de um AudioParam, com o modelo guardado em JS.
 *
 * Por que existe: reprogramar um ganho no meio de uma rampa com `cancelScheduledValues(agora)` +
 * `setValueAtTime(param.value, agora)` não é contínuo. O cancelamento apaga o evento final da rampa em curso (o
 * param passa a "segurar" o último valor) e `param.value` devolve o valor do quantum anterior; o resultado é um
 * degrau ou um pico de uma amostra. Medido no render real em comandos sucessivos dentro dos 30 ms de crossfade
 * (picos de ~0,15 de amplitude). Aqui o valor em `at` é calculado a partir do modelo e a rampa em curso é
 * truncada em `at` por uma rampa colinear (mesma reta), então não há degrau.
 */
export interface TrackPoint {
  t: number;
  v: number;
}

export class LinearParamTrack {
  private readonly param: AudioParam;
  private pts: TrackPoint[];

  constructor(param: AudioParam, initial: number, at: number) {
    this.param = param;
    this.pts = [{ t: at, v: initial }];
    param.setValueAtTime(initial, at);
  }

  /** Valor da trajetória em `t` (segura o último valor depois do último ponto). */
  public valueAt(t: number): number {
    const p = this.pts;
    if (t <= p[0]!.t) return p[0]!.v;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      if (t <= b.t) return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
    return p[p.length - 1]!.v;
  }

  /**
   * Abandona o que estava planejado de `at` em diante e segue pelos novos pontos, continuando exatamente a
   * rampa em curso até `at`.
   */
  public retarget(at: number, next: TrackPoint[]): void {
    const v = this.valueAt(at);
    this.param.cancelScheduledValues(at);
    this.pts = this.pts.filter((p) => p.t < at);
    if (this.pts.length === 0) this.param.setValueAtTime(v, at);
    else this.param.linearRampToValueAtTime(v, at);
    this.pts.push({ t: at, v });
    this.append(next);
  }

  /** Acrescenta pontos depois do último já agendado (encadeia sem cancelar o que está em curso). */
  public append(next: TrackPoint[]): void {
    for (const p of next) {
      const last = this.pts[this.pts.length - 1]!;
      if (last.t === p.t && last.v === p.v) continue;
      this.param.linearRampToValueAtTime(p.v, p.t);
      this.pts.push(p);
    }
    // Poda o histórico antigo, mantendo o ponto imediatamente anterior ao primeiro ainda útil
    if (this.pts.length > 64) this.pts = this.pts.slice(-32);
  }
}
