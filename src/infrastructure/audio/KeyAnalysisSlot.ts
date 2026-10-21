import { UNKNOWN_KEY, type SongKeyInfo } from '../../domain/value-objects/SongKey';
import { isAbortError } from './AudioKeyAnalyzer';

export interface AnalysisRun {
  readonly signal: AbortSignal;
  /** false depois de uma importação mais nova ou de cancelAll: o resultado desta execução não vale mais. */
  isCurrent(): boolean;
  /** Termina a execução: um Cancelar tardio não a afeta. */
  release(): void;
}

/**
 * Controla análises de tom em andamento. Exclusivo (formulário de upload): a nova importação aborta e
 * invalida a anterior. Não exclusivo (importação enfileirada na lateral): cada análise tem o seu
 * AbortController e "Cancelar" aborta todas as que estão rodando.
 */
export class KeyAnalysisSlot {
  private generation = 0;
  private active = new Set<AbortController>();

  begin(exclusive = true): AnalysisRun {
    if (exclusive) this.cancelAll();
    const generation = this.generation;
    const controller = new AbortController();
    this.active.add(controller);
    return {
      signal: controller.signal,
      isCurrent: () => generation === this.generation,
      release: () => {
        this.active.delete(controller);
      }
    };
  }

  /** Reset, fechar o modal, desmontar: aborta tudo e torna obsoletos os resultados pendentes. */
  cancelAll(): void {
    this.generation++;
    this.abortAnalyses();
  }

  /** Botão "Cancelar análise": aborta só a análise; a importação segue sem tom. */
  abortAnalyses(): void {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
}

/**
 * Roda a análise e só aplica o resultado se esta execução ainda for a atual.
 * Falha vira "sem tom"; cancelamento não aplica nada.
 */
export async function applyAnalysisIfCurrent(
  run: AnalysisRun,
  analyze: (signal: AbortSignal) => Promise<SongKeyInfo>,
  apply: (info: SongKeyInfo) => void
): Promise<void> {
  try {
    const info = await analyze(run.signal);
    if (run.isCurrent()) apply(info);
  } catch (err) {
    if (!isAbortError(err) && run.isCurrent()) apply(UNKNOWN_KEY);
  }
}
