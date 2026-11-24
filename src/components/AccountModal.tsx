import React, { useEffect, useMemo, useState } from 'react';
import {
  reload,
  sendEmailVerification,
  User,
} from 'firebase/auth';
import {
  AlertCircle,
  Check,
  Cloud,
  CloudUpload,
  Download,
  Edit3,
  ExternalLink,
  GitBranch,
  HardDrive,
  Info,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { APP_VERSION } from '../config/appConfig';
import {
  AuthFriendlyError,
  detectAuthEnvironment,
  registerWithEmailSafe,
  resetPasswordSafe,
  signInWithEmailSafe,
  signInWithGoogleSafe,
} from '../firebase';
import {
  getEffectiveGitHubRepo,
  saveGitHubRepoOverride,
} from '../services/githubUpdateService';
import {
  LocalAccount,
  SaveOperatorInput,
  StoreInfo,
  StoreOperator,
  UpdateCheckResult,
  UserRole,
} from '../types/product';
import { playBeep, triggerHaptic } from '../utils/feedback';
import {
  clearPinAttempts,
  DEFAULT_MANAGER_PIN,
  getPinLockState,
  isUsingDefaultManagerPin,
  isValidPinFormat,
  PIN_MAX_LENGTH,
  recordFailedPinAttempt,
  sanitizePinInput,
  verifyPin,
} from '../utils/pinSecurity';

type AuthTab = 'local' | 'email' | 'google';
type EmailSubMode = 'login' | 'register' | 'reset';

interface AccountModalProps {
  isOpen: boolean;
  embedded?: boolean;
  onClose: () => void;
  authUser: User | null;
  storeInfo: StoreInfo | null;
  operators: StoreOperator[];
  activeOperator: StoreOperator | null;
  syncMode: 'cloud' | 'local' | 'none';
  localAccounts: LocalAccount[];
  activeLocalAccount: LocalAccount | null;
  localAccountProductCounts: Record<string, number>;
  onAuthRefresh: () => Promise<void>;
  onSignOutCloud: () => Promise<void>;
  onSelectLocalAccount: (accountId: string) => void;
  onCreateLocalAccount: (
    storeName: string,
    managerName: string,
    managerPin: string,
  ) => Promise<void>;
  onExitLocalAccount: () => void;
  onSelectOperator: (operator: StoreOperator) => void;
  onLockRegister: () => void;
  onSaveOperator: (op: SaveOperatorInput) => Promise<void>;
  onDeleteOperator: (operatorId: string) => Promise<void>;
  onUpdateStoreName: (name: string) => Promise<void>;
  onSyncLocalAccountToCloud: (localAccountId: string) => Promise<number>;
  updateInfo: UpdateCheckResult | null;
  checkingUpdates: boolean;
  onCheckUpdates: (force?: boolean) => Promise<void>;
}

export function AccountModal({
  isOpen,
  embedded = false,
  onClose,
  authUser,
  storeInfo,
  operators,
  activeOperator,
  syncMode,
  localAccounts,
  activeLocalAccount,
  localAccountProductCounts,
  onAuthRefresh,
  onSignOutCloud,
  onSelectLocalAccount,
  onCreateLocalAccount,
  onExitLocalAccount,
  onSelectOperator,
  onLockRegister,
  onSaveOperator,
  onDeleteOperator,
  onUpdateStoreName,
  onSyncLocalAccountToCloud,
  updateInfo,
  checkingUpdates,
  onCheckUpdates,
}: AccountModalProps) {
  const [authTab, setAuthTab] = useState<AuthTab>('local');
  const [emailMode, setEmailMode] = useState<EmailSubMode>('login');

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');

  const [localStoreName, setLocalStoreName] = useState('');
  const [localManagerName, setLocalManagerName] = useState('Gerente');
  const [localManagerPin, setLocalManagerPin] = useState(DEFAULT_MANAGER_PIN);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [suggestAltOnGoogleErr, setSuggestAltOnGoogleErr] = useState(false);

  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  const [pendingOperator, setPendingOperator] = useState<StoreOperator | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [editingStoreName, setEditingStoreName] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState('');
  const [savingStore, setSavingStore] = useState(false);

  const [syncingLocalId, setSyncingLocalId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Team / Operator Creation & Editing (Manager only)
  const [operatorEditorOpen, setOperatorEditorOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<StoreOperator | null>(null);
  const [opName, setOpName] = useState('');
  const [opCode, setOpCode] = useState('');
  const [opRole, setOpRole] = useState<UserRole>('operator');
  const [opPin, setOpPin] = useState('');
  const [opCanConsult, setOpCanConsult] = useState(true);
  const [opCanAdjustStock, setOpCanAdjustStock] = useState(true);
  const [opActive, setOpActive] = useState(true);
  const [opError, setOpError] = useState<string | null>(null);
  const [opFeedback, setOpFeedback] = useState<string | null>(null);
  const [savingOp, setSavingOp] = useState(false);
  const [confirmDeleteOpId, setConfirmDeleteOpId] = useState<string | null>(null);

  const [isDefaultMgrPin, setIsDefaultMgrPin] = useState(false);

  const storeIdKey =
    syncMode === 'cloud'
      ? storeInfo?.storeId || ''
      : activeLocalAccount?.id || '';
  const [lockState, setLockState] = useState(() =>
    storeIdKey ? getPinLockState(storeIdKey) : { failedAttempts: 0, lockedUntil: 0, remainingSeconds: 0, isLocked: false },
  );

  const initialRepo = useMemo(() => getEffectiveGitHubRepo(), []);
  const [editingGitHubRepo, setEditingGitHubRepo] = useState(false);
  const [ghOwnerInput, setGhOwnerInput] = useState(initialRepo.owner);
  const [ghRepoInput, setGhRepoInput] = useState(initialRepo.repo);
  const [ghBranchInput, setGhBranchInput] = useState(initialRepo.branch);

  const envInfo = useMemo(() => detectAuthEnvironment(), []);
  const isManager = activeOperator?.role === 'manager';
  const isUnverifiedCloudUser = Boolean(authUser && !authUser.emailVerified);

  const activeOperators = useMemo(
    () => operators.filter((op) => op.active),
    [operators],
  );

  const localAccountsWithItems = useMemo(
    () => localAccounts.filter((acc) => (localAccountProductCounts[acc.id] || 0) > 0),
    [localAccounts, localAccountProductCounts],
  );

  useEffect(() => {
    if (!storeIdKey) return;
    setLockState(getPinLockState(storeIdKey));
    const timer = setInterval(() => {
      setLockState(getPinLockState(storeIdKey));
    }, 500);
    return () => clearInterval(timer);
  }, [storeIdKey]);

  useEffect(() => {
    let active = true;
    const primaryMgr = operators.find((o) => o.id === 'op-01');
    if (!storeIdKey || !primaryMgr || !isManager) {
      setIsDefaultMgrPin(false);
      return;
    }
    void isUsingDefaultManagerPin(storeIdKey, primaryMgr).then((res) => {
      if (active) setIsDefaultMgrPin(res);
    });
    return () => {
      active = false;
    };
  }, [storeIdKey, operators, isManager]);

  if (!isOpen && !embedded) return null;

  const currentStoreName =
    syncMode === 'cloud'
      ? storeInfo?.name || 'Minha Loja ProntoPreço'
      : activeLocalAccount?.storeName || 'Loja Local';

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setSuggestAltOnGoogleErr(false);
    setAuthLoading(true);
    try {
      await signInWithGoogleSafe();
      triggerHaptic(30);
      if (!embedded) onClose();
    } catch (err) {
      if (err instanceof AuthFriendlyError) {
        setAuthError(err.message);
        setSuggestAltOnGoogleErr(err.suggestAlternative);
      } else {
        setAuthError('Não foi possível autenticar com o Google agora.');
        setSuggestAltOnGoogleErr(true);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!emailInput.trim()) {
      setAuthError('Informe o e-mail da loja.');
      return;
    }

    if (emailMode === 'reset') {
      setAuthLoading(true);
      try {
        await resetPasswordSafe(emailInput);
        setAuthNotice('Enviamos um link de redefinição de senha para o seu e-mail.');
        setEmailMode('login');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Erro ao enviar e-mail.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (passwordInput.length < 6) {
      setAuthError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setAuthLoading(true);
    try {
      if (emailMode === 'register') {
        await registerWithEmailSafe(emailInput, passwordInput, ownerNameInput);
        triggerHaptic(30);
        setAuthNotice(
          'Conta criada! Enviamos um link de verificação para o seu e-mail.',
        );
      } else {
        await signInWithEmailSafe(emailInput, passwordInput);
        triggerHaptic(30);
        if (!embedded) onClose();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const name = localStoreName.trim();
    if (!name) {
      setAuthError('Informe o nome da sua loja local.');
      return;
    }
    if (!isValidPinFormat(localManagerPin)) {
      setAuthError('O PIN do Gerente deve ter de 4 a 6 números.');
      return;
    }
    setAuthLoading(true);
    try {
      triggerHaptic(30);
      await onCreateLocalAccount(name, localManagerName.trim() || 'Gerente', localManagerPin);
      setLocalStoreName('');
      if (!embedded) onClose();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    if (!authUser) return;
    setVerifyingEmail(true);
    setAuthError(null);
    try {
      await reload(authUser);
      await authUser.getIdToken(true);
      await onAuthRefresh();
      if (!authUser.emailVerified) {
        setAuthError(
          'Seu e-mail ainda consta como não verificado. Clique no link enviado para sua caixa de entrada ou spam.',
        );
      } else {
        triggerHaptic(30);
        if (!embedded) onClose();
      }
    } catch {
      setAuthError('Não foi possível verificar o status do e-mail agora.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleResendVerification = async () => {
    if (!authUser || resendCooldown) return;
    setAuthError(null);
    try {
      await sendEmailVerification(authUser);
      setAuthNotice('Novo e-mail de verificação enviado! Verifique sua caixa de entrada e spam.');
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 30_000);
    } catch {
      setAuthError('Aguarde alguns segundos antes de solicitar outro e-mail.');
    }
  };

  const handleStartSwitchOperator = (op: StoreOperator) => {
    if (!op.active || op.id === activeOperator?.id) return;
    setPendingOperator(op);
    setPinInput('');
    setPinError(null);
  };

  const handleConfirmPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOperator || !storeIdKey || verifyingPin) return;

    const currentLock = getPinLockState(storeIdKey);
    setLockState(currentLock);
    if (currentLock.isLocked) {
      setPinError(`Bloqueado temporariamente. Aguarde ${currentLock.remainingSeconds}s.`);
      return;
    }

    if (!isValidPinFormat(pinInput)) {
      setPinError('Digite o PIN de 4 a 6 números.');
      return;
    }

    setVerifyingPin(true);
    setPinError(null);
    try {
      const ok = await verifyPin(storeIdKey, pendingOperator, pinInput);
      if (!ok) {
        const nextLock = recordFailedPinAttempt(storeIdKey);
        setLockState(nextLock);
        setPinInput('');
        playBeep('error');
        triggerHaptic(45);
        setPinError(
          nextLock.isLocked
            ? `Muitas tentativas falhas. Aguarde ${nextLock.remainingSeconds}s.`
            : 'PIN incorreto. Tente novamente.',
        );
        return;
      }

      clearPinAttempts(storeIdKey);
      playBeep('success');
      triggerHaptic(25);
      onSelectOperator(pendingOperator);
      setPendingOperator(null);
      setPinInput('');
      setPinError(null);
      setOperatorEditorOpen(false);
      setEditingOperator(null);
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
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

  const handleSyncLocal = async (localId: string) => {
    if (!isManager) return;
    setSyncingLocalId(localId);
    setSyncMessage(null);
    try {
      const count = await onSyncLocalAccountToCloud(localId);
      setSyncMessage(
        count > 0
          ? `${count} produto(s) enviados para a nuvem com sucesso.`
          : 'Todos os produtos dessa loja local já estão na nuvem.',
      );
      triggerHaptic(30);
    } finally {
      setSyncingLocalId(null);
    }
  };

  const openCreateOperatorForm = () => {
    if (!isManager) return;
    setEditingOperator(null);
    setOpName('');
    setOpCode(`Op. ${String(operators.length + 1).padStart(2, '0')}`);
    setOpRole('operator');
    setOpPin('');
    setOpCanConsult(true);
    setOpCanAdjustStock(true);
    setOpActive(true);
    setOpError(null);
    setOpFeedback(null);
    setOperatorEditorOpen(true);
  };

  const openEditOperatorForm = (op: StoreOperator) => {
    if (!isManager) return;
    setEditingOperator(op);
    setOpName(op.name);
    setOpCode(op.code);
    setOpRole(op.role);
    setOpPin('');
    setOpCanConsult(op.canConsultPrices);
    setOpCanAdjustStock(op.canAdjustStock);
    setOpActive(op.active);
    setOpError(null);
    setOpFeedback(null);
    setOperatorEditorOpen(true);
  };

  const handleSaveOperatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;

    setOpError(null);
    setOpFeedback(null);

    const cleanName = opName.trim();
    const cleanCode =
      opCode.trim() || `Op. ${String(operators.length + 1).padStart(2, '0')}`;
    const cleanPin = opPin.trim();

    if (!cleanName) {
      setOpError('Informe o nome do perfil.');
      return;
    }

    if (!editingOperator && !isValidPinFormat(cleanPin)) {
      setOpError('O novo perfil precisa de um PIN de 4 a 6 números.');
      return;
    }

    if (editingOperator && cleanPin.length > 0 && !isValidPinFormat(cleanPin)) {
      setOpError('O novo PIN deve ter de 4 a 6 números.');
      return;
    }

    const isPrimaryManager = editingOperator?.id === 'op-01';
    const finalRole: UserRole = isPrimaryManager ? 'manager' : opRole;
    const finalActive =
      isPrimaryManager || editingOperator?.id === activeOperator?.id
        ? true
        : opActive;

    setSavingOp(true);
    try {
      const id = editingOperator?.id || `op-${Date.now().toString(36)}`;
      await onSaveOperator({
        id,
        name: cleanName,
        code: cleanCode,
        role: finalRole,
        newPin: cleanPin || undefined,
        existingPinHash: editingOperator?.pinHash,
        existingLegacyPin: editingOperator?.pin,
        canConsultPrices: finalRole === 'manager' ? true : opCanConsult,
        canAdjustStock: finalRole === 'manager' ? true : opCanAdjustStock,
        active: finalActive,
      });

      setOpFeedback(
        editingOperator
          ? cleanPin
            ? `Dados e novo PIN de ${cleanName} atualizados com segurança.`
            : `Perfil de ${cleanName} atualizado.`
          : `Operador ${cleanName} cadastrado com sucesso.`,
      );
      setOperatorEditorOpen(false);
      setEditingOperator(null);
      setOpPin('');
      triggerHaptic(25);
    } catch {
      setOpError('Não foi possível salvar o operador agora.');
    } finally {
      setSavingOp(false);
    }
  };

  const handleToggleOperatorActive = async (op: StoreOperator) => {
    if (!isManager || op.id === 'op-01' || op.id === activeOperator?.id) return;
    await onSaveOperator({
      id: op.id,
      name: op.name,
      code: op.code,
      role: op.role,
      existingPinHash: op.pinHash,
      existingLegacyPin: op.pin,
      canConsultPrices: op.canConsultPrices,
      canAdjustStock: op.canAdjustStock,
      active: !op.active,
    });
    triggerHaptic(20);
  };

  const renderAuthSelector = () => (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#eaedff]">
        <button
          type="button"
          onClick={() => {
            setAuthTab('local');
            setAuthError(null);
            setAuthNotice(null);
          }}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            authTab === 'local'
              ? 'bg-white text-[#131b2e] shadow-sm'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5 text-[#006058]" />
          <span>Conta Local</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAuthTab('email');
            setAuthError(null);
            setAuthNotice(null);
          }}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            authTab === 'email'
              ? 'bg-white text-[#131b2e] shadow-sm'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <Mail className="w-3.5 h-3.5 text-[#004ac6]" />
          <span>E-mail</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAuthTab('google');
            setAuthError(null);
            setAuthNotice(null);
          }}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            authTab === 'google'
              ? 'bg-white text-[#131b2e] shadow-sm'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-[#2563eb]" />
          <span>Google</span>
        </button>
      </div>

      {authNotice && (
        <div className="p-3 rounded-xl bg-[#dcfce7] text-[#005320] text-xs font-bold">
          {authNotice}
        </div>
      )}

      {authError && (
        <div className="p-3 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-semibold flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
          {suggestAltOnGoogleErr && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('email');
                  setAuthError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-white text-[#131b2e] text-xs font-bold cursor-pointer"
              >
                Usar E-mail e Senha
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('local');
                  setAuthError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#007b71] text-white text-xs font-bold cursor-pointer"
              >
                Usar Conta Local
              </button>
            </div>
          )}
        </div>
      )}

      {authTab === 'local' && (
        <div className="flex flex-col gap-3">
          {localAccounts.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#e2e7ff] p-3.5 flex flex-col gap-2">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#434655]">
                Lojas Locais neste Aparelho
              </p>
              {localAccounts.map((acc) => {
                const count = localAccountProductCounts[acc.id] || 0;
                const isSelected = activeLocalAccount?.id === acc.id && syncMode === 'local';
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic(25);
                      onSelectLocalAccount(acc.id);
                      if (!embedded) onClose();
                    }}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#eaedff] border-[#2563eb]'
                        : 'bg-[#f2f3ff] hover:bg-[#eaedff] border-transparent'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[#131b2e] truncate">
                        {acc.storeName}
                      </p>
                      <p className="text-xs text-[#434655]">
                        {count} produto(s) · {acc.operators.length} perfil(is) · Exige PIN
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#004ac6] shrink-0">
                      {isSelected ? 'Aberta' : 'Entrar'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <form
            onSubmit={(e) => void handleCreateLocal(e)}
            className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3"
          >
            <div>
              <h3 className="text-sm font-extrabold text-[#131b2e]">
                Criar Nova Conta Local (100% Offline)
              </h3>
              <p className="text-xs text-[#434655] mt-0.5">
                Você já inicia como <strong>Gerente</strong> com catálogo vazio e pode cadastrar operadores depois.
              </p>
            </div>

            <input
              type="text"
              value={localStoreName}
              onChange={(e) => setLocalStoreName(e.target.value)}
              placeholder="Nome da Loja (ex: Mercado Central)"
              maxLength={100}
              className="h-11 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] text-sm font-semibold text-[#131b2e] outline-none focus:border-[#2563eb]"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={localManagerName}
                onChange={(e) => setLocalManagerName(e.target.value)}
                placeholder="Nome do Gerente"
                maxLength={60}
                className="h-10 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none focus:border-[#2563eb]"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={PIN_MAX_LENGTH}
                value={localManagerPin}
                onChange={(e) => setLocalManagerPin(sanitizePinInput(e.target.value))}
                placeholder="PIN Gerente (4-6 núm.)"
                className="h-10 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] font-mono text-xs font-bold text-[#131b2e] outline-none focus:border-[#2563eb]"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-11 rounded-xl bg-[#007b71] hover:bg-[#006058] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
            >
              <HardDrive className="w-4 h-4" />
              <span>{authLoading ? 'Criando...' : 'Criar e Entrar como Gerente'}</span>
            </button>
          </form>
        </div>
      )}

      {authTab === 'email' && (
        <form
          onSubmit={(e) => void handleEmailSubmit(e)}
          className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[#131b2e]">
              {emailMode === 'login'
                ? 'Entrar na Nuvem com E-mail'
                : emailMode === 'register'
                  ? 'Criar Conta da Loja na Nuvem'
                  : 'Recuperar Senha'}
            </h3>
            <div className="flex items-center gap-2 text-xs font-bold">
              {emailMode !== 'login' ? (
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('login');
                    setAuthError(null);
                  }}
                  className="text-[#004ac6] hover:underline cursor-pointer"
                >
                  Já tenho conta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('register');
                    setAuthError(null);
                  }}
                  className="text-[#004ac6] hover:underline cursor-pointer"
                >
                  Criar conta
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-[#434655]">
            Quem cria a conta inicia como Gerente. Novos dispositivos entrando na mesma loja deverão selecionar o perfil e digitar o PIN.
          </p>

          {emailMode === 'register' && (
            <input
              type="text"
              value={ownerNameInput}
              onChange={(e) => setOwnerNameInput(e.target.value)}
              placeholder="Nome da Loja ou Gerente"
              maxLength={80}
              className="h-11 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] text-sm font-semibold text-[#131b2e] outline-none focus:border-[#2563eb]"
            />
          )}

          <input
            type="email"
            required
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="seu-email@loja.com"
            className="h-11 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] text-sm font-medium text-[#131b2e] outline-none focus:border-[#2563eb]"
          />

          {emailMode !== 'reset' && (
            <input
              type="password"
              required
              minLength={6}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Senha (mínimo 6 caracteres)"
              className="h-11 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] text-sm font-medium text-[#131b2e] outline-none focus:border-[#2563eb]"
            />
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>
              {authLoading
                ? 'Processando...'
                : emailMode === 'login'
                  ? 'Entrar na Loja'
                  : emailMode === 'register'
                    ? 'Criar Conta na Nuvem'
                    : 'Enviar Link de Recuperação'}
            </span>
          </button>

          {emailMode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setEmailMode('reset');
                setAuthError(null);
              }}
              className="text-xs font-semibold text-[#434655] hover:text-[#004ac6] self-end cursor-pointer"
            >
              Esqueci minha senha
            </button>
          )}
        </form>
      )}

      {authTab === 'google' && (
        <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#131b2e]">
              Entrar na Nuvem com Google
            </h3>
            <p className="text-xs text-[#434655] mt-1 leading-relaxed">
              Sincronize catálogo, preços e equipe com cache offline. Em outros dispositivos, o acesso ao caixa exige seleção de perfil e PIN.
            </p>
          </div>

          {(envInfo.isRestrictedWebView || envInfo.isIframe) && (
            <div className="p-2.5 rounded-xl bg-[#f2f3ff] text-[11px] text-[#434655] leading-relaxed">
              Dica: em WebViews, APKs ou previews incorporados, o Google pode bloquear janelas pop-up. Se ocorrer erro, use a aba <strong>E-mail</strong> ou <strong>Conta Local</strong>.
            </div>
          )}

          <button
            type="button"
            disabled={authLoading}
            onClick={() => void handleGoogleLogin()}
            className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{authLoading ? 'Conectando...' : 'Entrar com Google'}</span>
          </button>
        </div>
      )}
    </div>
  );

  const renderEmailVerificationNotice = () => (
    <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#eaedff] text-[#004ac6] flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-[#131b2e]">
            Confirme seu E-mail para Sincronizar
          </h3>
          <p className="text-xs text-[#434655] mt-1 leading-relaxed">
            Para proteger os dados da sua loja, enviamos um link de verificação para{' '}
            <strong className="text-[#131b2e]">{authUser?.email}</strong>. Abra o link e depois toque abaixo.
          </p>
        </div>
      </div>

      {authNotice && (
        <div className="p-2.5 rounded-xl bg-[#dcfce7] text-[#005320] text-xs font-bold">
          {authNotice}
        </div>
      )}
      {authError && (
        <div className="p-2.5 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold">
          {authError}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={verifyingEmail}
          onClick={() => void handleCheckEmailVerified()}
          className="w-full h-11 rounded-xl bg-[#006e2d] hover:bg-[#005320] disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${verifyingEmail ? 'animate-spin' : ''}`} />
          <span>{verifyingEmail ? 'Verificando...' : 'Já confirmei meu e-mail'}</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={resendCooldown}
            onClick={() => void handleResendVerification()}
            className="h-10 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] disabled:opacity-50 text-[#131b2e] text-xs font-bold cursor-pointer"
          >
            {resendCooldown ? 'Aguarde...' : 'Reenviar E-mail'}
          </button>
          <button
            type="button"
            onClick={() => void onSignOutCloud()}
            className="h-10 rounded-xl border border-[#cbd5e1] hover:bg-[#f2f3ff] text-[#434655] text-xs font-bold cursor-pointer"
          >
            Trocar / Usar Local
          </button>
        </div>
      </div>
    </div>
  );

  const renderActiveStorePanel = () => (
    <div className="flex flex-col gap-4">
      {/* Store Summary, Lock Register & Account Switch */}
      <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full text-white font-extrabold text-sm flex items-center justify-center shrink-0 ${
                syncMode === 'cloud' ? 'bg-[#2563eb]' : 'bg-[#007b71]'
              }`}
            >
              {syncMode === 'cloud' ? (
                (authUser?.displayName || authUser?.email || 'L')[0].toUpperCase()
              ) : (
                <HardDrive className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[#131b2e] truncate">
                {activeOperator?.name || 'Perfil Ativo'} ·{' '}
                <span className={isManager ? 'text-[#006e2d]' : 'text-[#004ac6]'}>
                  {isManager ? 'Gerente' : 'Operador'}
                </span>
              </p>
              <p className="text-xs text-[#434655] truncate">
                {syncMode === 'cloud'
                  ? authUser?.email
                  : 'Armazenamento Local Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(25);
              onClose();
              onLockRegister();
            }}
            className="h-9 px-3 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] text-xs font-bold text-[#131b2e] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-[#004ac6]" />
            <span>Bloquear Caixa</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (syncMode === 'cloud') {
                await onSignOutCloud();
              } else {
                onExitLocalAccount();
              }
            }}
            className="h-9 px-3 rounded-lg border border-[#cbd5e1] hover:bg-[#ffdad6] hover:border-[#ffdad6] hover:text-[#93000a] text-xs font-bold text-[#434655] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Loja</span>
          </button>
        </div>

        {/* Store Name (Rename allowed ONLY for Gerente) */}
        <div className="pt-2.5 border-t border-[#f2f3ff]">
          {!editingStoreName ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Store className="w-4 h-4 text-[#006058] shrink-0" />
                <span className="text-xs font-bold text-[#131b2e] truncate">
                  {currentStoreName}
                </span>
              </div>
              {isManager && (
                <button
                  type="button"
                  onClick={() => {
                    setStoreNameInput(currentStoreName);
                    setEditingStoreName(true);
                  }}
                  className="text-xs font-bold text-[#004ac6] hover:underline shrink-0 cursor-pointer"
                >
                  Renomear
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={(e) => void handleSaveStore(e)} className="flex items-center gap-2">
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
                className="h-9 px-3 rounded-lg bg-[#006e2d] text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingStoreName(false)}
                className="h-9 px-2.5 rounded-lg bg-[#eaedff] text-[#434655] text-xs font-bold shrink-0 cursor-pointer"
              >
                Cancelar
              </button>
            </form>
          )}
        </div>

        {/* Optional Import from Local Store -> Cloud (Manager only) */}
        {isManager && syncMode === 'cloud' && localAccountsWithItems.length > 0 && (
          <div className="pt-2.5 border-t border-[#f2f3ff] flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#434655]">
              Importar Loja Local para esta Conta na Nuvem
            </span>
            {localAccountsWithItems.map((acc) => {
              const count = localAccountProductCounts[acc.id] || 0;
              return (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-2 bg-[#f2f3ff] px-3 py-2 rounded-xl"
                >
                  <span className="text-xs text-[#131b2e] truncate">
                    <strong>{acc.storeName}</strong> · {count} item(ns)
                  </span>
                  <button
                    type="button"
                    disabled={syncingLocalId === acc.id}
                    onClick={() => void handleSyncLocal(acc.id)}
                    className="h-8 px-3 rounded-lg bg-[#007b71] hover:bg-[#006058] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{syncingLocalId === acc.id ? 'Enviando...' : 'Importar'}</span>
                  </button>
                </div>
              );
            })}
            {syncMessage && (
              <p className="text-xs font-bold text-[#006e2d]">{syncMessage}</p>
            )}
          </div>
        )}
      </div>

      {/* Default Manager PIN Security Reminder */}
      {isManager && isDefaultMgrPin && (
        <div className="p-3.5 rounded-2xl bg-[#fef3c7] border border-[#f59e0b]/40 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldAlert className="w-4 h-4 text-[#b45309] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-[#92400e]">
                PIN inicial de Gerente em uso (1234)
              </p>
              <p className="text-[11px] text-[#92400e]/90 mt-0.5">
                Personalize seu PIN para proteger preços, estoque e equipe.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const mgr = operators.find((o) => o.id === 'op-01');
              if (mgr) openEditOperatorForm(mgr);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#92400e] text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Alterar PIN
          </button>
        </div>
      )}

      {/* Active Profile Switcher (PIN Protected) */}
      <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#2563eb]" />
            <h3 className="text-sm font-extrabold text-[#131b2e]">
              Trocar Perfil no Caixa (PIN)
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-[#434655]">
            {activeOperators.length} ativo(s)
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {activeOperators.map((op) => {
            const isActive = op.id === activeOperator?.id;
            const isMgrOp = op.role === 'manager';
            return (
              <button
                key={op.id}
                type="button"
                disabled={isActive}
                onClick={() => handleStartSwitchOperator(op)}
                className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                  isActive
                    ? 'bg-[#eaedff] border-[#2563eb]'
                    : 'bg-[#f2f3ff] hover:bg-[#eaedff] border-transparent cursor-pointer'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#131b2e] truncate">
                    {op.code} · {op.name}
                  </p>
                  <p className="text-xs text-[#434655] truncate">
                    {isMgrOp
                      ? 'Gerente · Preços, estoque e equipe'
                      : `Operador · ${[
                          op.canConsultPrices ? 'Consulta' : '',
                          op.canAdjustStock ? 'Estoque' : '',
                        ]
                          .filter(Boolean)
                          .join(' + ') || 'Restrito'}`}
                  </p>
                </div>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#004ac6] shrink-0">
                    <Check className="w-4 h-4" />
                    <span>Em uso</span>
                  </span>
                ) : (
                  <span className="text-xs font-bold text-[#004ac6] shrink-0">
                    Entrar com PIN
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pendingOperator && (
          <form
            onSubmit={(e) => void handleConfirmPin(e)}
            className="p-3 rounded-xl bg-[#eaedff] border border-[#2563eb]/30 flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#131b2e]">
                <KeyRound className="w-4 h-4 text-[#004ac6]" />
                <span>
                  PIN de {pendingOperator.code} ({pendingOperator.name})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingOperator(null);
                  setPinError(null);
                }}
                className="text-xs font-semibold text-[#434655] cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            {lockState.isLocked && (
              <div className="p-2 rounded-lg bg-[#ffdad6] text-[#93000a] text-xs font-bold flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 shrink-0" />
                <span>Bloqueado temporariamente: aguarde {lockState.remainingSeconds}s.</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={PIN_MAX_LENGTH}
                autoFocus
                disabled={lockState.isLocked || verifyingPin}
                value={pinInput}
                onChange={(e) => {
                  setPinError(null);
                  setPinInput(sanitizePinInput(e.target.value));
                }}
                placeholder="4 a 6 dígitos"
                className="flex-1 h-10 px-3 rounded-lg bg-white border border-[#cbd5e1] font-mono text-base font-bold tracking-widest text-center text-[#131b2e] outline-none focus:border-[#2563eb] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={lockState.isLocked || verifyingPin || pinInput.length < 4}
                className="h-10 px-4 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-50 text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                {verifyingPin ? 'Validando...' : 'Confirmar'}
              </button>
            </div>
            {pinError && !lockState.isLocked && (
              <p className="text-xs font-bold text-[#ba1a1a]">{pinError}</p>
            )}
          </form>
        )}
      </div>

      {/* Team & PIN Management (STRICTLY Manager Only) */}
      {isManager ? (
        <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#006e2d]" />
              <div>
                <h3 className="text-sm font-extrabold text-[#131b2e]">
                  Gestão de Equipe &amp; PINs
                </h3>
                <p className="text-[11px] text-[#434655]">
                  Exclusivo do Gerente · Sincronizado nesta loja
                </p>
              </div>
            </div>
            {!operatorEditorOpen && (
              <button
                type="button"
                onClick={openCreateOperatorForm}
                className="h-9 px-3 rounded-lg bg-[#006e2d] hover:bg-[#005320] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Operador</span>
              </button>
            )}
          </div>

          {opFeedback && (
            <div className="p-2.5 rounded-xl bg-[#dcfce7] text-[#005320] text-xs font-bold">
              {opFeedback}
            </div>
          )}

          {/* Create / Edit Operator & PIN Form */}
          {operatorEditorOpen && (
            <form
              onSubmit={(e) => void handleSaveOperatorSubmit(e)}
              className="p-3.5 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#131b2e]">
                  {editingOperator
                    ? `Editar ${editingOperator.code} (${editingOperator.name})`
                    : 'Cadastrar Novo Operador'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOperatorEditorOpen(false);
                    setEditingOperator(null);
                    setOpError(null);
                  }}
                  className="text-xs font-semibold text-[#434655] cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={opCode}
                  onChange={(e) => setOpCode(e.target.value)}
                  placeholder="Código (ex: Op. 02)"
                  maxLength={20}
                  className="h-10 px-3 rounded-lg bg-white border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={PIN_MAX_LENGTH}
                  value={opPin}
                  onChange={(e) => setOpPin(sanitizePinInput(e.target.value))}
                  placeholder={
                    editingOperator ? 'Novo PIN (opcional)' : 'PIN (4 a 6 núm.)'
                  }
                  className="h-10 px-3 rounded-lg bg-white border border-[#cbd5e1] font-mono text-xs font-bold text-[#131b2e] outline-none"
                />
              </div>

              <input
                type="text"
                value={opName}
                onChange={(e) => setOpName(e.target.value)}
                placeholder="Nome do funcionário ou gerente"
                maxLength={60}
                className="h-10 px-3 rounded-lg bg-white border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
              />

              {editingOperator?.id !== 'op-01' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpRole('operator')}
                    className={`flex-1 h-9 rounded-lg text-xs font-bold cursor-pointer ${
                      opRole === 'operator'
                        ? 'bg-[#2563eb] text-white'
                        : 'bg-white text-[#434655] border border-[#cbd5e1]'
                    }`}
                  >
                    Operador
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpRole('manager')}
                    className={`flex-1 h-9 rounded-lg text-xs font-bold cursor-pointer ${
                      opRole === 'manager'
                        ? 'bg-[#006e2d] text-white'
                        : 'bg-white text-[#434655] border border-[#cbd5e1]'
                    }`}
                  >
                    Gerente
                  </button>
                </div>
              )}

              {opRole === 'operator' && editingOperator?.id !== 'op-01' && (
                <div className="bg-white rounded-lg p-2.5 border border-[#e2e7ff] flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#434655]">
                    Permissões do Operador
                  </span>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#131b2e] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opCanConsult}
                      onChange={(e) => setOpCanConsult(e.target.checked)}
                      className="w-4 h-4 accent-[#2563eb]"
                    />
                    <span>Consultar preços e bipar produtos</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#131b2e] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opCanAdjustStock}
                      onChange={(e) => setOpCanAdjustStock(e.target.checked)}
                      className="w-4 h-4 accent-[#006e2d]"
                    />
                    <span>Ajustar quantidade em estoque</span>
                  </label>
                </div>
              )}

              {editingOperator &&
                editingOperator.id !== 'op-01' &&
                editingOperator.id !== activeOperator?.id && (
                  <label className="flex items-center gap-2 text-xs font-bold text-[#131b2e] px-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opActive}
                      onChange={(e) => setOpActive(e.target.checked)}
                      className="w-4 h-4 accent-[#006e2d]"
                    />
                    <span>Perfil ativo (pode desbloquear o caixa)</span>
                  </label>
                )}

              {opError && (
                <p className="text-xs font-bold text-[#ba1a1a]">{opError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOperatorEditorOpen(false);
                    setEditingOperator(null);
                    setOpError(null);
                  }}
                  className="flex-1 h-9 rounded-lg bg-white border border-[#cbd5e1] text-xs font-bold text-[#434655] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingOp}
                  className="flex-1 h-9 rounded-lg bg-[#006e2d] hover:bg-[#005320] text-white text-xs font-bold cursor-pointer"
                >
                  {savingOp ? 'Salvando...' : 'Salvar Perfil e PIN'}
                </button>
              </div>
            </form>
          )}

          {/* Full Team Roster */}
          <div className="flex flex-col gap-2">
            {operators.map((op) => {
              const isSelf = op.id === activeOperator?.id;
              const isPrimaryMgr = op.id === 'op-01';
              const confirmDel = confirmDeleteOpId === op.id;

              return (
                <div
                  key={op.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    op.active
                      ? 'bg-[#faf8ff] border-[#e2e7ff]'
                      : 'bg-[#f1f5f9] border-[#cbd5e1] opacity-75'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-extrabold text-[#131b2e] truncate">
                        {op.code} · {op.name}
                      </p>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          op.role === 'manager'
                            ? 'bg-[#dcfce7] text-[#005320]'
                            : 'bg-[#eaedff] text-[#004ac6]'
                        }`}
                      >
                        {op.role === 'manager' ? 'Gerente' : 'Operador'}
                      </span>
                      {!op.active && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ffdad6] text-[#93000a]">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#434655] mt-0.5">
                      {op.role === 'manager'
                        ? 'Acesso total · PIN criptografado'
                        : `Permissões: ${[
                            op.canConsultPrices ? 'Consulta' : '',
                            op.canAdjustStock ? 'Estoque' : '',
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Nenhuma'}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditOperatorForm(op)}
                      title="Editar dados e PIN"
                      className="h-8 px-2.5 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] text-[#004ac6] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>PIN</span>
                    </button>

                    {!isPrimaryMgr && !isSelf && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleToggleOperatorActive(op)}
                          className="h-8 px-2 rounded-lg bg-white border border-[#cbd5e1] hover:bg-[#f2f3ff] text-[11px] font-bold text-[#434655] cursor-pointer"
                        >
                          {op.active ? 'Desativar' : 'Ativar'}
                        </button>
                        {!confirmDel ? (
                          <button
                            type="button"
                            aria-label={`Remover ${op.name}`}
                            onClick={() => setConfirmDeleteOpId(op.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#ba1a1a] hover:bg-[#ffdad6] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteOpId(null);
                              void onDeleteOperator(op.id);
                            }}
                            className="h-8 px-2 rounded-lg bg-[#ba1a1a] text-white text-[11px] font-bold cursor-pointer"
                          >
                            Confirmar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-[#f2f3ff] rounded-2xl border border-[#e2e7ff] p-3.5 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-[#434655] shrink-0 mt-0.5" />
          <p className="text-xs text-[#434655] leading-relaxed">
            <strong>Modo Operador:</strong> A gestão de equipe, edição de PINs e alteração de preços é exclusiva do perfil <strong>Gerente</strong>. Para acessar, entre com o PIN do Gerente acima.
          </p>
        </div>
      )}
    </div>
  );

  const handleSaveGitHubRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    saveGitHubRepoOverride({
      owner: ghOwnerInput,
      repo: ghRepoInput,
      branch: ghBranchInput || 'main',
    });
    setEditingGitHubRepo(false);
    await onCheckUpdates(true);
  };

  const renderUpdatesAndAboutCard = () => {
    const repoCfg = getEffectiveGitHubRepo();
    const repoLabel =
      repoCfg.owner && repoCfg.repo
        ? `${repoCfg.owner}/${repoCfg.repo}`
        : 'Não configurado';

    return (
      <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-4 h-4 text-[#004ac6] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-[#131b2e]">
                Sobre &amp; Atualizações
              </h3>
              <p className="text-[11px] text-[#434655] truncate">
                ProntoPreço v{APP_VERSION} · GitHub: {repoLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={checkingUpdates}
            onClick={() => void onCheckUpdates(true)}
            className="h-9 px-3 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] disabled:opacity-60 text-[#004ac6] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdates ? 'animate-spin' : ''}`} />
            <span>{checkingUpdates ? 'Verificando...' : 'Verificar'}</span>
          </button>
        </div>

        {updateInfo && (
          <div
            className={`p-3 rounded-xl text-xs flex flex-col gap-2 ${
              updateInfo.status === 'update_available'
                ? 'bg-[#eaedff] text-[#131b2e] border border-[#b4c5ff]'
                : updateInfo.status === 'up_to_date'
                  ? 'bg-[#dcfce7] text-[#005320]'
                  : 'bg-[#f2f3ff] text-[#434655]'
            }`}
          >
            <div className="flex items-start gap-2 font-bold">
              {updateInfo.status === 'update_available' && (
                <Sparkles className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" />
              )}
              <span>{updateInfo.message}</span>
            </div>

            {updateInfo.status === 'update_available' && updateInfo.releaseNotes && (
              <p className="text-[11px] text-[#434655] line-clamp-3 whitespace-pre-wrap">
                {updateInfo.releaseNotes}
              </p>
            )}

            {updateInfo.status === 'update_available' && updateInfo.releaseUrl && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {updateInfo.assets?.[0] && (
                  <a
                    href={updateInfo.assets[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar {updateInfo.assets[0].name}</span>
                  </a>
                )}
                <a
                  href={updateInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#f2f3ff] text-[#004ac6] border border-[#cbd5e1] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <span>Abrir Releases no GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {(isManager || syncMode === 'none') && (
          !editingGitHubRepo ? (
            <button
              type="button"
              onClick={() => {
                const curr = getEffectiveGitHubRepo();
                setGhOwnerInput(curr.owner);
                setGhRepoInput(curr.repo);
                setGhBranchInput(curr.branch);
                setEditingGitHubRepo(true);
              }}
              className="self-start text-[11px] font-bold text-[#004ac6] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>
                {repoCfg.owner && repoCfg.repo
                  ? 'Alterar repositório GitHub'
                  : 'Configurar repositório GitHub (owner/repo)'}
              </span>
            </button>
          ) : (
            <form onSubmit={(e) => void handleSaveGitHubRepo(e)} className="flex flex-col gap-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ghOwnerInput}
                  onChange={(e) => setGhOwnerInput(e.target.value)}
                  placeholder="Usuário/Org (owner)"
                  className="h-9 px-2.5 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                />
                <input
                  type="text"
                  value={ghRepoInput}
                  onChange={(e) => setGhRepoInput(e.target.value)}
                  placeholder="Nome do repo"
                  className="h-9 px-2.5 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ghBranchInput}
                  onChange={(e) => setGhBranchInput(e.target.value)}
                  placeholder="Branch (ex: main)"
                  className="w-28 h-9 px-2.5 rounded-lg bg-[#f2f3ff] border border-[#cbd5e1] text-xs font-semibold text-[#131b2e] outline-none"
                />
                <button
                  type="submit"
                  className="flex-1 h-9 rounded-lg bg-[#2563eb] text-white text-xs font-bold cursor-pointer"
                >
                  Salvar e Verificar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGitHubRepo(false)}
                  className="h-9 px-2.5 rounded-lg bg-[#eaedff] text-[#434655] text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )
        )}
      </div>
    );
  };

  const body = (
    <div className="flex flex-col gap-4">
      {isUnverifiedCloudUser
        ? renderEmailVerificationNotice()
        : syncMode === 'none'
          ? renderAuthSelector()
          : renderActiveStorePanel()}
      {renderUpdatesAndAboutCard()}
    </div>
  );

  if (embedded) {
    return (
      <div className="w-full max-w-lg mx-auto px-3 md:px-6 py-6 md:py-10">
        <div className="bg-[#faf8ff] rounded-2xl border border-[#e2e7ff] shadow-sm overflow-hidden">
          <div className="bg-white px-5 py-4 border-b border-[#e2e7ff] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2563eb] text-white flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#131b2e]">
                Acessar Loja no ProntoPreço
              </h1>
              <p className="text-xs text-[#434655]">
                Cada conta possui catálogo e equipe isolados e começa 100% limpa.
              </p>
            </div>
          </div>

          <div className="p-4">{body}</div>

          <div className="px-4 pb-4 grid grid-cols-2 gap-2 text-[11px] text-[#434655]">
            <div className="bg-white border border-[#e2e7ff] rounded-xl p-2.5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#006e2d] shrink-0" />
              <span>Criador inicia como Gerente (PIN)</span>
            </div>
            <div className="bg-white border border-[#e2e7ff] rounded-xl p-2.5 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#004ac6] shrink-0" />
              <span>Operador (PIN) por permissão</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conta da Loja e Equipe"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#131b2e]/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg bg-[#faf8ff] rounded-t-2xl sm:rounded-2xl border border-[#e2e7ff] shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-white px-4 py-3.5 border-b border-[#e2e7ff] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#2563eb]/10 text-[#004ac6] flex items-center justify-center shrink-0">
              {syncMode === 'local' ? (
                <HardDrive className="w-5 h-5 text-[#006058]" />
              ) : (
                <Cloud className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#131b2e] truncate">
                Conta da Loja &amp; Equipe
              </h2>
              <p className="text-xs text-[#434655] truncate">
                {syncMode === 'cloud'
                  ? 'Nuvem sincronizada com cache offline'
                  : syncMode === 'local'
                    ? 'Conta Local Offline (PIN ativo)'
                    : 'Escolha entre Conta Local, E-mail ou Google'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#434655] hover:bg-[#eaedff] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">{body}</div>
      </div>
    </div>
  );
}
