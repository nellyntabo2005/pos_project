import { type CompletedSale, type DayBalance, type POSProduct } from '../components/pages/POSPageEnhanced';
import type { SupplierOrderInvoice } from '../types/supplierOrder';
import type { AppSettings } from './settings';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'pos-api-access-token';
const REFRESH_TOKEN_KEY = 'pos-api-refresh-token';

export interface AppBackendState {
  products: POSProduct[];
  completedSales: CompletedSale[];
  dayBalance: DayBalance;
  supplierInvoices: SupplierOrderInvoice[];
  suppliers: BackendSupplier[];
  customers: BackendCustomer[];
  users: BackendUser[];
}

interface PaginatedResponse<T> {
  results: T[];
}

interface BackendProduct {
  id: number;
  sku: string;
  name: string;
  description?: string;
  generic_name?: string | null;
  brand?: string | null;
  variant?: string | null;
  pack_size?: string | null;
  model_number?: string | null;
  category_name: string | null;
  base_unit_name?: string | null;
  unit?: string | null;
  price: string | number;
  retail_price?: string | number;
  wholesale_price: string | number | null;
  carton_price?: string | number | null;
  quantity: number;
  stock_quantity?: string | number;
  image_url?: string;
  image_data?: string;
  main_image?: string;
  external_image_url?: string;
  minimum_stock?: string | number | null;
  reorder_level?: string | number | null;
  supplier_id?: number | null;
  supplier?: number | { id?: number; name?: string } | null;
  supplier_name?: string | null;
  supplier_sku?: string | null;
  notes?: string | null;
  tax_rate?: string | number | null;
  maximum_stock?: string | number | null;
}

interface BackendSaleItem {
  product_id: number;
  product?: number;
  name: string;
  product_name?: string;
  price: string | number;
  unit_price?: string | number;
  quantity: string | number;
  base_quantity?: string | number;
  line_total: string | number;
  total?: string | number;
}

interface BackendPayment {
  payment_method: string;
  amount: string | number;
}

interface BackendSale {
  id: number;
  customer?: number | null;
  receipt_number: string;
  sale_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_account_reference?: string;
  cashier_name?: string;
  cashier?: string | number;
  grand_total: string | number;
  total?: string | number;
  amount_paid: string | number;
  payment_method: string;
  created_at: string;
  sale_date?: string;
  items: BackendSaleItem[];
  payments?: BackendPayment[];
}

interface BackendSupplierInvoice {
  id: number;
  supplier_id?: number | null;
  supplier?: number | null;
  supplier_name: string;
  contact?: string;
  invoice_number?: string;
  po_number?: string;
  order_date?: string;
  created_at?: string;
  amount: string | number;
  total?: string | number;
  status: SupplierOrderInvoice['status'] | 'draft' | 'submitted' | 'confirmed' | 'shipped' | 'received' | 'completed' | 'cancelled' | 'returned';
  delivery_note?: string;
  tracking_number?: string;
  items: number | Array<{
    id?: number;
    product?: number;
    product_id?: number;
    product_name?: string;
    quantity?: string | number;
    quantity_received?: string | number;
    unit_cost?: string | number;
    total?: string | number;
  }>;
  payment_method?: string;
  payment_status?: string;
}

