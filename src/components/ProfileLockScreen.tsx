import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Delete,
  HardDrive,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Store,
  Timer,
  UserCheck,
} from 'lucide-react';
import { StoreOperator } from '../types/product';
import { playBeep, triggerHaptic } from '../utils/feedback';
import {
  clearPinAttempts,
  getPinLockState,
  isValidPinFormat,
  PIN_MAX_LENGTH,
  recordFailedPinAttempt,
  sanitizePinInput,
  verifyPin,
} from '../utils/pinSecurity';

interface ProfileLockScreenProps {
  storeId: string;
  storeName: string;
  syncMode: 'cloud' | 'local';
  accountLabel?: string;
  operators: StoreOperator[];
  onUnlockOperator: (operator: StoreOperator) => void;
  onSwitchStoreAccount: () => Promise<void> | void;
}

export function ProfileLockScreen({
  storeId,
  storeName,
  syncMode,
  accountLabel,
  operators,
  onUnlockOperator,
  onSwitchStoreAccount,
}: ProfileLockScreenProps) {
  const activeOperators = useMemo(
    () => operators.filter((op) => op.active),
    [operators],
  );

  const [selectedId, setSelectedId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [lockState, setLockState] = useState(() => getPinLockState(storeId));

  // Keep selected profile aligned cleanly without ever auto-unlocking
  useEffect(() => {
    if (activeOperators.length === 0) {
      setSelectedId('');
      return;
    }
    setSelectedId((prev) =>
      prev && activeOperators.some((o) => o.id === prev)
        ? prev
        : activeOperators[0].id,
    );
  }, [activeOperators]);

  // Refresh countdown ticker every second while locked
  useEffect(() => {
    setLockState(getPinLockState(storeId));
    const timer = setInterval(() => {
      const next = getPinLockState(storeId);
      setLockState(next);
    }, 500);
    return () => clearInterval(timer);
  }, [storeId]);

  const selectedOperator = useMemo(
    () => activeOperators.find((op) => op.id === selectedId) || null,
    [activeOperators, selectedId],
  );

  const handleDigit = (digit: string) => {
    if (lockState.isLocked || verifying) return;
    setError(null);
    setPin((prev) => (prev.length < PIN_MAX_LENGTH ? prev + digit : prev));
    triggerHaptic(15);
  };

  const handleBackspace = () => {
    if (lockState.isLocked || verifying) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedOperator || verifying) return;

    const currentLock = getPinLockState(storeId);
    setLockState(currentLock);
    if (currentLock.isLocked) {
      setError(`Acesso bloqueado temporariamente. Aguarde ${currentLock.remainingSeconds}s.`);
      return;
    }

    if (!isValidPinFormat(pin)) {
      setError('Digite o PIN de 4 a 6 números.');
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const ok = await verifyPin(storeId, selectedOperator, pin);
      if (!ok) {
        const nextLock = recordFailedPinAttempt(storeId);
        setLockState(nextLock);
        setPin('');
        playBeep('error');
        triggerHaptic(50);

        if (nextLock.isLocked) {
          setError(
            `Muitas tentativas incorretas. Caixa bloqueado por ${nextLock.remainingSeconds}s.`,
          );
        } else {
          const remainingBeforeCooldown = Math.max(0, 3 - nextLock.failedAttempts);
          setError(
            remainingBeforeCooldown > 0
              ? `PIN incorreto para ${selectedOperator.name}. Restam ${remainingBeforeCooldown} tentativa(s) antes do bloqueio temporário.`
              : 'PIN incorreto. Tente novamente.',
          );
        }
        return;
      }

      clearPinAttempts(storeId);
      setPin('');
      playBeep('success');
      triggerHaptic(30);
      onUnlockOperator(selectedOperator);
    } finally {
      setVerifying(false);
    }
  };

  const getOperatorRoleSummary = (op: StoreOperator) => {
    if (op.role === 'manager') {
      return 'Gerente · Acesso total';
    }
    const caps: string[] = [];
    if (op.canConsultPrices) caps.push('Consulta preços');
    if (op.canAdjustStock) caps.push('Ajusta estoque');
    if (op.canManageProducts) caps.push('Cadastra/edita produtos');
    return caps.length > 0 ? `Operador · ${caps.join(' + ')}` : 'Operador · Somente leitura';
  };

  return (
    <div className="w-full max-w-lg mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="bg-[#faf8ff] rounded-2xl border border-[#e2e7ff] shadow-sm overflow-hidden">
        {/* Store Header */}
        <div className="bg-white px-5 py-4 border-b border-[#e2e7ff] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#2563eb] text-white flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {syncMode === 'cloud' ? (
                  <Cloud className="w-3.5 h-3.5 text-[#006e2d] shrink-0" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5 text-[#006058] shrink-0" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#004ac6] truncate">
                  {syncMode === 'cloud' ? 'Loja na Nuvem' : 'Loja Local Offline'}
                </span>
              </div>
              <h1 className="text-base font-extrabold text-[#131b2e] truncate">
                {storeName}
              </h1>
              {accountLabel && (
                <p className="text-[11px] text-[#434655] truncate">{accountLabel}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSwitchStoreAccount()}
            className="h-9 px-3 rounded-lg border border-[#cbd5e1] hover:bg-[#ffdad6] hover:border-[#ffdad6] hover:text-[#93000a] text-xs font-bold text-[#434655] flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Loja</span>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Instruction Banner */}
          <div className="p-3 rounded-xl bg-[#eaedff] border border-[#b4c5ff]/60 flex items-start gap-2.5">
            <Store className="w-4 h-4 text-[#004ac6] shrink-0 mt-0.5" />
            <p className="text-xs text-[#131b2e] leading-relaxed">
              <strong>Seleção de Perfil Obrigatória:</strong> Escolha quem vai operar este caixa e digite o PIN pessoal para liberar o acesso.
            </p>
          </div>

          {/* Profile List */}
          {activeOperators.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Nenhum perfil ativo encontrado nesta loja. Entre com outra conta ou contate o gerente.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#434655] px-0.5">
                Quem está entrando neste dispositivo?
              </span>
              <div className="grid grid-cols-1 gap-2">
                {activeOperators.map((op) => {
                  const selected = op.id === selectedOperator?.id;
                  const isMgr = op.role === 'manager';
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(op.id);
                        setPin('');
                        setError(null);
                        triggerHaptic(15);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'bg-white border-[#2563eb] ring-2 ring-[#2563eb]/15 shadow-xs'
                          : 'bg-white/70 border-[#e2e7ff] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            isMgr
                              ? 'bg-[#dcfce7] text-[#006e2d]'
                              : 'bg-[#eaedff] text-[#004ac6]'
                          }`}
                        >
                          {isMgr ? (
                            <ShieldCheck className="w-5 h-5" />
                          ) : (
                            <UserCheck className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-[#131b2e] truncate">
                            {op.code} · {op.name}
                          </p>
                          <p className="text-xs text-[#434655] truncate">
                            {getOperatorRoleSummary(op)}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                          selected
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-[#f2f3ff] text-[#434655]'
                        }`}
                      >
                        {selected ? 'Selecionado' : 'Selecionar'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PIN Entry Form + Numeric Keypad */}
          {selectedOperator && (
            <form
              onSubmit={(e) => void handleUnlock(e)}
              className="bg-white rounded-2xl border border-[#e2e7ff] p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#131b2e]">
                  <KeyRound className="w-4 h-4 text-[#004ac6]" />
                  <span>PIN de {selectedOperator.name}</span>
                </div>
                <span className="text-[11px] font-semibold text-[#434655]">
                  4 a 6 dígitos
                </span>
              </div>

              {lockState.isLocked && (
                <div className="p-3 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold flex items-center gap-2">
                  <Timer className="w-4 h-4 shrink-0" />
                  <span>
                    Bloqueado por segurança. Tente novamente em {lockState.remainingSeconds}s.
                  </span>
                </div>
              )}

              {error && !lockState.isLocked && (
                <div className="p-2.5 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold">
                  {error}
                </div>
              )}

              <input
                type="password"
                inputMode="numeric"
                autoFocus
                maxLength={PIN_MAX_LENGTH}
                disabled={lockState.isLocked || verifying}
                value={pin}
                onChange={(e) => {
                  setError(null);
                  setPin(sanitizePinInput(e.target.value));
                }}
                placeholder="••••"
                aria-label="Digite o PIN do perfil"
                className="w-full h-12 px-4 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] focus:border-[#2563eb] focus:bg-white font-mono text-2xl font-black tracking-[0.4em] text-center text-[#131b2e] outline-none disabled:opacity-60"
              />

              {/* Ergonomic POS Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={lockState.isLocked || verifying}
                    onClick={() => handleDigit(digit)}
                    className="h-11 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 text-base font-extrabold text-[#131b2e] transition-all cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={lockState.isLocked || verifying || pin.length === 0}
                  onClick={() => {
                    setPin('');
                    setError(null);
                  }}
                  className="h-11 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 text-xs font-bold text-[#434655] cursor-pointer"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={lockState.isLocked || verifying}
                  onClick={() => handleDigit('0')}
                  className="h-11 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 text-base font-extrabold text-[#131b2e] transition-all cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={lockState.isLocked || verifying || pin.length === 0}
                  onClick={handleBackspace}
                  aria-label="Apagar dígito"
                  className="h-11 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 flex items-center justify-center text-[#434655] cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              <button
                type="submit"
                disabled={lockState.isLocked || verifying || pin.length < 4}
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {verifying
                    ? 'Validando PIN...'
                    : `Desbloquear como ${selectedOperator.name}`}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
