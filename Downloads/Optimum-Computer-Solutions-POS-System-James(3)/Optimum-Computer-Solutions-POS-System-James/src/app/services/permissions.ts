import type { UserRole } from '../types/auth';

export type AppModuleId =
  | 'dashboard'
  | 'pos'
  | 'invoices'
  | 'customers'
  | 'products'
  | 'procurement'
  | 'inventory'
  | 'expenses'
  | 'reports'
  | 'users'
  | 'settings';

export type AccessLevel = 'none' | 'own' | 'read' | 'limited' | 'partial' | 'edit' | 'submit' | 'financial' | 'full';

export const normalizeRole = (role: UserRole | string): UserRole => {
  if (role === 'inventory_clerk') return 'storekeeper';
  return role as UserRole;
};

export const roleLabel = (role: UserRole | string) => {
  const normalizedRole = normalizeRole(role);
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    accountant: 'Accountant',
    storekeeper: 'Inventory Clerk',
    inventory_clerk: 'Inventory Clerk',
    cashier: 'Cashier',
    viewer: 'Viewer',
    customer: 'Customer'
  };
  return labels[normalizedRole] || normalizedRole;
};

export const moduleAccess: Record<AppModuleId, Partial<Record<UserRole, AccessLevel>>> = {
  dashboard: {
    super_admin: 'full',
    admin: 'full',
    manager: 'partial',
    accountant: 'partial',
    storekeeper: 'partial',
    inventory_clerk: 'partial',
    cashier: 'own',
    viewer: 'read'
  },
  pos: {
    super_admin: 'full',
    admin: 'full',
    manager: 'full',
    cashier: 'limited'
  },
  invoices: {
    super_admin: 'full',
    admin: 'full',
    manager: 'read',
    accountant: 'full',
    storekeeper: 'read',
    inventory_clerk: 'read',
    cashier: 'own',
    viewer: 'read'
  },
  customers: {
    super_admin: 'full',
    admin: 'full',
    manager: 'edit',
    cashier: 'limited',
    viewer: 'read'
  },
  products: {
    super_admin: 'full',
    admin: 'full',
    manager: 'full',
    storekeeper: 'full',
    inventory_clerk: 'full',
    viewer: 'read'
  },
  procurement: {
    super_admin: 'full',
    admin: 'full',
    manager: 'full',
    storekeeper: 'partial',
    inventory_clerk: 'partial'
  },
  inventory: {
    super_admin: 'full',
    admin: 'full',
    manager: 'edit',
    storekeeper: 'edit',
    inventory_clerk: 'edit',
    cashier: 'read',
    viewer: 'read'
  },
  expenses: {
    super_admin: 'full',
    admin: 'full',
    manager: 'submit',
    accountant: 'full',
    cashier: 'submit'
  },
  reports: {
    super_admin: 'full',
    admin: 'full',
    manager: 'partial',
    accountant: 'financial',
    storekeeper: 'read',
    inventory_clerk: 'read',
    cashier: 'own',
    viewer: 'read'
  },
  users: {
    super_admin: 'full',
    admin: 'partial',
    manager: 'limited'
  },
  settings: {
    super_admin: 'full',
    admin: 'partial',
    manager: 'limited',
    accountant: 'read',
    cashier: 'own'
  }
};

export const getModuleAccess = (moduleId: AppModuleId, role: UserRole | string): AccessLevel => {
  const normalizedRole = normalizeRole(role);
  return moduleAccess[moduleId][normalizedRole] || 'none';
};

export const canAccessModule = (moduleId: AppModuleId, role: UserRole | string) =>
  getModuleAccess(moduleId, role) !== 'none';

export const canUseQuickAction = (action: 'new-sale' | 'add-product' | 'add-customer' | 'quick-invoice', role: UserRole | string) => {
  const normalizedRole = normalizeRole(role);
  if (action === 'new-sale') return ['super_admin', 'admin', 'manager', 'cashier'].includes(normalizedRole);
  if (action === 'add-product') return ['super_admin', 'admin', 'manager', 'storekeeper'].includes(normalizedRole);
  if (action === 'add-customer') return ['super_admin', 'admin', 'manager', 'cashier'].includes(normalizedRole);
  return ['super_admin', 'admin', 'accountant', 'manager', 'cashier'].includes(normalizedRole);
};

export const firstAccessibleModule = (role: UserRole | string): AppModuleId =>
  (Object.keys(moduleAccess) as AppModuleId[]).find(moduleId => canAccessModule(moduleId, role)) || 'dashboard';
