import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Cloud,
  CloudUpload,
  KeyRound,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { StoreInfo, StoreOperator, UserRole } from '../types/product';
import { triggerHaptic } from '../utils/feedback';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: User | null;
  storeInfo: StoreInfo | null;
  operators: StoreOperator[];
  activeOperator: StoreOperator | null;
  localProductsCount: number;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSelectOperator: (operator: StoreOperator) => void;
  onSaveOperator: (op: Omit<StoreOperator, 'storeId' | 'ownerId'>) => Promise<void>;
  onDeleteOperator: (operatorId: string) => Promise<void>;
  onUpdateStoreName: (name: string) => Promise<void>;
  onSyncLocalToCloud: () => Promise<number>;
}

export function AccountModal({
  isOpen,
  onClose,
  authUser,
  storeInfo,
  operators,
  activeOperator,
  localProductsCount,
  onSignInGoogle,
  onSignOut,
  onSelectOperator,
  onSaveOperator,
  onDeleteOperator,
  onUpdateStoreName,
  onSyncLocalToCloud,
}: AccountModalProps) {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [pendingOperator, setPendingOperator] = useState<StoreOperator | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [editingStoreName, setEditingStoreName] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState('');
  const [savingStore, setSavingStore] = useState(false);

  const [syncingLocal, setSyncingLocal] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [showAddOperator, setShowAddOperator] = useState(false);
  const [newOpName, setNewOpName] = useState('');
  const [newOpCode, setNewOpCode] = useState('');
  const [newOpRole, setNewOpRole] = useState<UserRole>('operator');
  const [newOpPin, setNewOpPin] = useState('');
  const [opError, setOpError] = useState<string | null>(null);
  const [savingOp, setSavingOp] = useState(false);

  const isManager = activeOperator?.role === 'admin';

  const hasDefaultPins = useMemo(
    () =>
      operators.some(
        (op) =>
          (op.id === 'op-01' && op.pin === '1234') ||
          (op.id === 'op-02' && op.pin === '0000'),
      ),
    [operators],
  );

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await onSignInGoogle();
      triggerHaptic(30);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Login cancelado antes da conclusão.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError('O navegador bloqueou a janela do Google. Permita pop-ups para entrar.');
      } else if (msg.includes('unauthorized-domain')) {
        setAuthError('Domínio não autorizado no Firebase Auth. Adicione este endereço no console.');
      } else {
        setAuthError('Não foi possível entrar com o Google agora. Tente novamente.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStartSwitchOperator = (op: StoreOperator) => {
    if (op.id === activeOperator?.id) return;
    setPendingOperator(op);
    setPinInput('');
    setPinError(null);
  };

  const handleConfirmPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOperator) return;
    if (pinInput.trim() !== pendingOperator.pin) {
      setPinError('PIN incorreto. Tente novamente.');
      triggerHaptic(40);
      return;
    }
    triggerHaptic(25);
    onSelectOperator(pendingOperator);
    setPendingOperator(null);
    setPinInput('');
    setPinError(null);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = storeNameInput.trim();
    if (!cleaned) return;
    setSavingStore(true);
    try {
      await onUpdateStoreName(cleaned);
      setEditingStoreName(false);
    } finally {
      setSavingStore(false);
    }
  };

  const handleSyncLocal = async () => {
    setSyncingLocal(true);
    setSyncMessage(null);
    try {
      const count = await onSyncLocalToCloud();
      setSyncMessage(
        count > 0
          ? `${count} produto(s) locais enviados para a nuvem.`
          : 'Todos os itens locais já existem na nuvem.',
      );
      triggerHaptic(30);
    } finally {
      setSyncingLocal(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpError(null);
    const name = newOpName.trim();
    const code = newOpCode.trim() || `Op. 0${operators.length + 1}`;
    const pin = newOpPin.trim();
    if (!name) {
      setOpError('Informe o nome do operador.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setOpError('O PIN deve ter exatamente 4 números.');
      return;
    }

    setSavingOp(true);
    try {
      const id = `op-${Date.now().toString(36)}`;
      await onSaveOperator({
        id,
        name,
        code,
        role: newOpRole,
        pin,
        active: true,
      });
      setNewOpName('');
      setNewOpCode('');
      setNewOpPin('');
      setNewOpRole('operator');
      setShowAddOperator(false);
      triggerHaptic(25);
    } finally {
      setSavingOp(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conta da Loja e Operadores"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#131b2e]/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg bg-[#faf8ff] rounded-t-2xl sm:rounded-2xl border border-[#e2e7ff] shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white px-4 py-3.5 border-b border-[#e2e7ff] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#2563eb]/10 text-[#004ac6] flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#131b2e] truncate">
                Conta da Loja &amp; Operadores
              </h2>
              <p className="text-xs text-[#434655] truncate">
                {authUser
                  ? 'Sincronização em nuvem ativa com cache offline'
                  : 'Conecte sua conta para sincronizar entre aparelhos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#434655] hover:bg-[#eaedff]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          {!authUser ? (
            <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-extrabold text-[#131b2e]">
                  Banco de Dados Online + Uso Offline
                </h3>
                <p className="text-xs text-[#434655] leading-relaxed">
                  Ao entrar com sua conta Google, o catálogo e o histórico de bips ficam salvos na nuvem em tempo real e continuam funcionando offline no celular graças ao cache local automático.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 bg-[#f2f3ff] rounded-xl p-3 text-xs text-[#434655]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#006e2d] shrink-0" />
                  <span>
                    <strong className="text-[#131b2e]">Gerente (PIN):</strong> altera preços, edita catálogo e gerencia equipe.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#004ac6] shrink-0" />
                  <span>
                    <strong className="text-[#131b2e]">Operador (PIN):</strong> consulta preços e ajusta estoque no balcão.
                  </span>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold">
                  {authError}
                </div>
              )}

              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleLogin}
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'Conectando...' : 'Entrar com Google'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Google User & Store Card */}
              <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#2563eb] text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                      {(authUser.displayName || authUser.email || 'P')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[#131b2e] truncate">
                        {authUser.displayName || 'Conta da Loja'}
                      </p>
                      <p className="text-xs text-[#434655] truncate">{authUser.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await onSignOut();
                      onClose();
                    }}
                    className="h-9 px-3 rounded-lg border border-[#cbd5e1] hover:bg-[#ffdad6] hover:border-[#ffdad6] hover:text-[#93000a] text-xs font-bold text-[#434655] flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>

                {/* Store Name */}
                <div className="pt-2.5 border-t border-[#f2f3ff]">
                  {!editingStoreName ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Store className="w-4 h-4 text-[#006058] shrink-0" />
                        <span className="text-xs font-bold text-[#131b2e] truncate">
                          {storeInfo?.name || 'Loja Principal ProntoPreço'}
                        </span>
                      </div>
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => {
                            setStoreNameInput(storeInfo?.name || '');
                            setEditingStoreName(true);
                          }}
                          className="text-xs font-bold text-[#004ac6] hover:underline shrink-0"
                        >
                          Renomear
                        </button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSaveStore} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={storeNameInput}
                        onChange={(e) => setStoreNameInput(e.target.value)}
                        placeholder="Nome da loja"
                        maxLength={100}
                        className="flex-1 h-9 px-3 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none focus:border-[#2563eb]"
                      />
                      <button
                        type="submit"
                        disabled={savingStore}
                        className="h-9 px-3 rounded-lg bg-[#006e2d] text-white text-xs font-bold shrink-0"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingStoreName(false)}
                        className="h-9 px-2.5 rounded-lg bg-[#eaedff] text-[#434655] text-xs font-bold shrink-0"
                      >
                        Cancelar
                      </button>
                    </form>
                  )}
                </div>

                {/* Sync local IndexedDB items if any */}
                {localProductsCount > 0 && (
                  <div className="pt-2.5 border-t border-[#f2f3ff] flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#434655]">
                        Há <strong className="text-[#131b2e]">{localProductsCount}</strong> itens salvos offline neste aparelho.
                      </span>
                      <button
                        type="button"
                        disabled={syncingLocal}
                        onClick={handleSyncLocal}
                        className="h-8 px-3 rounded-lg bg-[#007b71] hover:bg-[#006058] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>{syncingLocal ? 'Enviando...' : 'Sincronizar'}</span>
                      </button>
                    </div>
                    {syncMessage && (
                      <p className="text-xs font-bold text-[#006e2d]">{syncMessage}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Counter Operator Switcher */}
              <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#2563eb]" />
                    <h3 className="text-sm font-extrabold text-[#131b2e]">
                      Operador Ativo no Balcão
                    </h3>
                  </div>
                  {hasDefaultPins && (
                    <span className="text-[11px] font-semibold text-[#434655]">
                      PINs iniciais: 1234 / 0000
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {operators.map((op) => {
                    const isActive = op.id === activeOperator?.id;
                    const isAdminOp = op.role === 'admin';
                    return (
                      <div
                        key={op.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                          isActive
                            ? 'bg-[#eaedff] border-[#2563eb]'
                            : 'bg-[#f2f3ff] border-transparent'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleStartSwitchOperator(op)}
                          className="flex-1 flex items-center justify-between gap-2 text-left min-w-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#131b2e] truncate">
                              {op.code} · {op.name}
                            </p>
                            <p className="text-xs text-[#434655]">
                              {isAdminOp
                                ? 'Gerente · Acesso total (preços e equipe)'
                                : 'Operador · Consulta e estoque'}
                            </p>
                          </div>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#004ac6] shrink-0">
                              <Check className="w-4 h-4" />
                              <span>Ativo</span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-[#004ac6] shrink-0">
                              Trocar
                            </span>
                          )}
                        </button>

                        {isManager && !isActive && op.id !== 'op-01' && (
                          <button
                            type="button"
                            aria-label={`Remover ${op.name}`}
                            onClick={() => onDeleteOperator(op.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#ba1a1a] hover:bg-[#ffdad6] shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Inline PIN verification prompt */}
                {pendingOperator && (
                  <form
                    onSubmit={handleConfirmPin}
                    className="p-3 rounded-xl bg-[#eaedff] border border-[#2563eb]/30 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#131b2e]">
                        <KeyRound className="w-4 h-4 text-[#004ac6]" />
                        <span>
                          Digite o PIN de {pendingOperator.code} ({pendingOperator.name})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingOperator(null);
                          setPinError(null);
                        }}
                        className="text-xs font-semibold text-[#434655]"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        autoFocus
                        value={pinInput}
                        onChange={(e) => {
                          setPinError(null);
                          setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                        }}
                        placeholder="4 dígitos"
                        className="flex-1 h-10 px-3 rounded-lg bg-white border border-[#cbd5e1] font-mono text-base font-bold tracking-widest text-center text-[#131b2e] outline-none focus:border-[#2563eb]"
                      />
                      <button
                        type="submit"
                        className="h-10 px-4 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold shrink-0"
                      >
                        Confirmar
                      </button>
                    </div>
                    {pinError && (
                      <p className="text-xs font-bold text-[#ba1a1a]">{pinError}</p>
                    )}
                  </form>
                )}

                {/* Add Operator (Manager only) */}
                {isManager && (
                  <div className="pt-2 border-t border-[#f2f3ff]">
                    {!showAddOperator ? (
                      <button
                        type="button"
                        onClick={() => setShowAddOperator(true)}
                        className="w-full h-10 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] text-xs font-bold text-[#004ac6] flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Cadastrar Novo Operador</span>
                      </button>
                    ) : (
                      <form onSubmit={handleCreateOperator} className="flex flex-col gap-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newOpCode}
                            onChange={(e) => setNewOpCode(e.target.value)}
                            placeholder={`Código (ex: Op. 0${operators.length + 1})`}
                            maxLength={20}
                            className="h-10 px-3 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={newOpPin}
                            onChange={(e) =>
                              setNewOpPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                            placeholder="PIN (4 números)"
                            className="h-10 px-3 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] font-mono text-xs font-bold text-[#131b2e] outline-none"
                          />
                        </div>
                        <input
                          type="text"
                          value={newOpName}
                          onChange={(e) => setNewOpName(e.target.value)}
                          placeholder="Nome completo do funcionário"
                          maxLength={60}
                          className="h-10 px-3 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNewOpRole('operator')}
                            className={`flex-1 h-9 rounded-lg text-xs font-bold ${
                              newOpRole === 'operator'
                                ? 'bg-[#2563eb] text-white'
                                : 'bg-[#eaedff] text-[#434655]'
                            }`}
                          >
                            Operador (Balcão)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewOpRole('admin')}
                            className={`flex-1 h-9 rounded-lg text-xs font-bold ${
                              newOpRole === 'admin'
                                ? 'bg-[#006e2d] text-white'
                                : 'bg-[#eaedff] text-[#434655]'
                            }`}
                          >
                            Gerente (Total)
                          </button>
                        </div>

                        {opError && (
                          <p className="text-xs font-bold text-[#ba1a1a]">{opError}</p>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddOperator(false);
                              setOpError(null);
                            }}
                            className="flex-1 h-9 rounded-lg bg-[#eaedff] text-xs font-bold text-[#434655]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingOp}
                            className="flex-1 h-9 rounded-lg bg-[#006e2d] text-white text-xs font-bold"
                          >
                            {savingOp ? 'Salvando...' : 'Salvar Operador'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
