import React, { useState } from 'react';
import { User } from '../../domain/entities/User';
import { Clock, RefreshCw, LogOut, CheckCircle, Music2 } from 'lucide-react';
import { FirebaseAuthService } from '../../infrastructure/auth/FirebaseAuthService';

interface PendingApprovalModalProps {
  user: User;
  authService: FirebaseAuthService;
  onRefreshApproval: () => void;
  onSignOut: () => void;
}

export const PendingApprovalModal: React.FC<PendingApprovalModalProps> = ({
  user,
  authService,
  onRefreshApproval,
  onSignOut
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [justApproved, setJustApproved] = useState(false);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      const allUsers = await authService.listAllUsers();
      const updated = allUsers.find((u) => u.uid === user.uid);
      if (updated && updated.status === 'active') {
        setJustApproved(true);
        setTimeout(() => {
          onRefreshApproval();
        }, 1200);
      }
    } finally {
      setTimeout(() => setIsChecking(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#111520] border border-amber-500/40 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-slate-100 text-center">
        {/* Ícone de Alerta Acolhedor */}
        <div className="w-16 h-16 rounded-3xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-xl shadow-amber-500/10">
          {justApproved ? (
            <CheckCircle className="w-8 h-8 text-emerald-400 animate-bounce" />
          ) : (
            <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
          )}
        </div>

        {/* Título & Identidade */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <Music2 className="w-4 h-4 text-blue-400" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400">
            Lagoinha João Pessoa • Louvor
          </span>
        </div>

        <h3 className="text-xl font-black text-white tracking-wide">
          {justApproved ? 'Acesso Aprovado!' : 'Cadastro em Análise'}
        </h3>

        <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-sm mx-auto">
          {justApproved ? (
            <span className="text-emerald-300 font-bold">
              Seu acesso foi liberado! Redirecionando para o palco...
            </span>
          ) : (
            <>
              Olá <strong className="text-white">{user.displayName}</strong>! Para a segurança do sistema de áudio e do altar, o acesso aos playbacks e repertórios é restrito.
            </>
          )}
        </p>

        {/* Card com Detalhes do Usuário */}
        <div className="my-5 p-4 rounded-2xl bg-stage-card/80 border border-stage-border text-left space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-400">
            <span>Email:</span>
            <span className="text-white font-mono">{user.email}</span>
          </div>
          {user.instrumentOrMinistry && (
            <div className="flex justify-between items-center text-slate-400">
              <span>Função / Instrumento:</span>
              <span className="text-amber-300 font-bold">{user.instrumentOrMinistry}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-slate-400">
            <span>Status:</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
              AGUARDANDO APROVAÇÃO DO ADM
            </span>
          </div>
        </div>

        <p className="text-[11px] text-stage-muted mb-6">
          <strong>Leandro Machado</strong> ou outro administrador do ministério aprovará sua solicitação em breve. Se você já avisou o líder no WhatsApp, clique abaixo:
        </p>

        {/* Botões de Ação */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking || justApproved}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 active:scale-98 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Verificando com o servidor...' : 'Verificar se já fui aprovado'}</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-2.5 rounded-2xl bg-stage-card hover:bg-slate-800 text-slate-400 hover:text-rose-400 font-semibold text-xs flex items-center justify-center gap-2 transition border border-stage-border"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
