import { Capacitor } from '@capacitor/core';
import { APP_VERSION, appLogger, GITHUB_CONFIG } from '../config/appConfig';
import {
  GitHubRepoOverride,
  UpdateCheckResult,
  UpdateDownloadAsset,
} from '../types/product';

const LS_GITHUB_REPO_KEY = 'prontopreco_github_repo_v1';
const LS_UPDATE_CACHE_KEY = 'prontopreco_github_update_cache_v1';

interface CachedUpdateEnvelope {
  repoKey: string;
  checkedAtMs: number;
  result: UpdateCheckResult;
}

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

/**
 * Aceita "owner", "owner/repo", ou URL completa "https://github.com/owner/repo"
 * e normaliza em { owner, repo }.
 */
export function parseGitHubRepoInput(
  ownerOrUrl: string,
  repoInput = '',
): { owner: string; repo: string } {
  const rawFirst = ownerOrUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const rawSecond = repoInput.trim().replace(/^\/+|\/+$/g, '');

  const ghUrlMatch = rawFirst.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (ghUrlMatch) {
    return {
      owner: ghUrlMatch[1].trim(),
      repo: ghUrlMatch[2].trim(),
    };
  }

  if (rawFirst.includes('/')) {
    const parts = rawFirst.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return {
        owner: parts[0].trim(),
        repo: parts[1].trim(),
      };
    }
  }

  return {
    owner: rawFirst.replace(/^@/, ''),
    repo: rawSecond,
  };
}

export function getEffectiveGitHubRepo(): GitHubRepoOverride {
  try {
    const raw = localStorage.getItem(LS_GITHUB_REPO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GitHubRepoOverride>;
      const normalized = parseGitHubRepoInput(parsed.owner || '', parsed.repo || '');
      const branch = (parsed.branch || '').trim() || GITHUB_CONFIG.branch;
      if (normalized.owner && normalized.repo) {
        return { owner: normalized.owner, repo: normalized.repo, branch };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    owner: GITHUB_CONFIG.owner,
    repo: GITHUB_CONFIG.repo,
    branch: GITHUB_CONFIG.branch,
  };
}

export function saveGitHubRepoOverride(config: GitHubRepoOverride | null): void {
  try {
    if (!config) {
      localStorage.removeItem(LS_GITHUB_REPO_KEY);
      localStorage.removeItem(LS_UPDATE_CACHE_KEY);
      return;
    }
    const parsed = parseGitHubRepoInput(config.owner, config.repo);
    if (!parsed.owner || !parsed.repo) {
      localStorage.removeItem(LS_GITHUB_REPO_KEY);
    } else {
      localStorage.setItem(
        LS_GITHUB_REPO_KEY,
        JSON.stringify({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: config.branch.trim() || 'main',
        }),
      );
    }
    localStorage.removeItem(LS_UPDATE_CACHE_KEY);
  } catch {
    // Ignore storage write errors
  }
}

export function normalizeSemver(raw: string): string {
  const cleaned = raw.trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return cleaned;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

/**
 * Retorna > 0 se `a > b`, 0 se iguais, < 0 se `a < b`.
 */
export function compareSemver(aRaw: string, bRaw: string): number {
  const aParts = normalizeSemver(aRaw).split('.').map((n) => parseInt(n, 10) || 0);
  const bParts = normalizeSemver(bRaw).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length, 3);
  for (let i = 0; i < len; i += 1) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function prioritizePlatformAssets(assets: UpdateDownloadAsset[]): UpdateDownloadAsset[] {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isAndroid = ua.includes('android');
  const isWindows = ua.includes('windows');

  return [...assets].sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (isAndroid) {
      const aApk = an.endsWith('.apk') ? 1 : 0;
      const bApk = bn.endsWith('.apk') ? 1 : 0;
      if (aApk !== bApk) return bApk - aApk;
    }
    if (isWindows) {
      const aExe = an.endsWith('.exe') ? 1 : 0;
      const bExe = bn.endsWith('.exe') ? 1 : 0;
      if (aExe !== bExe) return bExe - aExe;
    }
    return 0;
  });
}

async function fetchWithTimeout(
  url: string,
  accept = 'application/vnd.github+json',
  bypassCache = false,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_CONFIG.requestTimeoutMs);
  const finalUrl = bypassCache
    ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
    : url;

  try {
    return await fetch(finalUrl, {
      method: 'GET',
      signal: controller.signal,
      cache: bypassCache ? 'no-store' : 'default',
      headers: { Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFallbackManifestVersion(
  owner: string,
  repo: string,
  branch: string,
  bypassCache: boolean,
): Promise<{ version: string; releaseUrl: string; notes?: string } | null> {
  const candidates = [
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/public/version.json`,
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/version.json`,
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/package.json`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, 'application/json', bypassCache);
      if (!res.ok) continue;
      const data = (await res.json()) as { version?: string; notes?: string };
      if (data?.version && /\d+\.\d+\.\d+/.test(data.version)) {
        return {
          version: normalizeSemver(data.version),
          releaseUrl: `https://github.com/${owner}/${repo}/releases`,
          notes: typeof data.notes === 'string' ? data.notes : undefined,
        };
      }
    } catch {
      // Try next fallback URL
    }
  }
  return null;
}

function isWebBrowserRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { prontoPrecoDesktop?: { isDesktop?: boolean } };
  if (w.prontoPrecoDesktop?.isDesktop) return false;
  if (Capacitor.isNativePlatform()) return false;
  return true;
}

async function checkWebOriginVersion(): Promise<{ version: string; builtAt?: string } | null> {
  if (!isWebBrowserRuntime()) return null;
  try {
    const res = await fetchWithTimeout('/version.json', 'application/json', true);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string; builtAt?: string };
    if (data?.version && /\d+\.\d+\.\d+/.test(data.version)) {
      return {
        version: normalizeSemver(data.version),
        builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined,
      };
    }
  } catch {
    // Ignore same-origin manifest fetch errors
  }
  return null;
}

