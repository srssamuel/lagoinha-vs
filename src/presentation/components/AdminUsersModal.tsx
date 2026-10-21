import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../../domain/entities/User';
import { InviteToken } from '../../domain/entities/InviteToken';
import { MembershipPort } from '../../application/ports/MembershipPort';
import {
  X,
  ShieldCheck,
  UserCheck,
  UserX,
  Link2,
  Copy,
  Check,
  Users,
  Clock,
  Sparkles,
  Trash2,
  Search,
  CheckCircle2
} from 'lucide-react';

interface AdminUsersModalProps {
  isOpen: boolean;
  currentUser: User;
  authService: MembershipPort;
  onClose: () => void;
  onUsersUpdated?: () => void;
}

type TabType = 'pending' | 'members' | 'invites';

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({
  isOpen,
  currentUser,
  authService,
  onClose,
  onUsersUpdated
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [inviteTokens, setInviteTokens] = useState<InviteToken[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados do formulário de novo convite
  const [inviteRole, setInviteRole] = useState<UserRole>('musician');
  const [inviteExpiryHours, setInviteExpiryHours] = useState<number>(24);
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(1);
  const [generatedInvite, setGeneratedInvite] = useState<InviteToken | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const pendings = await authService.listPendingUsers();
    const all = await authService.listAllUsers();
    const tokens = await authService.listInviteTokens();
    setPendingUsers(pendings);
    setAllUsers(all);
    setInviteTokens(tokens);
  }, [authService]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleApprove = async (uid: string, role: UserRole) => {
    await authService.approveUser(uid, role, currentUser.uid);
    showFeedback('Usuário aprovado com sucesso!');
    await loadData();
    onUsersUpdated?.();
  };

  const handleReject = async (uid: string) => {
    await authService.rejectUser(uid, currentUser.uid);
    showFeedback('Solicitação recusada.');
    await loadData();
    onUsersUpdated?.();
  };

  const handleChangeRole = async (uid: string, newRole: UserRole) => {
    await authService.updateUserRole(uid, newRole, currentUser.uid);
    showFeedback('Papel do membro atualizado.');
    await loadData();
    onUsersUpdated?.();
  };

  const handleCreateInvite = async () => {
    const expiresHours = inviteExpiryHours === 0 ? undefined : inviteExpiryHours;
    const maxUses = inviteMaxUses === 0 ? undefined : inviteMaxUses;

    const token = await authService.createInviteLink({
      targetRole: inviteRole,
      expiresHours,
      maxUses,
      adminUser: currentUser
    });

    setGeneratedInvite(token);
    showFeedback('Link de convite gerado com sucesso!');
    await loadData();
  };

  const handleCopyInvite = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      showFeedback('Link copiado para a área de transferência!');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleRevokeInvite = async (tokenId: string) => {
    await authService.revokeInviteToken(tokenId);
    showFeedback('Convite revogado com sucesso.');
    await loadData();
  };

  const filteredMembers = allUsers.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.instrumentOrMinistry && u.instrumentOrMinistry.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#111520] border border-stage-border rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Gestão de Equipe & Controle de Acessos
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  PAINEL ADM
                </span>
              </div>
              <p className="text-xs text-stage-muted mt-0.5">
                Aprovação de membros, permissões no palco e links de convite para músicos e técnicos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white transition"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Bar */}
        {actionFeedback && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Abas */}
        <div className="flex items-center gap-2 border-b border-stage-border pb-3 mb-4 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'pending'
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                : 'bg-stage-card border border-stage-border text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Solicitações Pendentes</span>
            {pendingUsers.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'members'
                ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300 shadow-md shadow-blue-500/10'
                : 'bg-stage-card border border-stage-border text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Equipe Cadastrada ({allUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'invites'
                ? 'bg-purple-600/20 border border-purple-500/50 text-purple-300 shadow-md shadow-purple-500/10'
                : 'bg-stage-card border border-stage-border text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Gerar Links de Convite</span>
          </button>
        </div>

        {/* CONTEÚDO DAS ABAS */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* ABA 1: SOLICITAÇÕES PENDENTES */}
          {activeTab === 'pending' && (
            <div className="space-y-3">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-12 text-stage-muted">
                  <UserCheck className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-60" />
                  <p className="text-sm font-bold text-slate-300">Nenhuma solicitação pendente no momento</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Quando novos músicos se cadastrarem pelo site, você poderá aprová-los aqui.
                  </p>
                </div>
              ) : (
                pendingUsers.map((user) => (
                  <div
                    key={user.uid}
                    className="p-4 rounded-2xl bg-stage-card border border-amber-500/30 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{user.displayName}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold">
                          AGUARDANDO APROVAÇÃO
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        <span>{user.email}</span>
                        {user.instrumentOrMinistry && (
                          <span className="ml-2 text-blue-400 font-semibold">• {user.instrumentOrMinistry}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(user.uid, 'musician')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition active:scale-95"
                      >
                        Aprovar Músico
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(user.uid, 'sound_tech')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95"
                      >
                        Aprovar Som/FOH
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(user.uid, 'leader')}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition active:scale-95"
                      >
                        Aprovar Líder
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReject(user.uid)}
                        className="p-1.5 rounded-xl bg-stage-card border border-stage-border text-slate-400 hover:text-rose-400 transition"
                        title="Recusar Solicitação"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ABA 2: EQUIPE CADASTRADA */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {/* Barra de Busca */}
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-stage-muted absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar membro por nome, email ou instrumento..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                {filteredMembers.map((member) => (
                  <div
                    key={member.uid}
                    className="p-3.5 rounded-xl bg-stage-card border border-stage-border flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{member.displayName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold ${
                            member.role === 'admin'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : member.role === 'leader'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : member.role === 'sound_tech'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : member.role === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          }`}
                        >
                          {member.role.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        <span>{member.email}</span>
                        {member.instrumentOrMinistry && (
                          <span className="ml-2 text-slate-300">• {member.instrumentOrMinistry}</span>
                        )}
                      </div>
                    </div>

                    {/* Seletor de Papel Rápido */}
                    {member.uid !== currentUser.uid ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-stage-muted text-[10px]">Alterar papel:</span>
                        <select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.uid, e.target.value as UserRole)}
                          className="bg-slate-900 border border-stage-border text-white text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
                        >
                          <option value="musician">Músico</option>
                          <option value="sound_tech">Técnico de Som</option>
                          <option value="leader">Ministro de Louvor</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                    ) : (
                      <span className="text-[10px] text-stage-muted font-bold">(Você)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 3: GERAR LINKS DE CONVITE */}
          {activeTab === 'invites' && (
            <div className="space-y-5">
              {/* Formulário de Criação de Link */}
              <div className="p-4 rounded-2xl bg-stage-card border border-purple-500/30 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-purple-300">
                  <Sparkles className="w-4 h-4" />
                  <span>Criar Novo Link de Auto-Aprovação</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Quem entrar por este link será <strong>aprovado instantaneamente</strong> com o papel selecionado abaixo, sem precisar esperar aprovação manual.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Papel Concedido
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="w-full bg-slate-900 border border-stage-border text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-purple-500"
                    >
                      <option value="musician">Músico (Banda)</option>
                      <option value="sound_tech">Técnico de Som (FOH)</option>
                      <option value="leader">Ministro de Louvor</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Validade do Link
                    </label>
                    <select
                      value={inviteExpiryHours}
                      onChange={(e) => setInviteExpiryHours(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-stage-border text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-purple-500"
                    >
                      <option value={24}>24 Horas</option>
                      <option value={72}>3 Dias</option>
                      <option value={168}>7 Dias</option>
                      <option value={0}>Sem Expiração (Permanente)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Limite de Usos
                    </label>
                    <select
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-stage-border text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-purple-500"
                    >
                      <option value={1}>1 Uso (Individual)</option>
                      <option value={5}>5 Usos</option>
                      <option value={15}>15 Usos (Grupo do Louvor)</option>
                      <option value={0}>Ilimitado</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateInvite}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-purple-600/30 active:scale-98"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Gerar Link de Convite Oficial</span>
                </button>
              </div>

              {/* Card com Link Recém-Gerado */}
              {generatedInvite && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Link Pronto para Enviar no WhatsApp!</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-300">
                      Função: {generatedInvite.targetRole.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInvite.inviteUrl}
                      className="flex-1 bg-slate-900/90 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(generatedInvite.inviteUrl)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shrink-0"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Convites Ativos */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Histórico de Links Gerados ({inviteTokens.length})
                </h4>

                <div className="space-y-2">
                  {inviteTokens.length === 0 ? (
                    <p className="text-xs text-stage-muted py-4 text-center">Nenhum convite gerado ainda.</p>
                  ) : (
                    inviteTokens.map((token) => (
                      <div
                        key={token.id}
                        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                          token.isValid()
                            ? 'bg-stage-card border-stage-border'
                            : 'bg-stage-card/40 border-slate-800 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white font-bold text-[11px]">{token.token}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                token.isValid()
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {token.isValid() ? 'ATIVO' : 'EXPIRADO / ESGOTADO'}
                            </span>
                          </div>
                          <div className="text-[10px] text-stage-muted mt-0.5">
                            Cargo: <strong className="text-slate-300">{token.targetRole}</strong> • Usos:{' '}
                            {token.usedCount} de {token.maxUses === Infinity ? '∞' : token.maxUses}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {token.isValid() && (
                            <button
                              type="button"
                              onClick={() => handleCopyInvite(token.inviteUrl)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 transition"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Copiar</span>
                            </button>
                          )}

                          {token.isActive && (
                            <button
                              type="button"
                              onClick={() => handleRevokeInvite(token.id)}
                              className="p-1 rounded-lg bg-slate-800 hover:text-rose-400 text-slate-400 text-[10px] transition"
                              title="Revogar este convite"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t border-stage-border pt-4 mt-4 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-stage-muted">
            Lagoinha VS • Segurança e Organização no Altar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/30"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
