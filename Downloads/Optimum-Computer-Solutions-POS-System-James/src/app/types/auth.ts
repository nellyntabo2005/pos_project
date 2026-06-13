export type UserRole = 'super_admin' | 'admin' | 'manager' | 'accountant' | 'storekeeper' | 'inventory_clerk' | 'cashier' | 'viewer' | 'customer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin?: Date;
}

export interface CashDrawer {
  id: string;
  cashierId: string;
  date: string;
  openingBalance: number;
  closingBalance: number;
  transactions: number;
  status: 'open' | 'closed';
  createdAt: Date;
  closedAt?: Date;
}

export interface DailyBalance {
  date: string;
  openingBalance: number;
  closingBalance: number;
  totalSales: number;
  totalExpenses: number;
  difference: number;
}

export type UnitOfMeasurement = 'pcs' | 'kg' | 'liter' | 'meter' | 'dozen' | 'box' | 'pack' | 'carton';
export type PricingTier = 'retail' | 'wholesale' | 'corporate' | 'loyal';
export type PaymentMethod = 'cash' | 'card' | 'mpesa' | 'check' | 'bank_transfer';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  buyingPrice: number;
  prices: {
    retail: number;
    wholesale: number;
    corporate: number;
    loyal: number;
  };
  profitMargin: number; // percentage
  uom: UnitOfMeasurement;
  stock: number;
  reorderLevel: number;
  image: string;
  tax: number; // percentage
}

export interface PaymentTransaction {
  method: PaymentMethod;
  amount: number;
  timestamp: Date;
  reference?: string;
}

export interface TaxConfiguration {
  id: string;
  name: string;
  percentage: number;
  description: string;
  active: boolean;
}

export interface PosConfiguration {
  id: string;
  level: 'basic' | 'standard' | 'advanced' | 'enterprise';
  features: {
    multiPayment: boolean;
    advancedReporting: boolean;
    inventoryTracking: boolean;
    customerManagement: boolean;
    discountManagement: boolean;
    multipleStores: boolean;
    advancedAnalytics: boolean;
  };
  maxCashiers: number;
  maxUsers: number;
}

export interface CartItem extends Product {
  quantity: number;
  selectedPrice: PricingTier;
  itemTotal: number;
  itemTax: number;
}

export interface SaleTransaction {
  id: string;
  date: Date;
  cashierId: string;
  items: CartItem[];
  subtotal: number;
  totalTax: number;
  discount: number;
  total: number;
  payments: PaymentTransaction[];
  change: number;
  status: 'completed' | 'pending' | 'cancelled';
}