function extractReleaseAssets(release: GitHubReleaseResponse): UpdateDownloadAsset[] | undefined {
  if (!Array.isArray(release.assets) || release.assets.length === 0) return undefined;
  const mapped = release.assets
    .filter((a) => a.name && a.browser_download_url)
    .slice(0, 10)
    .map((a) => ({
      name: String(a.name),
      url: String(a.browser_download_url),
    }));
  return mapped.length > 0 ? prioritizePlatformAssets(mapped) : undefined;
}

export async function checkForGitHubUpdate(force = false): Promise<UpdateCheckResult> {
  const nowIso = new Date().toISOString();
  const repoCfg = getEffectiveGitHubRepo();
  const webRuntime = isWebBrowserRuntime();

  // On Web browsers, always check if the hosted server already has a newer /version.json build
  if (webRuntime && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    const webOrigin = await checkWebOriginVersion();
    if (webOrigin && compareSemver(webOrigin.version, APP_VERSION) > 0) {
      return {
        status: 'update_available',
        currentVersion: APP_VERSION,
        latestVersion: webOrigin.version,
        releaseTitle: `Nova atualização Web v${webOrigin.version}`,
        releaseNotes:
          'Uma versão mais recente do ProntoPreço já está disponível neste servidor. Clique em Atualizar para recarregar sem perder seus dados locais.',
        checkedAt: nowIso,
        source: 'web_origin',
        message: `Nova versão v${webOrigin.version} disponível no servidor! (Instalada: v${APP_VERSION})`,
      };
    }

    if (!repoCfg.owner || !repoCfg.repo) {
      if (webOrigin) {
        return {
          status: 'up_to_date',
          currentVersion: APP_VERSION,
          latestVersion: webOrigin.version,
          checkedAt: nowIso,
          source: 'web_origin',
          message: `Você já está na versão web mais recente (v${APP_VERSION}). Vincule um repositório GitHub abaixo para acompanhar pacotes Android/Windows.`,
        };
      }
    }
  }

  if (!repoCfg.owner || !repoCfg.repo) {
    return {
      status: 'not_configured',
      currentVersion: APP_VERSION,
      checkedAt: nowIso,
      message:
        'Repositório GitHub não vinculado ainda. Informe seu usuário/repositório abaixo para verificar e baixar novas versões.',
    };
  }

  const repoKey = `${repoCfg.owner}/${repoCfg.repo}@${repoCfg.branch}`;

  if (!force) {
    try {
      const cachedRaw = localStorage.getItem(LS_UPDATE_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as CachedUpdateEnvelope;
        if (
          cached.repoKey === repoKey &&
          Date.now() - cached.checkedAtMs < GITHUB_CONFIG.autoCheckIntervalMs &&
          cached.result
        ) {
          return { ...cached.result, fromCache: true };
        }
      }
    } catch {
      // Ignore cache parsing errors
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      currentVersion: APP_VERSION,
      checkedAt: nowIso,
      message:
        'Sem conexão com a internet. O aplicativo continua operando normalmente offline.',
    };
  }

  const releasesUrl = `https://api.github.com/repos/${encodeURIComponent(
    repoCfg.owner,
  )}/${encodeURIComponent(repoCfg.repo)}/releases/latest`;

  try {
    const res = await fetchWithTimeout(releasesUrl, 'application/vnd.github+json', force);

    if (res.status === 403 || res.status === 429) {
      appLogger.warn('GitHubUpdate', 'Limite de requisições da API do GitHub atingido.');
      return {
        status: 'rate_limited',
        currentVersion: APP_VERSION,
        releaseUrl: `https://github.com/${repoCfg.owner}/${repoCfg.repo}/releases`,
        checkedAt: nowIso,
        message:
          'Limite temporário de consultas do GitHub atingido. Tente novamente em alguns minutos ou abra a página de releases.',
      };
    }

    let latestVersion: string | undefined;
    let releaseTitle: string | undefined;
    let releaseNotes: string | undefined;
    let releaseUrl = `https://github.com/${repoCfg.owner}/${repoCfg.repo}/releases`;
    let publishedAt: string | undefined;
    let assets: UpdateDownloadAsset[] | undefined;

    if (res.ok) {
      const json = (await res.json()) as GitHubReleaseResponse;
      if (json.tag_name) {
        latestVersion = normalizeSemver(json.tag_name);
        releaseTitle = (json.name || `Versão ${latestVersion}`).trim();
        releaseNotes = (json.body || '').trim().slice(0, 800) || undefined;
        releaseUrl = json.html_url || releaseUrl;
        publishedAt = json.published_at;
        assets = extractReleaseAssets(json);
      }
    }

    // If /releases/latest didn't return anything (e.g. prerelease or tag-only), inspect recent releases
    if (!latestVersion) {
      try {
        const listUrl = `https://api.github.com/repos/${encodeURIComponent(
          repoCfg.owner,
        )}/${encodeURIComponent(repoCfg.repo)}/releases?per_page=3`;
        const listRes = await fetchWithTimeout(listUrl, 'application/vnd.github+json', force);
        if (listRes.ok) {
          const listJson = (await listRes.json()) as GitHubReleaseResponse[];
          const candidate = Array.isArray(listJson)
            ? listJson.find((r) => Boolean(r.tag_name))
            : undefined;
          if (candidate?.tag_name) {
            latestVersion = normalizeSemver(candidate.tag_name);
            releaseTitle = (candidate.name || `Versão ${latestVersion}`).trim();
            releaseNotes = (candidate.body || '').trim().slice(0, 800) || undefined;
            releaseUrl = candidate.html_url || releaseUrl;
            publishedAt = candidate.published_at;
            assets = extractReleaseAssets(candidate);
          }
        }
      } catch {
        // Ignore list fallback error
      }
    }

    if (!latestVersion) {
      const fallback = await fetchFallbackManifestVersion(
        repoCfg.owner,
        repoCfg.repo,
        repoCfg.branch,
        force,
      );
      if (fallback) {
        latestVersion = fallback.version;
        releaseUrl = fallback.releaseUrl;
        releaseNotes = fallback.notes;
        releaseTitle = `Versão ${fallback.version}`;
      }
    }

    if (!latestVersion) {
      return {
        status: 'unavailable',
        currentVersion: APP_VERSION,
        releaseUrl,
        checkedAt: nowIso,
        message:
          'Não foi possível localizar releases ou version.json público em ' +
          `${repoCfg.owner}/${repoCfg.repo} (branch ${repoCfg.branch}). Verifique se o repositório é público.`,
      };
    }

    const hasUpdate = compareSemver(latestVersion, APP_VERSION) > 0;
    const result: UpdateCheckResult = hasUpdate
      ? {
          status: 'update_available',
          currentVersion: APP_VERSION,
          latestVersion,
          releaseTitle,
          releaseNotes,
          releaseUrl,
          publishedAt,
          assets,
          checkedAt: nowIso,
          source: 'github',
          message: `Nova versão v${latestVersion} disponível no GitHub! (Instalada: v${APP_VERSION})`,
        }
      : {
          status: 'up_to_date',
          currentVersion: APP_VERSION,
          latestVersion,
          releaseUrl,
          checkedAt: nowIso,
          source: 'github',
          message: `Você já está na versão mais recente (v${APP_VERSION}).`,
        };

    try {
      const cachePayload: CachedUpdateEnvelope = {
        repoKey,
        checkedAtMs: Date.now(),
        result,
      };
      localStorage.setItem(LS_UPDATE_CACHE_KEY, JSON.stringify(cachePayload));
    } catch {
      // Ignore cache quota errors
    }

    return result;
  } catch (err) {
    appLogger.warn('GitHubUpdate', 'Falha de rede ao consultar atualizações no GitHub', err);
    return {
      status: 'unavailable',
      currentVersion: APP_VERSION,
      releaseUrl: `https://github.com/${repoCfg.owner}/${repoCfg.repo}/releases`,
      checkedAt: nowIso,
      message:
        'Não foi possível verificar atualizações agora. Você pode continuar usando o app normalmente.',
    };
  }
}
