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

export function getEffectiveGitHubRepo(): GitHubRepoOverride {
  try {
    const raw = localStorage.getItem(LS_GITHUB_REPO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GitHubRepoOverride>;
      const owner = (parsed.owner || '').trim();
      const repo = (parsed.repo || '').trim();
      const branch = (parsed.branch || '').trim() || GITHUB_CONFIG.branch;
      if (owner && repo) {
        return { owner, repo, branch };
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
    if (!config || !config.owner.trim() || !config.repo.trim()) {
      localStorage.removeItem(LS_GITHUB_REPO_KEY);
    } else {
      localStorage.setItem(
        LS_GITHUB_REPO_KEY,
        JSON.stringify({
          owner: config.owner.trim(),
          repo: config.repo.trim(),
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

async function fetchWithTimeout(url: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_CONFIG.requestTimeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
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
): Promise<{ version: string; releaseUrl: string; notes?: string } | null> {
  const candidates = [
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/version.json`,
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/package.json`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, 'application/json');
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

export async function checkForGitHubUpdate(force = false): Promise<UpdateCheckResult> {
  const nowIso = new Date().toISOString();
  const repoCfg = getEffectiveGitHubRepo();

  if (!repoCfg.owner || !repoCfg.repo) {
    return {
      status: 'not_configured',
      currentVersion: APP_VERSION,
      checkedAt: nowIso,
      message:
        'Repositório GitHub não configurado. Informe usuário/repositório nas configurações para ativar a verificação.',
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
    const res = await fetchWithTimeout(releasesUrl);

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
        if (Array.isArray(json.assets)) {
          assets = json.assets
            .filter((a) => a.name && a.browser_download_url)
            .slice(0, 4)
            .map((a) => ({
              name: String(a.name),
              url: String(a.browser_download_url),
            }));
        }
      }
    }

    if (!latestVersion) {
      const fallback = await fetchFallbackManifestVersion(
        repoCfg.owner,
        repoCfg.repo,
        repoCfg.branch,
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
          'Não foi possível localizar releases públicas para este repositório (verifique se ele é público ou se há versão publicada).',
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
          message: `Nova versão v${latestVersion} disponível no GitHub!`,
        }
      : {
          status: 'up_to_date',
          currentVersion: APP_VERSION,
          latestVersion,
          releaseUrl,
          checkedAt: nowIso,
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