interface BackendAppSetting {
  id: number;
  key: string;
  value: Partial<AppSettings>;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface BackendNotification {
  id: number;
  channel: string | number;
  channel_name?: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  title: string;
  message: string;
  action_url?: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface BackendUser {
  id: number;
  username: string;
  email: string;
  role: string;
  access_tier: string;
  two_factor_enabled: boolean;
  is_active: boolean;
  approval_status?: 'pending' | 'approved' | 'rejected' | 'expired';
  approval_requested_at?: string | null;
  approval_deadline_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  approval_notes?: string;
  last_login?: string | null;
}

export interface BackendSupplier {
  id: number;
  name: string;
  code?: string;
  contact_person?: string;
  designation?: string;
  phone?: string;
  alternate_phone?: string;
  fax_number?: string;
  email?: string;
  website?: string;
  supplier_type?: string;
  supplier_category?: string;
  registration_number?: string;
  address?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  county?: string;
  postal_code?: string;
  country?: string;
  tax_number?: string;
  bank_name?: string;
  bank_account?: string;
  currency?: string;
  credit_limit?: string | number;
  preferred_payment_method?: string;
  mpesa_paybill?: string;
  mpesa_till?: string;
  default_warehouse?: string;
  minimum_order_amount?: string | number;
  lead_time_days?: number;
  uploaded_documents?: Array<{ name: string; size: string }>;
  notes?: string;
  is_active?: boolean;
  is_preferred?: boolean;
  payment_terms?: number;
}

export interface BackendCustomer {
  id: number;
  uuid?: string;
  account_reference: string;
  name: string;
  phone: string;
  email: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  county?: string;
  postal_code?: string;
  tax_number?: string | null;
  loyalty_points: number;
  total_spent: string | number;
  pricing_tier: 'retail' | 'wholesale' | 'vip';
  is_active: boolean;
  is_blacklisted: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  last_purchase_date?: string | null;
  discount_percentage?: number;
  full_address?: string;
}

interface LoginResponse {
  success?: boolean;
  message?: string;
  error?: string;
  user?: BackendUser;
  two_factor_required?: boolean;
  verification_code?: string;
  tokens?: Partial<{
    access: string;
    refresh: string;
  }>;
  access?: string;
  refresh?: string;
}

interface RegisterResponse {
  success?: boolean;
  message?: string;
  user?: BackendUser;
}

interface MpesaStkPushResponse {
  success: boolean;
  demo_mode?: boolean;
  message?: string;
  error?: string;
  transaction?: {
    id?: number;
    checkout_request_id?: string;
    status?: string;
  };
  transaction_id?: number;
  checkout_request_id?: string;
}

export interface MpesaPaymentStatus {
  id: number;
  checkout_request_id: string;
  status: 'pending' | 'completed' | 'paid' | 'success' | 'failed' | 'cancelled' | 'timeout';
  amount: string | number;
  mpesa_receipt_number?: string | null;
  result_code?: number | null;
  result_desc?: string;
  query_error?: string;
  completed_at?: string | null;
}

interface ProductMutationResponse {
  success?: boolean;
  data?: BackendProduct;
}

export interface LoginResult {
  success: boolean;
  twoFactorRequired: boolean;
  verificationCode?: string;
  userRole?: string;
}

export type RegistrationRole = 'accountant' | 'cashier' | 'storekeeper' | 'inventory_clerk' | 'manager' | 'viewer';
export type BackendRole = 'super_admin' | 'admin' | 'manager' | 'accountant' | 'cashier' | 'inventory_clerk' | 'viewer' | 'storekeeper';

export interface RegisterAccountInput {
  username: string;
  email: string;
  password: string;
  role: RegistrationRole | BackendRole;
}

export interface CreateSupplierInput {
  name: string;
  code?: string;
  contact_person?: string;
  designation?: string;
  phone?: string;
  alternate_phone?: string;
  fax_number?: string;
  email?: string;
  website?: string;
  supplier_type?: string;
  supplier_category?: string;
  registration_number?: string;
  address?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  county?: string;
  postal_code?: string;
  country?: string;
  tax_number?: string;
  bank_name?: string;
  bank_account?: string;
  currency?: string;
  credit_limit?: number;
  preferred_payment_method?: string;
  mpesa_paybill?: string;
  mpesa_till?: string;
  default_warehouse?: string;
  minimum_order_amount?: number;
  lead_time_days?: number;
  uploaded_documents?: Array<{ name: string; size: string }>;
  notes?: string;
  is_active?: boolean;
  is_preferred?: boolean;
  payment_terms?: number;
}

export type CreateCustomerInput = Pick<BackendCustomer,
  'name' |
  'phone' |
  'email' |
  'address_line1' |
  'address_line2' |
  'city' |
  'county' |
  'postal_code' |
  'tax_number' |
  'pricing_tier' |
  'notes'
>;

export interface MpesaPaymentInput {
  phoneNumber: string;
  amount: number;
  customerName?: string;
  accountReference?: string;
  transactionDesc?: string;
}

export interface ProductExcelImportResult {
  success: boolean;
  created: number;
  updated: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
}

export interface CreateProductInput {
  name: string;
  sku: string;
  category_name?: string;
  generic_name?: string;
  brand?: string;
  parent_product?: string;
  variation?: string;
  pack_size?: string;
  model_number?: string;
  supplier_id?: number;
  base_unit_name?: string;
  price: number;
  wholesale_price?: number;
  corporate_price?: number;
  loyalty_price?: number;
  cost_price?: number;
  quantity?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  supplier_sku?: string;
  tax_rate?: number;
  image_data?: string;
  notes?: string;
}

export interface UpdateUserInput {
  role?: BackendRole;
  is_active?: boolean;
}

export const getAccessToken = () => window.localStorage.getItem(ACCESS_TOKEN_KEY) || import.meta.env.VITE_API_TOKEN || '';

export const buildNotificationsWebSocketUrl = () => {
  const token = getAccessToken();
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  const apiUrl = new URL(baseUrl, window.location.origin);
  const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${apiUrl.host}/ws/notifications/${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

const unwrapList = <T>(data: T[] | PaginatedResponse<T>): T[] => Array.isArray(data) ? data : data.results;

const requestListOrEmpty = async <T>(path: string): Promise<T[]> => {
  try {
    const response = await request<T[] | PaginatedResponse<T>>(path);
    return unwrapList(response);
  } catch (error) {
    console.warn(`Unable to load ${path}.`, error);
    return [];
  }
};

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);

const readMetadataValue = (text: string | null | undefined, label: string) => {
  const match = (text || '').match(new RegExp(`${label}:\\s*([^|\\n]+)`, 'i'));
  return match?.[1]?.trim() || undefined;
};

const buildProductMetadata = (product: CreateProductInput) => [
  product.brand ? `Brand: ${product.brand}` : '',
  (product.generic_name || product.parent_product) ? `Parent Product: ${product.generic_name || product.parent_product}` : '',
  product.variation ? `Variation: ${product.variation}` : '',
  product.pack_size ? `Pack Size: ${product.pack_size}` : '',
  product.model_number ? `Model: ${product.model_number}` : '',
  typeof product.corporate_price === 'number' ? `Corporate Price: ${product.corporate_price}` : '',
  typeof product.loyalty_price === 'number' ? `Loyalty Price: ${product.loyalty_price}` : '',
  product.notes ? `Notes: ${product.notes}` : ''
].filter(Boolean).join(' | ');

const hashText = (text: string) => Array.from(text).reduce((hash, character) => {
  return ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
}, 0);

const productPhotoFor = (product: BackendProduct) => {
  const hue = hashText(`${product.id}-${product.name}`) % 360;
  const label = encodeURIComponent((product.name || 'POS').slice(0, 2).toUpperCase());
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">`,
    `<rect width="160" height="160" rx="16" fill="hsl(${hue} 72% 92%)"/>`,
    `<circle cx="118" cy="34" r="26" fill="hsl(${hue} 64% 82%)"/>`,
    `<rect x="34" y="55" width="92" height="62" rx="10" fill="hsl(${hue} 58% 70%)"/>`,
    `<path d="M52 55c4-20 52-20 56 0" fill="none" stroke="hsl(${hue} 54% 42%)" stroke-width="8" stroke-linecap="round"/>`,
    `<text x="80" y="96" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="hsl(${hue} 56% 28%)">${label}</text>`,
    `</svg>`
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const absoluteMediaUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin);
  return new URL(url, `${apiUrl.protocol}//${apiUrl.host}`).toString();
};

const mapProductFromApi = (product: BackendProduct): POSProduct => ({
  id: String(product.id),
  name: product.name,
  sku: product.sku,
  category: product.category_name || 'Uncategorized',
  brand: product.brand || readMetadataValue(product.notes, 'Brand') || readMetadataValue(product.description, 'Brand') || product.supplier_sku || undefined,
  parentProduct: product.generic_name || readMetadataValue(product.notes, 'Parent Product') || readMetadataValue(product.description, 'Parent Product'),
  variation: product.variant || readMetadataValue(product.notes, 'Variation') || readMetadataValue(product.description, 'Variation'),
  packSize: product.pack_size || readMetadataValue(product.notes, 'Pack Size') || readMetadataValue(product.description, 'Pack Size'),
  modelNumber: product.model_number || readMetadataValue(product.notes, 'Model') || readMetadataValue(product.description, 'Model'),
  uom: product.base_unit_name || product.unit || 'piece',
  prices: {
    retail: toNumber(product.retail_price ?? product.price),
    wholesale: toNumber(product.wholesale_price || product.retail_price || product.price),
    corporate: toNumber(readMetadataValue(product.notes, 'Corporate Price') || product.carton_price || product.wholesale_price || product.retail_price || product.price),
    loyal: toNumber(readMetadataValue(product.notes, 'Loyalty Price') || product.retail_price || product.price)
  },
  stock: toNumber(product.stock_quantity ?? product.quantity),
  reorderLevel: toNumber(product.minimum_stock ?? product.reorder_level),
  supplierId: typeof product.supplier === 'object' ? product.supplier?.id : product.supplier_id ?? product.supplier ?? undefined,
  supplierName: typeof product.supplier === 'object' ? product.supplier?.name : product.supplier_name || undefined,
  tax: toNumber(product.tax_rate),
  image: absoluteMediaUrl(product.image_data || product.image_url || product.external_image_url || product.main_image) || productPhotoFor(product)
});

const toBackendUnit = (unit?: string) => {
  const unitMap: Record<string, string> = {
    pcs: 'piece',
    piece: 'piece',
    kg: 'kg',
    g: 'g',
    liter: 'l',
    litre: 'l',
    l: 'l',
    ml: 'ml',
    box: 'box',
    carton: 'carton',
    pack: 'pack',
    dozen: 'pack',
    meter: 'piece'
  };

  return unitMap[(unit || '').toLowerCase()] || 'piece';
};

const paymentMethodName = (method?: string) => {
  const methodMap: Record<string, string> = {
    cash: 'Cash',
    mpesa: 'M-Pesa',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    loyalty: 'Loyalty',
    mixed: 'Mixed Payment'
  };

  return methodMap[method || ''] || method || 'Paid';
};

const buildSalePaymentLabel = (sale: BackendSale) => {
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments
      .map(payment => `${paymentMethodName(payment.payment_method)}: ${toNumber(payment.amount).toFixed(2)}`)
      .join(', ');
  }

  return `${paymentMethodName(sale.payment_method)}: ${toNumber(sale.amount_paid ?? sale.grand_total ?? sale.total).toFixed(2)}`;
};

const mapSaleFromApi = (sale: BackendSale): CompletedSale => {
  const method = buildSalePaymentLabel(sale);

  return {
    id: sale.receipt_number || sale.sale_id || String(sale.id),
    customer: sale.customer_name || 'Walk-in Customer',
    customerId: sale.customer ?? undefined,
    customerPhone: sale.customer_phone,
    customerEmail: sale.customer_email,
    customerAccountReference: sale.customer_account_reference,
    amount: toNumber(sale.grand_total ?? sale.total),
    cashAmount: sale.payments && sale.payments.length > 0
      ? sale.payments
          .filter(payment => payment.payment_method === 'cash')
          .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
      : sale.payment_method === 'cash' ? toNumber(sale.amount_paid) : 0,
    method,
    timestamp: new Date(sale.created_at || sale.sale_date || Date.now()),
    cashier: sale.cashier_name || (typeof sale.cashier === 'string' ? sale.cashier : undefined) || 'Cashier',
    items: (sale.items || []).map(item => ({
      productId: String(item.product_id ?? item.product),
      name: item.name || item.product_name || 'Product',
      quantity: toNumber(item.quantity),
      stockUnits: toNumber(item.base_quantity || 1),
      price: toNumber(item.price ?? item.unit_price),
      total: toNumber(item.line_total ?? item.total)
    }))
  };
};

const mapPurchaseOrderStatus = (status: BackendSupplierInvoice['status']): SupplierOrderInvoice['status'] => {
  if (status === 'received' || status === 'completed') return 'delivered';
  if (status === 'draft' || status === 'submitted' || status === 'confirmed' || status === 'shipped') return 'requested';
  return status === 'delivered' || status === 'pending' || status === 'requested' ? status : 'pending';
};

const mapSupplierInvoiceFromApi = (invoice: BackendSupplierInvoice): SupplierOrderInvoice => {
  const firstItem = Array.isArray(invoice.items) ? invoice.items[0] : undefined;
  const itemQuantity = toNumber(firstItem?.quantity);
  const orderItems = Array.isArray(invoice.items)
    ? invoice.items.map(item => {
        const requestedQuantity = toNumber(item.quantity);
        const deliveredQuantity = toNumber(item.quantity_received);
        return {
          productId: String(item.product_id ?? item.product ?? ''),
          productName: item.product_name || 'Product',
          requestedQuantity,
          deliveredQuantity,
          pendingQuantity: Math.max(0, requestedQuantity - deliveredQuantity),
          unitCost: toNumber(item.unit_cost)
        };
      })
    : [];
  const requestedQuantity = orderItems.reduce((sum, item) => sum + item.requestedQuantity, 0) || itemQuantity;
  const deliveredQuantity = orderItems.reduce((sum, item) => sum + item.deliveredQuantity, 0);

  return {
    id: invoice.invoice_number || invoice.po_number || `SUP-INV-${invoice.id.toString().padStart(3, '0')}`,
    supplierId: invoice.supplier_id || invoice.supplier || invoice.id,
    supplierName: invoice.supplier_name,
    contact: invoice.contact || '',
    date: (invoice.order_date || invoice.created_at || new Date().toISOString()).slice(0, 10),
    amount: toNumber(invoice.amount ?? invoice.total),
    status: mapPurchaseOrderStatus(invoice.status),
    items: Array.isArray(invoice.items) ? invoice.items.length : invoice.items,
    paymentMethod: invoice.payment_method || invoice.payment_status || 'pending',
    deliveryNote: invoice.delivery_note || invoice.tracking_number || undefined,
    goodsReceivingNote: invoice.tracking_number || undefined,
    orderItems,
    productId: firstItem ? String(firstItem.product_id ?? firstItem.product ?? '') || undefined : undefined,
    productName: firstItem?.product_name,
    quantityRequested: requestedQuantity || undefined,
    quantityDelivered: deliveredQuantity || undefined,
    quantityPending: Math.max(0, requestedQuantity - deliveredQuantity) || undefined
  };
};

const mapNotificationFromApi = (notification: BackendNotification): BackendNotification => {
  const severityByPriority: Record<string, BackendNotification['severity']> = {
    low: 'info',
    medium: 'info',
    high: 'warning',
    urgent: 'error'
  };

  return {
    ...notification,
    channel: notification.channel_name || String(notification.channel),
    severity: notification.severity || severityByPriority[notification.priority || ''] || 'info',
    is_read: notification.is_read ?? Boolean(notification.read_at || notification.status === 'read')
  };
};

const request = async <T>(path: string, options?: RequestInit & { skipAuth?: boolean }): Promise<T> => {
  const token = getAccessToken();
  const { skipAuth, ...requestOptions } = options || {};
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers
      }
    });
  } catch (error) {
    throw new Error('Cannot reach the backend API. Make sure the Django server is running on http://127.0.0.1:8000.');
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text;

    try {
      const data = JSON.parse(text) as { message?: string; detail?: string; error?: string };
      message = data.message || data.detail || data.error || text;
    } catch {
      message = text;
    }

    throw new Error(message || `API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

const storeTokens = (response: LoginResponse) => {
  const access = response.tokens?.access || response.access;
  const refresh = response.tokens?.refresh || response.refresh || '';

  if (!access) {
    throw new Error('Login did not return an access token');
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

const normalizeAccountRole = (role?: RegistrationRole | BackendRole) => {
  const roleMap: Record<string, string> = {
    inventory_clerk: 'storekeeper'
  };

  return role ? roleMap[role] || role : role;
};

export const login = async (username: string, password: string): Promise<LoginResult> => {
  const response = await request<LoginResponse>('/users/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuth: true
  });

  if (response.success === false) {
    throw new Error(response.message || response.error || 'Invalid credentials');
  }

  if (!response.two_factor_required) {
    storeTokens(response);
  }

  return {
    success: true,
    twoFactorRequired: Boolean(response.two_factor_required),
    verificationCode: response.verification_code,
    userRole: response.user?.role
  };
};

export const verifyTwoFactor = async (username: string, code: string): Promise<LoginResult> => {
  const response = await request<LoginResponse>('/accounts/two-factor/verify/', {
    method: 'POST',
    body: JSON.stringify({ username, code }),
    skipAuth: true
  });

  if (!response.success) {
    throw new Error(response.message || 'Two-factor verification failed');
  }

  storeTokens(response);
  return { success: true, twoFactorRequired: false, userRole: response.user?.role };
};

export const registerAccount = async (account: RegisterAccountInput) => {
  const generatedPhone = `07${String(hashText(`${account.username}-${account.email}`) % 100000000).padStart(8, '0')}`;
  const response = await request<RegisterResponse | BackendUser>('/users/', {
    method: 'POST',
    body: JSON.stringify({
      username: account.username,
      email: account.email,
      password: account.password,
      confirm_password: account.password,
      phone: generatedPhone,
      role: normalizeAccountRole(account.role)
    }),
    skipAuth: true
  });

  if ('success' in response && response.success === false) {
    throw new Error(response.message || 'Account could not be created.');
  }

  return 'user' in response && response.user ? response.user : response as BackendUser;
};

export const initiateMpesaPayment = async ({
  phoneNumber,
  amount,
  customerName = 'POS Customer',
  accountReference = 'POS-SALE',
  transactionDesc = 'Payment for goods'
}: MpesaPaymentInput) => {
  const response = await request<MpesaStkPushResponse>('/payments/mpesa-payments/stk-push/', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: phoneNumber,
      amount,
      customer_name: customerName,
      account_reference: accountReference,
      transaction_desc: transactionDesc,
    })
  });

  if (!response.success) {
    throw new Error(response.message || response.error || 'M-Pesa prompt could not be sent.');
  }

  return response;
};

export const getMpesaPaymentStatus = (checkoutRequestId: string) => request<MpesaPaymentStatus>(
  `/payments/mpesa-payments/status/?checkout_request_id=${encodeURIComponent(checkoutRequestId)}`
);

const requestFile = async (path: string, options?: RequestInit): Promise<Blob> => {
  const token = getAccessToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers
      }
    });
  } catch {
    throw new Error('Cannot reach the backend API. Make sure the Django server is running on http://127.0.0.1:8000.');
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed: ${response.status} ${response.statusText}`);
  }

  return response.blob();
};

