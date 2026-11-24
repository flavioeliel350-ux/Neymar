import React, { useState } from 'react';
import { Download, ExternalLink, Sparkles, X } from 'lucide-react';
import { UpdateCheckResult } from '../types/product';

interface UpdateBannerModalProps {
  updateInfo: UpdateCheckResult | null;
  dismissedVersion: string | null;
  onDismiss: (version: string) => void;
}

export function UpdateBannerModal({
  updateInfo,
  dismissedVersion,
  onDismiss,
}: UpdateBannerModalProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (
    !updateInfo ||
    updateInfo.status !== 'update_available' ||
    !updateInfo.latestVersion ||
    dismissedVersion === updateInfo.latestVersion
  ) {
    return null;
  }

  const primaryDownloadUrl =
    updateInfo.assets?.[0]?.url || updateInfo.releaseUrl || '#';

  return (
    <>
      {/* Discrete non-intrusive top banner */}
      <div className="w-full bg-[#eaedff] border-b border-[#b4c5ff] px-3 md:px-6 py-2">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-[#2563eb] text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <p className="text-xs font-bold text-[#131b2e] truncate">
              Nova versão{' '}
              <span className="text-[#004ac6]">v{updateInfo.latestVersion}</span>{' '}
              disponível{' '}
              <span className="hidden sm:inline font-medium text-[#434655]">
                (atual: v{updateInfo.currentVersion})
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#f2f3ff] text-[#131b2e] text-xs font-bold border border-[#cbd5e1] cursor-pointer"
            >
              Ver Novidades
            </button>
            <a
              href={primaryDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar</span>
            </a>
            <button
              type="button"
              aria-label="Dispensar aviso de atualização"
              onClick={() => onDismiss(updateInfo.latestVersion!)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#434655] hover:bg-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Release Notes & Download Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes da Atualização"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#131b2e]/50 backdrop-blur-xs p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-[#e2e7ff] shadow-xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#eaedff] text-[#004ac6] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-[#131b2e]">
                    Atualização v{updateInfo.latestVersion}
                  </h2>
                  <p className="text-xs text-[#434655]">
                    Versão instalada: v{updateInfo.currentVersion}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#434655] hover:bg-[#f2f3ff] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {updateInfo.releaseTitle && (
              <p className="text-sm font-bold text-[#131b2e]">
                {updateInfo.releaseTitle}
              </p>
            )}

            <div className="rounded-xl bg-[#f2f3ff] p-3 text-xs text-[#434655] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {updateInfo.releaseNotes ||
                'Nova versão publicada no GitHub com melhorias de leitura e desempenho.'}
            </div>

            {updateInfo.assets && updateInfo.assets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#434655]">
                  Arquivos da Release
                </span>
                {updateInfo.assets.map((asset) => (
                  <a
                    key={asset.name}
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] text-xs font-bold text-[#004ac6]"
                  >
                    <span className="truncate">{asset.name}</span>
                    <Download className="w-4 h-4 shrink-0" />
                  </a>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  onDismiss(updateInfo.latestVersion!);
                }}
                className="flex-1 h-10 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] text-xs font-bold text-[#434655] cursor-pointer"
              >
                Lembrar depois
              </button>
              {updateInfo.releaseUrl && (
                <a
                  href={updateInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <span>Abrir no GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
