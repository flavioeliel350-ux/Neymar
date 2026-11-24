import rawFirebaseConfig from '../../firebase-applet-config.json';
import packageJson from '../../package.json';

/**
 * ============================================================================
 * Configuração Centralizada do ProntoPreço
 * ============================================================================
 * Centraliza versão da aplicação, repositório GitHub para verificação de
 * atualizações, parâmetros de leitura de código de barras e credenciais
 * públicas do cliente Firebase (Auth + Firestore).
 */

export const APP_VERSION = String(packageJson.version || '1.0.0').trim();

export interface GitHubConfig {
  /** Usuário ou organização dona do repositório no GitHub (ex: "minha-loja") */
  owner: string;
  /** Nome do repositório no GitHub (ex: "prontopreco") */
  repo: string;
  /** Branch padrão usada para fallback de leitura de package.json / version.json */
  branch: string;
  /** Intervalo mínimo entre checagens automáticas em segundo plano (6 horas) */
  autoCheckIntervalMs: number;
  /** Timeout das requisições à API do GitHub */
  requestTimeoutMs: number;
}

const env = (typeof import.meta !== 'undefined' && import.meta.env)
  ? (import.meta.env as Record<string, string | undefined>)
  : {};

const envRepoFull = (env.VITE_GITHUB_REPOSITORY || '').trim();
const [envFullOwner = '', envFullRepo = ''] = envRepoFull.includes('/')
  ? envRepoFull.split('/', 2)
  : ['', ''];

export const GITHUB_CONFIG: GitHubConfig = {
  owner: (env.VITE_GITHUB_OWNER || envFullOwner || '').trim(),
  repo: (env.VITE_GITHUB_REPO || envFullRepo || '').trim(),
  branch: (env.VITE_GITHUB_BRANCH || 'main').trim() || 'main',
  autoCheckIntervalMs: 6 * 60 * 60 * 1000,
  requestTimeoutMs: 6500,
};

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export const FIREBASE_CONFIG: FirebaseClientConfig = {
  projectId: rawFirebaseConfig.projectId,
  appId: rawFirebaseConfig.appId,
  apiKey: rawFirebaseConfig.apiKey,
  authDomain: rawFirebaseConfig.authDomain,
  firestoreDatabaseId: rawFirebaseConfig.firestoreDatabaseId,
  storageBucket: rawFirebaseConfig.storageBucket,
  messagingSenderId: rawFirebaseConfig.messagingSenderId,
};

export function validateFirebaseClientConfig(cfg: FirebaseClientConfig): void {
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.firestoreDatabaseId) {
    throw new Error(
      'Configuração do Firebase incompleta. Verifique o arquivo firebase-applet-config.json.',
    );
  }
}

export const BARCODE_CONFIG = {
  /** Pausa mínima entre bips repetidos do mesmo código na câmera (evita duplicação no mesmo ms) */
  scanCooldownMs: 2200,
  /** Pausa visual breve após qualquer leitura bem-sucedida antes de aceitar o próximo código */
  postScanBriefPauseMs: 1200,
  /** Intervalo máximo entre teclas (ms) para reconhecer leitor USB/Bluetooth (HID) */
  hidMaxKeyIntervalMs: 75,
  /** Tamanho mínimo de código aceito por leitor HID */
  hidMinLength: 6,
  /** Timeout para consultas externas (Open Food Facts / Open Products Facts) */
  lookupTimeoutMs: 4500,
} as const;

export const appLogger = {
  info(scope: string, message: string, detail?: unknown) {
    if (detail !== undefined) {
      console.info(`[ProntoPreço:${scope}] ${message}`, detail);
    } else {
      console.info(`[ProntoPreço:${scope}] ${message}`);
    }
  },
  warn(scope: string, message: string, detail?: unknown) {
    if (detail !== undefined) {
      console.warn(`[ProntoPreço:${scope}] ${message}`, detail);
    } else {
      console.warn(`[ProntoPreço:${scope}] ${message}`);
    }
  },
  error(scope: string, message: string, detail?: unknown) {
    if (detail !== undefined) {
      console.error(`[ProntoPreço:${scope}] ${message}`, detail);
    } else {
      console.error(`[ProntoPreço:${scope}] ${message}`);
    }
  },
};
