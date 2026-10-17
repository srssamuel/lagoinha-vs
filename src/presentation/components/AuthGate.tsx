import React, { useState } from 'react';
import { User } from '../../domain/entities/User';
import { FirebaseAuthService } from '../../infrastructure/auth/FirebaseAuthService';
import { Music2, Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

interface AuthGateProps {
  authService: FirebaseAuthService;
  onAuthenticated: (user: User) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ authService, onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const user = await authService.signInWithGoogle();
      onAuthenticated(user);
    } catch {
      setErrorMsg('Falha ao autenticar com a conta Google.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor preencha email e senha.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const user = await authService.signInWithEmail(email, password);
      onAuthenticated(user);
    } catch {
      setErrorMsg('Credenciais inválidas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoAccess = async (role: 'leader' | 'musician', name: string) => {
    setIsLoading(true);
    try {
      const user = await authService.signInDemo(role, name);
      onAuthenticated(user);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07090e] p-4 select-none">
      {/* Background glow effects */}
      <div className="absolute w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none top-1/4 left-1/3" />
      <div className="absolute w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none bottom-1/4 right-1/3" />

      <div className="relative z-10 bg-[#121824]/90 backdrop-blur-xl border border-stage-border rounded-3xl max-w-md w-full p-8 shadow-2xl">
        {/* Brand Lagoinha Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/25 ring-2 ring-white/10 mx-auto mb-3">
            <Music2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black text-white tracking-wider uppercase">
            Lagoinha VS
          </h2>
          <p className="text-xs font-semibold text-blue-400 mt-0.5">
            MINISTÉRIO DE LOUVOR • JOÃO PESSOA
          </p>
          <p className="text-[11px] text-stage-muted mt-1">
            Plataforma Cloud de Multitracks & Playback ao Vivo
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold text-center">
            {errorMsg}
          </div>
        )}

        {/* 1. Botão Entrar com Google */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-lg active:scale-98 disabled:opacity-50 mb-4"
        >
          {/* Ícone oficial do Google */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continuar com Google</span>
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px bg-stage-border flex-1" />
          <span className="text-[10px] font-mono text-stage-muted uppercase">ou com email</span>
          <div className="h-px bg-stage-border flex-1" />
        </div>

        {/* 2. Formulário Email & Senha */}
        <form onSubmit={handleEmailSignIn} className="space-y-3 mb-6">
          <div>
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Email do Membro
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stage-muted absolute left-3 top-3" />
              <input
                type="email"
                placeholder="louvor@lagoinhajp.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stage-muted absolute left-3 top-3" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-blue-600/30 active:scale-98"
          >
            <span>Acessar o Sistema</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* 3. Acesso Rápido para Ensaio no Púlpito */}
        <div className="border-t border-stage-border pt-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Acesso Rápido para Ensaio / Culto:</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleDemoAccess('leader', 'Leandro Machado (Líder)')}
              className="p-2.5 rounded-xl bg-slate-900 border border-stage-border hover:border-blue-500/60 text-left transition active:scale-95"
            >
              <div className="text-[11px] font-bold text-slate-200">
                Líder / Ministro
              </div>
              <div className="text-[9px] text-blue-400 font-mono flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3" />
                <span>Acesso Total & Cloud</span>
              </div>
            </button>

            <button
              onClick={() => handleDemoAccess('musician', 'Baterista / Músico')}
              className="p-2.5 rounded-xl bg-slate-900 border border-stage-border hover:border-purple-500/60 text-left transition active:scale-95"
            >
              <div className="text-[11px] font-bold text-slate-200">
                Músico / Banda
              </div>
              <div className="text-[9px] text-purple-400 font-mono mt-0.5">
                Modo Fone & Playback
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
