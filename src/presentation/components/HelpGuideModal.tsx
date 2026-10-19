import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Headphones,
  ShieldCheck,
  Timer,
  Sparkles,
  AlertOctagon,
  Keyboard,
  CheckCircle2,
  Lock
} from 'lucide-react';

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'cables' | 'preroll' | 'pitchlock' | 'soloclick' | 'ambientpad' | 'panic' | 'shortcuts';

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('cables');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#111520] border border-stage-border rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header do Guia */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Manual de Operação no Culto — Lagoinha VS
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  GUIA DIDÁTICO
                </span>
              </div>
              <p className="text-xs text-stage-muted mt-0.5">
                Tudo o que você precisa saber para operar com segurança e excelência profissional no palco.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white transition"
            aria-label="Fechar Guia de Palco"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Didáticas */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('cables')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'cables'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>1. Ligação dos Cabos (Split)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preroll')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'preroll'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            <span>2. Contagem Prévia (Pré-Roll)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pitchlock')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'pitchlock'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>3. Mudar Tom com Pitch Lock</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('soloclick')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'soloclick'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>4. Resgate (Solo Click)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ambientpad')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'ambientpad'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>5. Fundo de Oração (Pad)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('panic')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'panic'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>6. Pânico & Imprevisto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'shortcuts'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>7. Atalhos & Pedaleira</span>
          </button>
        </div>

        {/* Conteúdo Didático da Aba Ativa */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* ABA 1: LIGAÇÃO DOS CABOS */}
          {activeTab === 'cables' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Como Ligar o Notebook na Mesa de Som (Split Estéreo Oficial)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para que o som do metrônomo (click) e a voz guia nunca vazem para a igreja, o sistema divide a saída estéreo em dois caminhos independentes utilizando um cabo em <strong>Y (P2 macho para 2x P10 macho)</strong> ou uma <strong>Interface USB</strong>:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lado Esquerdo L */}
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-blue-500/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-blue-400 uppercase tracking-wide">
                      Canal Esquerdo (L) • FONES DO PALCO (IEM)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                      Banda & Baterista
                    </span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                    <li>Contém o <strong>Metrônomo (Click)</strong> alto e claro.</li>
                    <li>Contém a <strong>Voz Guia</strong> ("Intro 2, 3, 4", "Refrão", "Final").</li>
                    <li>Contém as <strong>Multitracks da banda</strong> em volume equilibrado para todos tocarem juntos.</li>
                    <li>Vai para o <strong>amplificador de fones</strong> (ex: Behringer Powerplay).</li>
                  </ul>
                </div>

                {/* Lado Direito R */}
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-wide">
                      Canal Direito (R) • AUDITÓRIO & PA (IGREJA)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      Som da Igreja
                    </span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                    <li>Contém <strong>apenas os instrumentos musicais</strong> da multitrack.</li>
                    <li>O Click e a Guia têm <strong>VOLUME ZERO ABSOLUTO</strong> neste canal.</li>
                    <li>A congregação ouve apenas os teclados, violão, guitarras e orquestra com qualidade de estúdio.</li>
                    <li>Vai direto para um canal da <strong>mesa de som principal (PA)</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: CONTAGEM PRÉVIA */}
          {activeTab === 'preroll' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                  <Timer className="w-4 h-4" />
                  <span>Por que Usar a Contagem Prévia (Pré-Roll)?</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Se você soltar a música imediatamente no tempo 1, o baterista não terá tempo de se preparar e a banda entrará no andamento errado.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Como Operar na Prática:</span>
                </div>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    1. Na barra de transporte, clique no botão <strong>PRÉ-ROLL: 1 COMP</strong> (ou 2 COMP).
                  </p>
                  <p>
                    2. Ao dar Play (ou apertar o espaço), o botão começará a piscar em âmbar mostrando: <strong className="text-amber-300 font-mono">CONTAGEM: 1, 2, 3, 4</strong>.
                  </p>
                  <p>
                    3. As multitracks da banda ficam em silêncio durante essas 4 batidas. No momento exato em que a contagem termina, as faixas entram perfeitamente cravadas no compasso 1.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: PITCH LOCK */}
          {activeTab === 'pitchlock' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                  <Lock className="w-4 h-4" />
                  <span>Pitch Lock: Mudança de Tom Sem Deformar o Ritmo</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Em reprodutores comuns, mudar o tom de uma música altera também o timbre da bateria e distorce o click, fazendo os pratos soarem como 'robôs' ou alterando o andamento (BPM).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="text-xs text-slate-300 space-y-2">
                  <p>
                    No <strong>Lagoinha VS</strong>, ativamos a proteção <strong>Pitch Lock</strong> automática:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li><strong className="text-emerald-300">Canais Protegidos (Bypass 100% Rítmico):</strong> Bateria (Drums), Loops de Percussão, Click e Guia Vocal ficam rigidamente travados.</li>
                    <li><strong className="text-amber-300">Canais Harmônicos (Transpostos em Tempo Real):</strong> Violão, Guitarras, Baixo, Teclados, Pad e Backing Vocals mudam de semitom instantaneamente.</li>
                    <li>A <strong>Cifra Pro®</strong> sincroniza automaticamente o tom das letras e acordes para acompanhar a nova afinação!</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: RESGATE / SOLO CLICK */}
          {activeTab === 'soloclick' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                  <Headphones className="w-4 h-4" />
                  <span>A Banda Errou ou Atravessou? O Que Fazer:</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Ao vivo em um culto, erros de tempo acontecem. Quando o baterista ou ministro atravessar o compasso, você não precisa parar a música nem passar vergonha.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Passo a Passo de Resgate no Palco:</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Pressione a <strong>tecla C</strong> no teclado ou clique no botão <strong>SOLO CLICK</strong>.</li>
                  <li>O fone dos músicos ficará <strong className="text-amber-300">estritamente com o metrônomo e guia</strong>, silenciando o restante para ninguém se confundir.</li>
                  <li>O som da igreja (Canal R) continuará tocando normalmente com o violão ou teclado do instrumentista.</li>
                  <li>Assim que o baterista se reencontrar no tempo, aperte a <strong>tecla C novamente</strong> para retornar a banda completa.</li>
                </ol>
              </div>
            </div>
          )}

          {/* ABA 5: AMBIENT PAD */}
          {activeTab === 'ambientpad' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/30">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm mb-1">
                  <Sparkles className="w-4 h-4" />
                  <span>Fundo de Oração e Transição Sem Silêncio (Zero Dead Air)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Momentos de ministração e oração pastoral necessitam de uma base harmônica acolhedora e contínua.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                  <li><strong>Ligar o Pad:</strong> Clique em <em>LIGAR PAD</em> na barra inferior a qualquer momento.</li>
                  <li><strong>Seguir Repertório (Auto-Follow):</strong> Deixe o botão <em>SEGUIR REPERTÓRIO: ON</em> ativado. Quando você clicar na próxima música do setlist, o Pad fará uma transição polifônica suave de 2 segundos para o tom da nova música, sem cortes.</li>
                  <li><strong>Volume Independente:</strong> Ajuste o slider de volume do Pad para não cobrir a voz do pastor ou ministro.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ABA 6: PÂNICO */}
          {activeTab === 'panic' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm mb-1">
                  <AlertOctagon className="w-4 h-4" />
                  <span>Botão de Pânico (Tecla ESC): Parada de Emergência</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Em cultos ao vivo, o Espírito Santo pode direcionar o pastor a interromper o louvor, iniciar uma oração repentina ou mudar a ordem do culto.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Ao pressionar a <strong>tecla ESC</strong> ou clicar em <strong>PÂNICO</strong>:
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li>O sistema aplica um <strong>fade out exponencial ultrarrápido de 350ms</strong> em vez de cortar o áudio seco com estalo.</li>
                  <li>As multitracks são paradas sem gerar choque sonoro na congregação.</li>
                  <li>O volume master é restaurado automaticamente para o próximo play.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ABA 7: ATALHOS & PEDALEIRA */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/30">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1">
                  <Keyboard className="w-4 h-4" />
                  <span>Atalhos Rápidos de Teclado e Pedaleira USB MIDI</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Você pode controlar todo o playback pelas teclas do notebook ou ligando pedaleiras de pé (ex: Line 6 FBV, Behringer FCB1010, M-Vave Chocolate, Nektar Pacer):
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Play / Pausar</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-amber-300 font-mono font-bold border border-slate-700">Espaço</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Corte de Pânico</span>
                  <kbd className="px-2 py-1 rounded bg-rose-950 text-rose-300 font-mono font-bold border border-rose-800">ESC</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Resgate (Solo Click)</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-blue-300 font-mono font-bold border border-slate-700">Tecla C</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Repetir Seção (Loop)</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-emerald-300 font-mono font-bold border border-slate-700">Tecla R</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Próxima Música</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-slate-200 font-mono font-bold border border-slate-700">Tecla N</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="font-semibold text-slate-300">Música Anterior</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-slate-200 font-mono font-bold border border-slate-700">Tecla P</kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 sm:col-span-2">
                  <span className="font-semibold text-slate-300">Pular para Seção da Música (Intro, Verso, Refrão...)</span>
                  <kbd className="px-2 py-1 rounded bg-slate-800 text-amber-400 font-mono font-bold border border-slate-700">Teclas 1 a 9</kbd>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 text-xs text-purple-200 flex items-center justify-between">
                <span>Quer usar uma pedaleira física USB com botões de pé?</span>
                <span className="font-bold underline cursor-pointer" onClick={onClose}>
                  Clique em MIDI / TECLADO na barra principal
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Fechar e Confirmação */}
        <div className="border-t border-stage-border pt-4 mt-4 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-stage-muted">
            Lagoinha VS • Tecnologia com Propósito no Altar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-lg shadow-purple-600/30"
          >
            Entendido, Voltar ao Palco
          </button>
        </div>
      </div>
    </div>
  );
};
