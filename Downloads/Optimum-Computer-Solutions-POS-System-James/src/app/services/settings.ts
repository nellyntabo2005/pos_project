export interface BusinessSettings {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
}

export interface InvoiceSettings {
  prefix: string;
  startingNumber: string;
  taxRate: string;
  paymentTerms: string;
  footerNote: string;
}

export interface PaymentMethodSetting {
  name: string;
  enabled: boolean;
  description: string;
}

export interface PosSettings {
  level: string;
  scannerEnabled: boolean;
  receiptBarcodeEnabled: boolean;
  receiptQrEnabled: boolean;
}

export type AppLanguage = 'English' | 'Kiswahili';

export interface SystemSettings {
  currency: string;
  language: AppLanguage;
  timezone: string;
  dateFormat: string;
  autoBackup: boolean;
  emailNotifications: boolean;
  lowStockAlerts: boolean;
}

export interface SecuritySettings {
  passwordChangeRequired: boolean;
  minimumCharacters: boolean;
  specialCharactersRequired: boolean;
  sessionTimeout: string;
  maxLoginAttempts: string;
  twoFactorRequired: boolean;
}

export interface AppSettings {
  businessInfo: BusinessSettings;
  invoiceSettings: InvoiceSettings;
  paymentMethods: PaymentMethodSetting[];
  posSettings: PosSettings;
  systemSettings: SystemSettings;
  securitySettings: SecuritySettings;
}

export const APP_SETTINGS_STORAGE_KEY = 'pos-app-settings';
export const APP_LANGUAGE_CHANGED_EVENT = 'pos:language-changed';

export const defaultAppSettings: AppSettings = {
  businessInfo: {
    name: 'Optimum POS',
    email: 'info@optimum.com',
    phone: '+254118859686',
    address: 'Tripple Two Address Building, Off Thika Super Highway, Nairobi, Kenya',
    taxId: 'TAX123456789'
  },
  invoiceSettings: {
    prefix: 'INV-',
    startingNumber: '001',
    taxRate: '10',
    paymentTerms: '30',
    footerNote: 'Thank you for your business!'
  },
  paymentMethods: [
    { name: 'Cash', enabled: true, description: 'Accept cash payments' },
    { name: 'Credit/Debit Cards', enabled: true, description: 'Accept card payments via terminal' },
    { name: 'M-Pesa', enabled: true, description: 'Accept mobile payments via M-Pesa' },
    { name: 'Bank Transfer', enabled: false, description: 'Accept direct bank transfers' },
    { name: 'Cryptocurrency', enabled: false, description: 'Accept Bitcoin and other cryptocurrencies' }
  ],
  posSettings: {
    level: 'Standard',
    scannerEnabled: true,
    receiptBarcodeEnabled: true,
    receiptQrEnabled: true
  },
  systemSettings: {
    currency: 'KES',
    language: 'English',
    timezone: 'Africa/Nairobi',
    dateFormat: 'DD/MM/YYYY',
    autoBackup: true,
    emailNotifications: true,
    lowStockAlerts: true
  },
  securitySettings: {
    passwordChangeRequired: false,
    minimumCharacters: true,
    specialCharactersRequired: true,
    sessionTimeout: '30',
    maxLoginAttempts: '5',
    twoFactorRequired: false
  }
};

export const getStoredAppSettings = (): AppSettings => {
  const savedSettings = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!savedSettings) return defaultAppSettings;

  try {
    const parsedSettings = JSON.parse(savedSettings) as Partial<AppSettings>;
    return {
      businessInfo: { ...defaultAppSettings.businessInfo, ...parsedSettings.businessInfo },
      invoiceSettings: { ...defaultAppSettings.invoiceSettings, ...parsedSettings.invoiceSettings },
      paymentMethods: parsedSettings.paymentMethods || defaultAppSettings.paymentMethods,
      posSettings: { ...defaultAppSettings.posSettings, ...parsedSettings.posSettings },
      systemSettings: { ...defaultAppSettings.systemSettings, ...parsedSettings.systemSettings },
      securitySettings: { ...defaultAppSettings.securitySettings, ...parsedSettings.securitySettings }
    };
  } catch {
    return defaultAppSettings;
  }
};

export const saveAppSettings = (settings: AppSettings) => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(APP_LANGUAGE_CHANGED_EVENT, {
    detail: settings.systemSettings.language
  }));
};
