export type Category = 'Mercearia' | 'Bebidas' | 'Limpeza' | 'Frios' | 'Padaria' | 'Outros';

export const CATEGORIES: Category[] = [
  'Mercearia',
  'Bebidas',
  'Limpeza',
  'Frios',
  'Padaria',
  'Outros',
];

export type UserRole = 'manager' | 'operator';

export interface Product {
  barcode: string;
  name: string;
  brand: string;
  category: Category;
  price: number;
  wholesalePrice?: number;
  clubPrice?: number;
  marginPercent?: number;
  stock: number;
  location: string;
  weightLabel: string;
  description?: string;
  imageUrl?: string;
  operator: string;
  updatedAt: string;
}

export interface ScanLog {
  id: string;
  barcode: string;
  productName: string;
  price: number;
  action: 'consulta' | 'cadastro' | 'ajuste';
  operator?: string;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  storeId: string;
}

export interface StoreInfo {
  storeId: string;
  name: string;
  ownerId: string;
}

export interface StoreOperator {
  id: string;
  storeId: string;
  ownerId: string;
  name: string;
  code: string;
  role: UserRole;
  pinHash?: string;
  pin?: string;
  canConsultPrices: boolean;
  canAdjustStock: boolean;
  active: boolean;
}

export interface SaveOperatorInput {
  id: string;
  name: string;
  code: string;
  role: UserRole;
  newPin?: string;
  existingPinHash?: string;
  existingLegacyPin?: string;
  canConsultPrices: boolean;
  canAdjustStock: boolean;
  active: boolean;
}

export interface LocalAccount {
  id: string;
  storeName: string;
  createdAt: string;
  operators: StoreOperator[];
}

export interface BarcodeLookupResult {
  barcode: string;
  name: string;
  brand?: string;
  weightLabel?: string;
  category?: Category;
  imageUrl?: string;
  source: 'Open Food Facts' | 'Open Products Facts' | 'Open Beauty Facts';
}

export interface GitHubRepoOverride {
  owner: string;
  repo: string;
  branch: string;
}

export type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'update_available'
  | 'offline'
  | 'not_configured'
  | 'rate_limited'
  | 'unavailable';

export interface UpdateDownloadAsset {
  name: string;
  url: string;
}

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseTitle?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  assets?: UpdateDownloadAsset[];
  checkedAt: string;
  message: string;
  fromCache?: boolean;
}

export type ScannerMode = 'query' | 'register';

export type AppView = 'home' | 'scanner' | 'details' | 'form' | 'history';