export const downloadProductImportTemplate = () => requestFile('/products/download-template/');

export const downloadAvailableProducts = () => requestFile('/products/export/');

export const importProductsFromExcel = async (file: File): Promise<ProductExcelImportResult> => {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/products/bulk-import/`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });
  } catch {
    throw new Error('Cannot reach the backend API. Make sure the Django server is running on http://127.0.0.1:8000.');
  }

  const data = await response.json() as Partial<ProductExcelImportResult> & { message?: string; error?: string; errors?: Array<string | { row: number; message: string }> };

  if (!response.ok) {
    const errors = data.errors?.map(error => typeof error === 'string' ? error : `Row ${error.row}: ${error.message}`).join('; ');
    throw new Error(data.message || data.error || errors || 'Products could not be imported.');
  }

  return {
    success: true,
    created: data.created || 0,
    updated: data.updated || 0,
    errors: (data.errors || []).map((error, index) => typeof error === 'string' ? { row: index + 1, message: error } : error)
  };
};

export const logout = () => {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const hasStoredSession = () => Boolean(getAccessToken());

const normalizeSalePaymentMethod = (method: string) => {
  const normalized = method.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('m_pesa') || normalized.includes('mpesa')) return 'mpesa';
  if (normalized.includes('card')) return 'card';
  if (normalized.includes('bank')) return 'bank_transfer';
  if (normalized.includes('loyalty')) return 'loyalty';
  if (normalized.includes('mixed')) return 'mixed';
  return 'cash';
};

const buildSalePaymentInputs = (sale: CompletedSale) => {
  const paymentParts = (sale.method || '').split(',').map(part => part.trim()).filter(Boolean);
  const parsedPayments = paymentParts.map(part => {
    const [methodLabel, ...amountParts] = part.split(':');
    const amount = Number(amountParts.join(':').replace(/[^\d.-]/g, ''));

    return {
      payment_method: normalizeSalePaymentMethod(methodLabel || sale.method),
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      reference_number: sale.id
    };
  }).filter(payment => payment.amount > 0);

  if (parsedPayments.length > 0) return parsedPayments;

  return [{
    payment_method: sale.cashAmount > 0 ? 'cash' : normalizeSalePaymentMethod(sale.method || 'cash'),
    amount: sale.cashAmount > 0 ? sale.cashAmount : sale.amount,
    reference_number: sale.id
  }];
};

export const loadBackendState = async (fallbackDayBalance: DayBalance): Promise<AppBackendState> => {
  const [products, completedSales, supplierOrders, suppliers, customers, users] = await Promise.all([
    requestListOrEmpty<BackendProduct>('/products/'),
    requestListOrEmpty<BackendSale>('/sales/'),
    requestListOrEmpty<BackendSupplierInvoice>('/inventory/purchase-orders/'),
    requestListOrEmpty<BackendSupplier>('/products/suppliers/'),
    requestListOrEmpty<BackendCustomer>('/customers/'),
    requestListOrEmpty<BackendUser>('/users/')
  ]);

  const mappedProducts = products.map(mapProductFromApi);

  return {
    products: mappedProducts,
    completedSales: completedSales.map(mapSaleFromApi),
    dayBalance: fallbackDayBalance,
    supplierInvoices: supplierOrders.map(mapSupplierInvoiceFromApi),
    suppliers,
    customers,
    users
  };
};

export const saveSale = async (sale: CompletedSale) => {
  const createdSale = await request<BackendSale>('/sales/', {
    method: 'POST',
    body: JSON.stringify({
      customer: sale.customerId || null,
      discount: 0,
      discount_percentage: 0,
      payment_inputs: buildSalePaymentInputs(sale),
      cart_items: sale.items.map(item => ({
        product_id: Number(item.productId),
        quantity: item.quantity
      }))
    })
  });

  return mapSaleFromApi(createdSale);
};

export const updateProductStock = async (productId: string, stock: number) => {
  const response = await request<BackendProduct>(`/products/${productId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ stock_quantity: stock, quantity: stock })
  });

  return mapProductFromApi(response);
};

