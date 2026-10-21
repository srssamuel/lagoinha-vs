import React, { useState, useEffect } from 'react';
import { User } from '../../domain/entities/User';
import { InviteToken } from '../../domain/entities/InviteToken';
import { AccountService } from '../../application/ports/AuthPort';
import { Music2, Lock, Mail, ArrowRight, Sparkles, UserPlus, LogIn, Link2, CheckCircle2 } from 'lucide-react';

interface AuthGateProps {
  authService: AccountService;
  onAuthenticated: (user: User) => void;
}

type AuthMode = 'login' | 'register';

export const AuthGate: React.FC<AuthGateProps> = ({ authService, onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instrument, setInstrument] = useState('Teclados & Synth');
  const [inviteToken, setInviteToken] = useState('');
  const [validInvite, setValidInvite] = useState<InviteToken | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const demoMode = authService.isDemoMode();

  // Detecta se há link de convite na URL (?invite=lagoinha-xxx)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      if (inviteParam) {
        setInviteToken(inviteParam);
        setAuthMode('register');
        void authService.validateInviteToken(inviteParam).then((token) => {
          if (token) {
            setValidInvite(token);
          }
        });
      }
    }
  }, [authService]);

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

  const handleLoginSubmit = async (e: React.FormEvent) => {
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

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !email || !password) {
      setErrorMsg('Por favor preencha nome completo, email e senha.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const user = await authService.registerWithEmail(
        email,
        password,
        displayName,
        instrument,
        inviteToken || undefined
      );
      onAuthenticated(user);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Falha ao registrar.');
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

      <div className="relative z-10 bg-[#121824]/90 backdrop-blur-xl border border-stage-border rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
        {/* Brand Lagoinha Header */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/25 ring-2 ring-white/10 mx-auto mb-3">
            <Music2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black text-white tracking-wider uppercase">
            Lagoinha VS
          </h2>
          <p className="text-xs font-semibold text-blue-400 mt-0.5">
            MINISTÉRIO DE LOUVOR • JOÃO PESSOA
          </p>
          <p className="text-[11px] text-stage-muted mt-0.5">
            Plataforma Cloud de Multitracks & Playback ao Vivo
          </p>
          {demoMode && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold tracking-wider">
              MODO DEMONSTRAÇÃO
            </span>
          )}
        </div>

        {/* Banner de Convite Ativo */}
        {validInvite && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs">
            <div className="flex items-center gap-2 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Convite Oficial Válido!</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Você foi convidado por <strong>{validInvite.createdByName}</strong>. Seu acesso será <strong>aprovado instantaneamente</strong> como <strong className="text-emerald-400">{validInvite.targetRole.toUpperCase()}</strong>!
            </p>
          </div>
        )}

        {/* Seletor de Modo: Entrar ou Cadastrar-se */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-stage-card border border-stage-border mb-5">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setErrorMsg('');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              authMode === 'login'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Entrar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setErrorMsg('');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              authMode === 'register'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Solicitar Acesso</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold text-center">
            {errorMsg}
          </div>
        )}

        {/* ABA 1: LOGIN */}
        {authMode === 'login' && (
          <>
            {/* 1. Botão Entrar com Google (simulado: só no modo demonstração) */}
            {demoMode && (
            <>
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2.5 transition shadow-lg active:scale-98 disabled:opacity-50 mb-3"
            >
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

            <div className="flex items-center gap-3 my-3">
              <div className="h-px bg-stage-border flex-1" />
              <span className="text-[10px] font-mono text-stage-muted uppercase">ou com email e senha</span>
              <div className="h-px bg-stage-border flex-1" />
            </div>
            </>
            )}

            {/* 2. Formulário Email & Senha */}
            <form onSubmit={handleLoginSubmit} className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stage-muted absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="leandro@lagoinhajp.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stage-muted absolute left-3 top-3" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-blue-600/30 active:scale-98"
              >
                <span>Acessar o Palco</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* 3. Acesso Rápido de Teste (só no modo demonstração) */}
            {demoMode && (
            <div className="border-t border-stage-border pt-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Acesso Rápido para Ensaio:</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoAccess('leader', 'Leandro Machado (Líder)')}
                  className="p-2 rounded-xl bg-slate-900 border border-stage-border hover:border-blue-500/60 text-left transition active:scale-95"
                >
                  <div className="text-[11px] font-bold text-slate-200 truncate">Leandro Machado</div>
                  <div className="text-[9px] text-blue-400 font-mono mt-0.5">Admin & Ministro</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoAccess('musician', 'Baterista / Banda')}
                  className="p-2 rounded-xl bg-slate-900 border border-stage-border hover:border-purple-500/60 text-left transition active:scale-95"
                >
                  <div className="text-[11px] font-bold text-slate-200 truncate">Músico / Fone</div>
                  <div className="text-[9px] text-purple-400 font-mono mt-0.5">Modo Reprodução</div>
                </button>
              </div>
            </div>
            )}
          </>
        )}

        {/* ABA 2: CADASTRO / SOLICITAR ACESSO */}
        {authMode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Nome Completo
              </label>
              <input
                type="text"
                placeholder="Ex: Mateus Silva"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="mateus@lagoinhajp.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Criar Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Instrumento / Função no Louvor
              </label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Teclados & Synth">Teclados & Synth</option>
                <option value="Bateria & Percussão">Bateria & Percussão</option>
                <option value="Baixo Elétrico">Baixo Elétrico</option>
                <option value="Guitarra Elétrica">Guitarra Elétrica</option>
                <option value="Violão Acústico">Violão Acústico</option>
                <option value="Vocal / Backing Vocal">Vocal / Backing Vocal</option>
                <option value="Ministro de Louvor">Ministro de Louvor</option>
                <option value="Técnico de Som / FOH">Técnico de Som / FOH</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1 flex items-center justify-between">
                <span>Código de Convite (Opcional)</span>
                {validInvite && <span className="text-emerald-400 font-bold">Auto-Aprovação Ativa</span>}
              </label>
              <div className="relative">
                <Link2 className="w-4 h-4 text-stage-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ex: lagoinha-musician-xyz"
                  value={inviteToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInviteToken(val);
                    if (val) {
                      void authService.validateInviteToken(val).then((tok) => setValidInvite(tok));
                    } else {
                      setValidInvite(null);
                    }
                  }}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border text-xs text-white font-mono placeholder-slate-500 focus:outline-none ${
                    validInvite ? 'border-emerald-500 text-emerald-300' : 'border-stage-border focus:border-blue-500'
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-blue-600/30 active:scale-98"
            >
              <span>{validInvite ? 'Cadastrar e Entrar Imediatamente' : 'Solicitar Acesso ao Louvor'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
