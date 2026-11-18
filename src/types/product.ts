export type Category = 'Mercearia' | 'Bebidas' | 'Limpeza' | 'Frios' | 'Padaria' | 'Outros';

export const CATEGORIES: Category[] = [
  'Mercearia',
  'Bebidas',
  'Limpeza',
  'Frios',
  'Padaria',
  'Outros',
];

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
  timestamp: string;
}

export type ScannerMode = 'query' | 'register';

export type AppView = 'home' | 'scanner' | 'details' | 'form' | 'history';