export const updateUser = (userId: number, user: UpdateUserInput) => request<BackendUser>(`/users/${userId}/`, {
  method: 'PATCH',
  body: JSON.stringify({
    ...user,
    role: normalizeAccountRole(user.role)
  })
});

export const deactivateUser = (userId: number) => request<{ message: string }>(`/users/${userId}/toggle-active/`, {
  method: 'POST',
  body: JSON.stringify({})
});

export const approveUser = (userId: number) => request<BackendUser>(`/users/${userId}/approve/`, {
  method: 'POST',
  body: JSON.stringify({})
});

export const rejectUser = (userId: number, notes = '') => request<BackendUser>(`/users/${userId}/reject/`, {
  method: 'POST',
  body: JSON.stringify({ notes })
});

export const createProduct = async (product: CreateProductInput) => {
  const metadata = buildProductMetadata(product);
  const response = await request<BackendProduct>('/products/', {
    method: 'POST',
    body: JSON.stringify({
      name: product.name,
      barcode: product.sku,
      generic_name: product.generic_name || product.parent_product || '',
      brand: product.brand || '',
      variant: product.variation || '',
      pack_size: product.pack_size || '',
      model_number: product.model_number || '',
      description: product.notes || metadata,
      retail_price: product.price,
      wholesale_price: product.wholesale_price || null,
      carton_price: product.corporate_price || null,
      cost_price: product.cost_price || 0,
      stock_quantity: product.quantity || 0,
      minimum_stock: product.minimum_stock || 0,
      reorder_level: product.minimum_stock || 0,
      maximum_stock: product.maximum_stock || null,
      category_name_input: product.category_name,
      supplier: product.supplier_id || null,
      supplier_sku: product.supplier_sku || '',
      notes: metadata,
      unit: toBackendUnit(product.base_unit_name),
      tax_rate: product.tax_rate ?? 0,
      is_active: true,
      image_data: product.image_data || ''
    })
  });

  return mapProductFromApi(response);
};

