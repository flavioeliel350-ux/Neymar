import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  InAppUpdateStage,
  InAppUpdateState,
  UpdateCheckResult,
  UpdateDownloadAsset,
  UpdatePlatform,
} from '../types/product';

interface DesktopEnvInfo {
  isDesktop?: boolean;
  platform?: string;
  isPortable?: boolean;
  version?: string;
}

interface UpdateProgressPayload {
  stage?: InAppUpdateStage;
  percent?: number;
  receivedBytes?: number;
  totalBytes?: number;
  message?: string;
}

interface ProntoPrecoDesktopBridge {
  isDesktop?: boolean;
  platform?: string;
  getEnv?: () => Promise<DesktopEnvInfo>;
  installUpdate?: (
    url: string,
    fileName: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onUpdateProgress?: (cb: (payload: UpdateProgressPayload) => void) => () => void;
}

interface ProntoPrecoUpdaterCapacitorPlugin {
  canInstallPackages: () => Promise<{ allowed: boolean }>;
  openInstallPermissionSettings: () => Promise<void>;
  installDownloadedApk: () => Promise<void>;
  downloadAndInstallApk: (options: { url: string; fileName: string }) => Promise<void>;
  addListener: (
    eventName: 'updateProgress',
    listenerFunc: (data: UpdateProgressPayload) => void,
  ) => Promise<PluginListenerHandle>;
}

const ProntoPrecoUpdater = registerPlugin<ProntoPrecoUpdaterCapacitorPlugin>(
  'ProntoPrecoUpdater',
);

declare global {
  interface Window {
    prontoPrecoDesktop?: ProntoPrecoDesktopBridge;
  }
}

const VALID_STAGES: ReadonlySet<string> = new Set([
  'idle',
  'downloading',
  'needs_permission',
  'installing',
  'installer_launched',
  'reloading_web',
  'error',
]);

function normalizeStage(raw: unknown): InAppUpdateStage {
  if (typeof raw === 'string' && VALID_STAGES.has(raw)) {
    return raw as InAppUpdateStage;
  }
  return 'downloading';
}

export function detectUpdatePlatform(): UpdatePlatform {
  if (typeof window !== 'undefined' && window.prontoPrecoDesktop?.isDesktop) {
    return 'desktop';
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return 'android';
  }
  return 'web';
}

export function createIdleInAppUpdateState(): InAppUpdateState {
  return {
    stage: 'idle',
    platform: detectUpdatePlatform(),
    percent: 0,
  };
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function selectBestUpdateAsset(
  assets?: UpdateDownloadAsset[],
  preferredAsset?: UpdateDownloadAsset,
): Promise<UpdateDownloadAsset | null> {
  if (preferredAsset) return preferredAsset;
  if (!assets || assets.length === 0) return null;

  const platform = detectUpdatePlatform();

  if (platform === 'android') {
    return assets.find((a) => a.name.toLowerCase().endsWith('.apk')) || null;
  }

  if (platform === 'desktop') {
    const exeAssets = assets.filter((a) => a.name.toLowerCase().endsWith('.exe'));
    if (exeAssets.length === 0) return null;

    let isPortable = false;
    try {
      const env = await window.prontoPrecoDesktop?.getEnv?.();
      isPortable = Boolean(env?.isPortable);
    } catch {
      isPortable = false;
    }

    if (isPortable) {
      return (
        exeAssets.find((a) => {
          const n = a.name.toLowerCase();
          return n.includes('portatil') || n.includes('portable');
        }) || exeAssets[0]
      );
    }

    return (
      exeAssets.find((a) => {
        const n = a.name.toLowerCase();
        return n.includes('instalador') || n.includes('setup');
      }) || exeAssets[0]
    );
  }

  return assets[0] || null;
}

export function canExecuteNativeInstall(assets?: UpdateDownloadAsset[]): boolean {
  const platform = detectUpdatePlatform();
  if (platform === 'android') {
    return Boolean(assets?.some((a) => a.name.toLowerCase().endsWith('.apk')));
  }
  if (platform === 'desktop') {
    return Boolean(assets?.some((a) => a.name.toLowerCase().endsWith('.exe')));
  }
  return true;
}

export function openAndroidInstallSettings(): void {
  if (detectUpdatePlatform() !== 'android') return;
  void ProntoPrecoUpdater.openInstallPermissionSettings();
}

export function retryAndroidInstallDownloadedApk(): void {
  if (detectUpdatePlatform() !== 'android') return;
  void ProntoPrecoUpdater.installDownloadedApk();
}

export function subscribeNativeUpdateEvents(
  onState: (state: InAppUpdateState) => void,
): () => void {
  const platform = detectUpdatePlatform();
  const cleanups: Array<() => void> = [];
  let disposed = false;

  if (platform === 'desktop' && window.prontoPrecoDesktop?.onUpdateProgress) {
    const unsubDesktop = window.prontoPrecoDesktop.onUpdateProgress((payload) => {
      onState({
        stage: normalizeStage(payload.stage),
        platform: 'desktop',
        percent: Math.max(0, Math.min(100, Number(payload.percent) || 0)),
        receivedBytes: payload.receivedBytes,
        totalBytes: payload.totalBytes,
        message: payload.message,
      });
    });
    cleanups.push(unsubDesktop);
  }

  if (platform === 'android') {
    let listenerHandle: PluginListenerHandle | null = null;
    void ProntoPrecoUpdater.addListener('updateProgress', (detail) => {
      if (disposed) return;
      onState({
        stage: normalizeStage(detail.stage),
        platform: 'android',
        percent: Math.max(0, Math.min(100, Number(detail.percent) || 0)),
        receivedBytes: detail.receivedBytes,
        totalBytes: detail.totalBytes,
        message: detail.message,
      });
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    });

    cleanups.push(() => {
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    });
  }

  return () => {
    disposed = true;
    cleanups.forEach((fn) => fn());
  };
}

export async function startInAppUpdate(
  updateInfo: UpdateCheckResult,
  onState: (state: InAppUpdateState) => void,
  preferredAsset?: UpdateDownloadAsset,
): Promise<void> {
  const platform = detectUpdatePlatform();

  if (platform === 'desktop') {
    const asset = await selectBestUpdateAsset(updateInfo.assets, preferredAsset);
    if (!asset || !window.prontoPrecoDesktop?.installUpdate) {
      onState({
        stage: 'error',
        platform,
        percent: 0,
        message:
          'Nenhum instalador .exe anexado a esta release do GitHub. Publique a tag v* para anexar o executável.',
      });
      return;
    }

    onState({
      stage: 'downloading',
      platform,
      percent: 0,
      assetName: asset.name,
      message: `Iniciando download de ${asset.name}...`,
    });

    const res = await window.prontoPrecoDesktop.installUpdate(asset.url, asset.name);
    if (!res?.ok) {
      onState({
        stage: 'error',
        platform,
        percent: 0,
        assetName: asset.name,
        message: res?.message || 'Não foi possível iniciar a atualização no Windows.',
      });
    }
    return;
  }

  if (platform === 'android') {
    const asset = await selectBestUpdateAsset(updateInfo.assets, preferredAsset);
    if (!asset) {
      onState({
        stage: 'error',
        platform,
        percent: 0,
        message:
          'Nenhum arquivo .apk encontrado nesta release do GitHub. Publique a tag v* para anexar o APK automaticamente.',
      });
      return;
    }

    onState({
      stage: 'downloading',
      platform,
      percent: 0,
      assetName: asset.name,
      message: `Baixando ${asset.name} dentro do aplicativo...`,
    });

    try {
      await ProntoPrecoUpdater.downloadAndInstallApk({
        url: asset.url,
        fileName: asset.name,
      });
    } catch {
      onState({
        stage: 'error',
        platform,
        percent: 0,
        assetName: asset.name,
        message: 'Não foi possível iniciar o download da atualização no Android.',
      });
    }
    return;
  }

  // Web / Navegador: limpa cache local de versão / Service Workers / Cache API e recarrega do servidor
  onState({
    stage: 'reloading_web',
    platform: 'web',
    percent: 45,
    message: 'Limpando cache do navegador e recarregando a versão mais recente...',
  });

  try {
    localStorage.removeItem('prontopreco_github_update_cache_v1');
  } catch {
    // Ignore storage errors
  }

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // Ignore cache API errors
  }

  onState({
    stage: 'reloading_web',
    platform: 'web',
    percent: 100,
    message: 'Aplicando atualização na janela atual...',
  });

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_app_update', String(Date.now()));
  window.location.replace(nextUrl.toString());
}
