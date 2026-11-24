import React, { useMemo, useState } from 'react';
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
  ExternalLink,
  GitBranch,
  HardDrive,
  Info,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
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
  StoreInfo,
  StoreOperator,
  UpdateCheckResult,
  UserRole,
} from '../types/product';
import { triggerHaptic } from '../utils/feedback';

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
  ) => void;
  onExitLocalAccount: () => void;
  onSelectOperator: (operator: StoreOperator) => void;
  onSaveOperator: (op: Omit<StoreOperator, 'storeId' | 'ownerId'>) => Promise<void>;
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
  const [localManagerPin, setLocalManagerPin] = useState('1234');

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [suggestAltOnGoogleErr, setSuggestAltOnGoogleErr] = useState(false);

  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  const [pendingOperator, setPendingOperator] = useState<StoreOperator | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [editingStoreName, setEditingStoreName] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState('');
  const [savingStore, setSavingStore] = useState(false);

  const [syncingLocalId, setSyncingLocalId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [showAddOperator, setShowAddOperator] = useState(false);
  const [newOpName, setNewOpName] = useState('');
  const [newOpCode, setNewOpCode] = useState('');
  const [newOpRole, setNewOpRole] = useState<UserRole>('operator');
  const [newOpPin, setNewOpPin] = useState('');
  const [opError, setOpError] = useState<string | null>(null);
  const [savingOp, setSavingOp] = useState(false);

  const initialRepo = useMemo(() => getEffectiveGitHubRepo(), []);
  const [editingGitHubRepo, setEditingGitHubRepo] = useState(false);
  const [ghOwnerInput, setGhOwnerInput] = useState(initialRepo.owner);
  const [ghRepoInput, setGhRepoInput] = useState(initialRepo.repo);
  const [ghBranchInput, setGhBranchInput] = useState(initialRepo.branch);

  const envInfo = useMemo(() => detectAuthEnvironment(), []);
  const isManager = activeOperator?.role === 'admin';
  const isUnverifiedCloudUser = Boolean(authUser && !authUser.emailVerified);

  const hasDefaultPins = useMemo(
    () =>
      operators.some(
        (op) =>
          (op.id === 'op-01' && op.pin === '1234') ||
          (op.id === 'op-02' && op.pin === '0000'),
      ),
    [operators],
  );

  const localAccountsWithItems = useMemo(
    () => localAccounts.filter((acc) => (localAccountProductCounts[acc.id] || 0) > 0),
    [localAccounts, localAccountProductCounts],
  );

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

  const handleCreateLocal = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const name = localStoreName.trim();
    if (!name) {
      setAuthError('Informe o nome da sua loja local.');
      return;
    }
    if (!/^\d{4}$/.test(localManagerPin)) {
      setAuthError('O PIN do Gerente deve ter exatamente 4 números.');
      return;
    }
    triggerHaptic(30);
    onCreateLocalAccount(name, localManagerName.trim() || 'Gerente', localManagerPin);
    setLocalStoreName('');
    if (!embedded) onClose();
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

  const handleSyncLocal = async (localId: string) => {
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

  const renderAuthSelector = () => (
    <div className="flex flex-col gap-3">
      {/* Method Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#eaedff]">
        <button
          type="button"
          onClick={() => {
            setAuthTab('local');
            setAuthError(null);
            setAuthNotice(null);
          }}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
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
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
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
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
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
                className="px-3 py-1.5 rounded-lg bg-white text-[#131b2e] text-xs font-bold"
              >
                Usar E-mail e Senha
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('local');
                  setAuthError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#007b71] text-white text-xs font-bold"
              >
                Usar Conta Local
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: Local Account (Offline / No Cloud) */}
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
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors ${
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
                        {count} produto(s) · {acc.operators.length} operador(es)
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
            onSubmit={handleCreateLocal}
            className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3"
          >
            <div>
              <h3 className="text-sm font-extrabold text-[#131b2e]">
                Criar Nova Conta Local (100% Offline)
              </h3>
              <p className="text-xs text-[#434655] mt-0.5">
                Não exige internet nem login externo. Começa com catálogo vazio e mantém a separação Gerente (PIN) e Operador (PIN).
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
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={localManagerPin}
                onChange={(e) =>
                  setLocalManagerPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="PIN Gerente (4 núm.)"
                className="h-10 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] font-mono text-xs font-bold text-[#131b2e] outline-none focus:border-[#2563eb]"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#007b71] hover:bg-[#006058] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
            >
              <HardDrive className="w-4 h-4" />
              <span>Criar e Abrir Loja Local</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: Email & Password (Cloud) */}
      {authTab === 'email' && (
        <form
          onSubmit={handleEmailSubmit}
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
                  className="text-[#004ac6] hover:underline"
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
                  className="text-[#004ac6] hover:underline"
                >
                  Criar conta
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-[#434655]">
            Cada conta mantém seus próprios produtos e preços isolados e sincronizados entre celulares e PCs da mesma loja.
          </p>

          {emailMode === 'register' && (
            <input
              type="text"
              value={ownerNameInput}
              onChange={(e) => setOwnerNameInput(e.target.value)}
              placeholder="Nome da Loja ou Responsável"
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
            className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
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
              className="text-xs font-semibold text-[#434655] hover:text-[#004ac6] self-end"
            >
              Esqueci minha senha
            </button>
          )}
        </form>
      )}

      {/* TAB 3: Google OAuth (Cloud) */}
      {authTab === 'google' && (
        <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#131b2e]">
              Entrar na Nuvem com Google
            </h3>
            <p className="text-xs text-[#434655] mt-1 leading-relaxed">
              Sincronize seu catálogo entre todos os dispositivos da loja com backup automático e cache offline no Firestore.
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
            onClick={handleGoogleLogin}
            className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
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
          onClick={handleCheckEmailVerified}
          className="w-full h-11 rounded-xl bg-[#006e2d] hover:bg-[#005320] disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${verifyingEmail ? 'animate-spin' : ''}`} />
          <span>{verifyingEmail ? 'Verificando...' : 'Já confirmei meu e-mail'}</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={resendCooldown}
            onClick={handleResendVerification}
            className="h-10 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] disabled:opacity-50 text-[#131b2e] text-xs font-bold"
          >
            {resendCooldown ? 'Aguarde...' : 'Reenviar E-mail'}
          </button>
          <button
            type="button"
            onClick={onSignOutCloud}
            className="h-10 rounded-xl border border-[#cbd5e1] hover:bg-[#f2f3ff] text-[#434655] text-xs font-bold"
          >
            Trocar / Usar Local
          </button>
        </div>
      </div>
    </div>
  );

  const renderActiveStorePanel = () => (
    <div className="flex flex-col gap-4">
      {/* Store Summary & Logout */}
      <div className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
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
                {syncMode === 'cloud'
                  ? authUser?.displayName || 'Conta Nuvem'
                  : activeLocalAccount?.storeName || 'Conta Local'}
              </p>
              <p className="text-xs text-[#434655] truncate">
                {syncMode === 'cloud'
                  ? authUser?.email
                  : 'Armazenamento Offline neste Aparelho'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (syncMode === 'cloud') {
                await onSignOutCloud();
              } else {
                onExitLocalAccount();
              }
            }}
            className="h-9 px-3 rounded-lg border border-[#cbd5e1] hover:bg-[#ffdad6] hover:border-[#ffdad6] hover:text-[#93000a] text-xs font-bold text-[#434655] flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Trocar Conta</span>
          </button>
        </div>

        {/* Store Name */}
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

        {/* Optional Import from Local Store -> Cloud */}
        {syncMode === 'cloud' && localAccountsWithItems.length > 0 && (
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
                    onClick={() => handleSyncLocal(acc.id)}
                    className="h-8 px-3 rounded-lg bg-[#007b71] hover:bg-[#006058] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
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

      {/* Counter Operator PIN Switcher */}
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
              PINs: Gerente / 0000
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

        {/* Inline PIN Prompt */}
        {pendingOperator && (
          <form
            onSubmit={handleConfirmPin}
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

        {!editingGitHubRepo ? (
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
          <form onSubmit={handleSaveGitHubRepo} className="flex flex-col gap-2 pt-1">
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
                Cada conta possui catálogo isolado e começa 100% limpa.
              </p>
            </div>
          </div>

          <div className="p-4">{body}</div>

          <div className="px-4 pb-4 grid grid-cols-2 gap-2 text-[11px] text-[#434655]">
            <div className="bg-white border border-[#e2e7ff] rounded-xl p-2.5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#006e2d] shrink-0" />
              <span>Gerente (PIN) altera preços</span>
            </div>
            <div className="bg-white border border-[#e2e7ff] rounded-xl p-2.5 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#004ac6] shrink-0" />
              <span>Operador (PIN) consulta e ajusta estoque</span>
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
      aria-label="Conta da Loja e Operadores"
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
                Conta da Loja &amp; Operadores
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
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#434655] hover:bg-[#eaedff]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">{body}</div>
      </div>
    </div>
  );
}
