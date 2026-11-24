import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  InAppUpdateState,
  UpdateCheckResult,
  UpdateDownloadAsset,
} from '../types/product';
import {
  canExecuteNativeInstall,
  formatBytes,
} from '../services/inAppUpdateService';

interface InAppUpdateProgressProps {
  updateInfo: UpdateCheckResult;
  state: InAppUpdateState;
  onStartUpdate: (preferredAsset?: UpdateDownloadAsset) => void;
  onOpenAndroidSettings: () => void;
  onInstallCachedAndroidApk: () => void;
}

export function InAppUpdateProgress({
  updateInfo,
  state,
  onStartUpdate,
  onOpenAndroidSettings,
  onInstallCachedAndroidApk,
}: InAppUpdateProgressProps) {
  const hasNativeAsset = canExecuteNativeInstall(updateInfo.assets);
  const isBusy =
    state.stage === 'downloading' ||
    state.stage === 'installing' ||
    state.stage === 'reloading_web';

  const receivedLabel = formatBytes(state.receivedBytes);
  const totalLabel = formatBytes(state.totalBytes);

  const primaryButtonLabel =
    state.platform === 'android'
      ? hasNativeAsset
        ? `Atualizar no App (v${updateInfo.latestVersion})`
        : 'Atualizar via GitHub'
      : state.platform === 'desktop'
        ? hasNativeAsset
          ? `Baixar e Instalar v${updateInfo.latestVersion}`
          : 'Atualizar via GitHub'
        : `Atualizar App Agora (v${updateInfo.latestVersion})`;

  return (
    <div className="flex flex-col gap-2.5">
      {isBusy && (
        <div className="p-3 rounded-xl bg-white border border-[#b4c5ff] flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#131b2e]">
            <span className="flex items-center gap-1.5 truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563eb] shrink-0" />
              <span className="truncate">
                {state.message || 'Atualizando aplicativo...'}
              </span>
            </span>
            <span className="text-[#004ac6] tabular-nums shrink-0">
              {state.percent}%
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[#eaedff] overflow-hidden">
            <div
              className="h-full bg-[#2563eb] transition-all duration-200"
              style={{ width: `${Math.max(4, state.percent)}%` }}
            />
          </div>

          {(receivedLabel || totalLabel) && (
            <p className="text-[11px] font-medium text-[#434655] tabular-nums">
              {receivedLabel}
              {totalLabel ? ` de ${totalLabel}` : ''} baixados
            </p>
          )}
        </div>
      )}

      {state.stage === 'needs_permission' && (
        <div className="p-3 rounded-xl bg-[#fef3c7] border border-[#f59e0b]/40 flex flex-col gap-2.5">
          <div className="flex items-start gap-2 text-xs font-bold text-[#92400e]">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {state.message ||
                'Autorize o ProntoPreço a instalar atualizações nas configurações do Android.'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenAndroidSettings}
              className="flex-1 min-w-[150px] h-9 px-3 rounded-lg bg-[#92400e] hover:bg-[#78350f] text-white text-xs font-bold cursor-pointer"
            >
              1. Permitir Instalação
            </button>
            <button
              type="button"
              onClick={onInstallCachedAndroidApk}
              className="flex-1 min-w-[150px] h-9 px-3 rounded-lg bg-[#006e2d] hover:bg-[#005320] text-white text-xs font-bold cursor-pointer"
            >
              2. Instalar APK Baixado
            </button>
          </div>
        </div>
      )}

      {state.stage === 'installer_launched' && (
        <div className="p-3 rounded-xl bg-[#dcfce7] border border-[#86efac] flex flex-col gap-2">
          <div className="flex items-start gap-2 text-xs font-bold text-[#005320]">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {state.message ||
                'Instalador aberto. Confirme na tela do sistema para finalizar a atualização.'}
            </span>
          </div>
          {state.platform === 'android' && (
            <button
              type="button"
              onClick={onInstallCachedAndroidApk}
              className="self-start h-8 px-3 rounded-lg bg-[#006e2d] hover:bg-[#005320] text-white text-xs font-bold cursor-pointer"
            >
              Abrir Instalador Novamente
            </button>
          )}
        </div>
      )}

      {state.stage === 'error' && (
        <div className="p-3 rounded-xl bg-[#ffdad6] text-[#93000a] flex flex-col gap-2 text-xs font-bold">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{state.message || 'Falha ao atualizar o aplicativo.'}</span>
          </div>
        </div>
      )}

      {!isBusy && state.stage !== 'needs_permission' && state.stage !== 'installer_launched' && (
        <button
          type="button"
          onClick={() => onStartUpdate()}
          className="w-full h-10 px-4 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all cursor-pointer"
        >
          {state.platform === 'web' ? (
            <RefreshCw className="w-4 h-4" />
          ) : state.stage === 'error' ? (
            <Sparkles className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>
            {state.stage === 'error' ? 'Tentar Atualizar Novamente' : primaryButtonLabel}
          </span>
        </button>
      )}
    </div>
  );
}
