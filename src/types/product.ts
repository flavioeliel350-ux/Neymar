export type Category = 'Mercearia' | 'Bebidas' | 'Limpeza' | 'Frios' | 'Padaria' | 'Outros';

export const CATEGORIES: Category[] = [
  'Mercearia',
  'Bebidas',
  'Limpeza',
  'Frios',
  'Padaria',
  'Outros',
];

export type UserRole = 'admin' | 'operator';

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
  pin: string;
  active: boolean;
}

export type ScannerMode = 'query' | 'register';

export type AppView = 'home' | 'scanner' | 'details' | 'form' | 'history';
