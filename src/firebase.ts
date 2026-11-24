import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  appLogger,
  FIREBASE_CONFIG,
  validateFirebaseClientConfig,
} from './config/appConfig';

validateFirebaseClientConfig(FIREBASE_CONFIG);

const app = initializeApp(FIREBASE_CONFIG);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    FIREBASE_CONFIG.firestoreDatabaseId,
  );
} catch {
  firestoreInstance = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
auth.languageCode = 'pt-BR';

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export interface AuthEnvironmentInfo {
  hostname: string;
  isIframe: boolean;
  isElectron: boolean;
  isCapacitorNative: boolean;
  isRestrictedWebView: boolean;
}

export function detectAuthEnvironment(): AuthEnvironmentInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isIframe =
    typeof window !== 'undefined' && (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
  const isElectron = Boolean((win.prontoPrecoDesktop as { isDesktop?: boolean } | undefined)?.isDesktop);
  const cap = win.Capacitor as { isNativePlatform?: () => boolean } | undefined;
  const isCapacitorNative = Boolean(cap?.isNativePlatform?.());
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isWebViewUa = /\bwv\b|WebView/i.test(ua);

  return {
    hostname,
    isIframe,
    isElectron,
    isCapacitorNative,
    isRestrictedWebView: isCapacitorNative || isWebViewUa,
  };
}

export class AuthFriendlyError extends Error {
  code: string;
  suggestAlternative: boolean;
  domainHint?: string;

  constructor(
    message: string,
    code: string,
    suggestAlternative = false,
    domainHint?: string,
  ) {
    super(message);
    this.name = 'AuthFriendlyError';
    this.code = code;
    this.suggestAlternative = suggestAlternative;
    this.domainHint = domainHint;
  }
}

function extractAuthErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return '';
}

export async function signInWithGoogleSafe(): Promise<User> {
  const env = detectAuthEnvironment();

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = extractAuthErrorCode(err);
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lowerMsg = rawMsg.toLowerCase();
    appLogger.warn('Auth', `Falha no login com Google (${code || 'desconhecido'})`, rawMsg);

    if (
      code === 'auth/unauthorized-domain' ||
      code === 'auth/invalid-action' ||
      lowerMsg.includes('requested action is invalid') ||
      lowerMsg.includes('unauthorized')
    ) {
      throw new AuthFriendlyError(
        `O login com Google não pôde ser concluído neste endereço (${env.hostname || 'ambiente atual'}). Domínios de preview ou WebViews podem bloquear o OAuth do Google. Use "E-mail e Senha" na nuvem ou entre no "Modo Local" offline — ou adicione "${env.hostname}" nos Domínios Autorizados do Firebase.`,
        code || 'auth/invalid-action',
        true,
        env.hostname,
      );
    }

    if (code === 'auth/operation-not-supported-in-this-environment' || env.isRestrictedWebView) {
      throw new AuthFriendlyError(
        'Este aplicativo/WebView bloqueia pop-ups do Google OAuth. Use o login por E-mail e Senha ou crie uma Conta Local offline.',
        code || 'auth/environment-unsupported',
        true,
      );
    }

    if (code === 'auth/popup-blocked') {
      throw new AuthFriendlyError(
        'O navegador bloqueou a janela do Google. Permita pop-ups para este site ou use E-mail e Senha.',
        code,
        true,
      );
    }

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new AuthFriendlyError(
        'A janela de login com Google foi fechada antes de concluir.',
        code,
        false,
      );
    }

    if (code === 'auth/operation-not-allowed') {
      throw new AuthFriendlyError(
        'O provedor Google não está ativado no Firebase Authentication deste projeto.',
        code,
        true,
      );
    }

    throw new AuthFriendlyError(
      'Falha ao autenticar com Google neste ambiente. Você pode entrar usando E-mail e Senha ou o Modo Local offline.',
      code || 'auth/google-error',
      true,
    );
  }
}

export async function signInWithEmailSafe(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (err) {
    const code = extractAuthErrorCode(err);
    appLogger.warn('Auth', `Erro no login por e-mail (${code || 'desconhecido'})`);

    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      throw new AuthFriendlyError('E-mail ou senha incorretos.', code);
    }
    if (code === 'auth/invalid-email') {
      throw new AuthFriendlyError('Formato de e-mail inválido.', code);
    }
    if (code === 'auth/too-many-requests') {
      throw new AuthFriendlyError(
        'Muitas tentativas seguidas. Aguarde alguns minutos ou redefina a senha.',
        code,
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new AuthFriendlyError(
        'O login por E-mail/Senha precisa ser ativado no Firebase Console (Authentication > Sign-in method > Email/Password).',
        code,
      );
    }
    if (code === 'auth/network-request-failed') {
      throw new AuthFriendlyError(
        'Sem conexão com a internet. Use o Modo Local offline para operar o caixa agora.',
        code,
        true,
      );
    }
    throw new AuthFriendlyError('Não foi possível entrar com e-mail e senha.', code);
  }
}

export async function registerWithEmailSafe(
  email: string,
  password: string,
  storeOwnerName: string,
): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const cleanName = storeOwnerName.trim().slice(0, 80);
    if (cleanName) {
      await updateProfile(cred.user, { displayName: cleanName });
    }
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // Verification email can be retried from the verification banner
    }
    return cred.user;
  } catch (err) {
    const code = extractAuthErrorCode(err);
    appLogger.warn('Auth', `Erro ao criar conta por e-mail (${code || 'desconhecido'})`);

    if (code === 'auth/email-already-in-use') {
      throw new AuthFriendlyError('Este e-mail já está cadastrado. Use a aba Entrar.', code);
    }
    if (code === 'auth/weak-password') {
      throw new AuthFriendlyError('A senha deve ter pelo menos 6 caracteres.', code);
    }
    if (code === 'auth/invalid-email') {
      throw new AuthFriendlyError('Informe um e-mail válido.', code);
    }
    if (code === 'auth/operation-not-allowed') {
      throw new AuthFriendlyError(
        'Ative o método "E-mail/Senha" no Firebase Console (Authentication > Sign-in method) para permitir novos cadastros.',
        code,
      );
    }
    if (code === 'auth/network-request-failed') {
      throw new AuthFriendlyError(
        'Sem internet no momento. Crie uma Conta Local offline para usar imediatamente.',
        code,
        true,
      );
    }
    throw new AuthFriendlyError('Não foi possível concluir o cadastro na nuvem.', code);
  }
}

export async function resetPasswordSafe(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    const code = extractAuthErrorCode(err);
    if (code === 'auth/invalid-email') {
      throw new AuthFriendlyError('Informe um e-mail válido para redefinir a senha.', code);
    }
    if (code === 'auth/user-not-found') {
      throw new AuthFriendlyError('Nenhuma conta encontrada com este e-mail.', code);
    }
    throw new AuthFriendlyError('Não foi possível enviar o e-mail de recuperação.', code);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  appLogger.error('Firestore', `Erro em ${operationType} (${path || '-'})`, errInfo);
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      appLogger.warn('Firestore', 'Cliente sem conexão com o servidor; operando em cache offline.');
      return false;
    }
    return true;
  }
}