export const deactivateProduct = (productId: string) => request<BackendProduct>(`/products/${productId}/`, {
  method: 'PATCH',
  body: JSON.stringify({ is_active: false })
});
export const saveDayBalance = async (dayBalance: DayBalance) => dayBalance;

export const createSupplier = async (supplier: CreateSupplierInput) => {
  const response = await request<BackendSupplier>('/products/suppliers/', {
    method: 'POST',
    body: JSON.stringify({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
      is_active: true
    })
  });

  return response;
};

export const createCustomer = (customer: CreateCustomerInput) => request<BackendCustomer>('/customers/', {
  method: 'POST',
  body: JSON.stringify(customer)
});

export const saveSupplierInvoice = async (invoice: SupplierOrderInvoice) => {
  const invoiceItems = invoice.orderItems && invoice.orderItems.length > 0
    ? invoice.orderItems
    : invoice.productId ? [{
        productId: invoice.productId,
        productName: invoice.productName || 'Product',
        requestedQuantity: invoice.quantityRequested || invoice.quantityDelivered || invoice.items || 1,
        deliveredQuantity: invoice.quantityDelivered || 0,
        pendingQuantity: Math.max(0, (invoice.quantityRequested || invoice.quantityDelivered || invoice.items || 1) - (invoice.quantityDelivered || 0)),
        unitCost: invoice.quantityDelivered ? invoice.amount / invoice.quantityDelivered : invoice.amount
      }] : [];

  const orderItems = invoiceItems.map(item => ({
    product_id: Number(item.productId),
    quantity: item.requestedQuantity,
    unit_cost: item.unitCost || (item.requestedQuantity ? invoice.amount / item.requestedQuantity : invoice.amount),
    notes: item.productName ? `Reorder for ${item.productName}` : 'Supplier reorder'
  }));

  const response = await request<BackendSupplierInvoice>('/inventory/purchase-orders/', {
    method: 'POST',
    body: JSON.stringify({
      supplier: invoice.supplierId,
      status: invoice.status === 'delivered' ? 'confirmed' : invoice.status === 'requested' ? 'submitted' : 'draft',
      payment_status: 'unpaid',
      tracking_number: invoice.goodsReceivingNote || invoice.deliveryNote || '',
      supplier_notes: invoice.contact || '',
      internal_notes: [
        invoice.productName ? `Created from POS procurement for ${invoice.productName}` : 'Created from POS procurement',
        invoice.deliveryNote ? `Delivery note: ${invoice.deliveryNote}` : ''
      ].filter(Boolean).join('\n'),
      order_items: orderItems
    })
  });

  if (invoice.status !== 'delivered') {
    return mapSupplierInvoiceFromApi(response);
  }

  const createdItems = Array.isArray(response.items) ? response.items : [];
  const receivePayload = createdItems
    .map(createdItem => {
      const matchingItem = invoiceItems.find(item => String(item.productId) === String(createdItem.product_id ?? createdItem.product));
      const quantity = matchingItem?.deliveredQuantity || 0;
      return quantity > 0 ? {
        item_id: createdItem.id,
        quantity,
        location: 'Main Store',
        notes: invoice.goodsReceivingNote || invoice.deliveryNote || 'Goods received'
      } : null;
    })
    .filter(Boolean);

  if (receivePayload.length === 0) {
    return mapSupplierInvoiceFromApi(response);
  }

  const receiveResponse = await request<{ purchase_order: BackendSupplierInvoice }>(`/inventory/purchase-orders/${response.id}/receive/`, {
    method: 'POST',
    body: JSON.stringify(receivePayload)
  });

  return mapSupplierInvoiceFromApi(receiveResponse.purchase_order);
};

export const loadAppSettings = async () => {
  const saved = window.localStorage.getItem('pos-app-settings');
  return saved ? JSON.parse(saved) as Partial<AppSettings> : {};
};

export const saveBackendAppSettings = async (settings: AppSettings) => {
  window.localStorage.setItem('pos-app-settings', JSON.stringify(settings));
  return settings;
};

export const loadNotifications = async (unreadOnly = true) => {
  const query = '?ordering=-created_at';
  const response = await request<BackendNotification[] | PaginatedResponse<BackendNotification>>(`/notifications/notifications/${query}`);
  const notifications = unwrapList(response).map(mapNotificationFromApi);
  return unreadOnly ? notifications.filter(notification => !notification.is_read) : notifications;
};

export const markNotificationRead = (notificationId: number) => request<{ success: boolean }>(`/notifications/notifications/${notificationId}/mark-read/`, {
  method: 'POST',
  body: JSON.stringify({})
});

export const markAllNotificationsRead = () => request<{ success: boolean }>('/notifications/notifications/mark-all-read/', {
  method: 'POST',
  body: JSON.stringify({})
});
