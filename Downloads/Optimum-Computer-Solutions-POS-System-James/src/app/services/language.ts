import { useEffect, useState } from 'react';
import { APP_LANGUAGE_CHANGED_EVENT, getStoredAppSettings, type AppLanguage } from './settings';

type TranslationKey =
  | 'Dashboard'
  | 'POS / Sales'
  | 'Invoices'
  | 'Customers'
  | 'Stock levels'
  | 'Procurement'
  | 'Inventory'
  | 'Expenses'
  | 'Reports'
  | 'Users / Staff'
  | 'Settings'
  | 'Logout'
  | 'Management System'
  | 'Logged in as'
  | 'Notifications'
  | 'Refreshing...'
  | 'No unread updates'
  | 'Mark all read'
  | "You're all caught up"
  | 'New backend updates will appear here automatically.'
  | 'Total Amount Due'
  | 'Payment Method'
  | 'Amount'
  | 'M-Pesa Phone Number'
  | 'Send M-Pesa Prompt'
  | 'Waiting for M-Pesa...'
  | 'Add Payment'
  | 'Payment Breakdown'
  | 'Total Paid'
  | 'Remaining'
  | 'Change Due'
  | 'Cancel'
  | 'Complete Payment'
  | 'Please complete your payment'
  | 'Transaction complete'
  | 'M-Pesa Statement'
  | 'Payment received from M-Pesa.'
  | 'Phone'
  | 'Customer'
  | 'Reference'
  | 'Status'
  | 'Mark as read'
  | 'System Settings'
  | 'Configure your POS system preferences and business information'
  | 'Business Info'
  | 'Invoice Settings'
  | 'Payment Methods'
  | 'POS Config'
  | 'Taxes'
  | 'System'
  | 'Security'
  | 'Language'
  | 'Save System Settings';

const sw: Partial<Record<TranslationKey, string>> = {
  Dashboard: 'Dashibodi',
  'POS / Sales': 'POS / Mauzo',
  Invoices: 'Ankara',
  Customers: 'Wateja',
  'Stock levels': 'Viwango vya Stoo',
  Procurement: 'Ununuzi',
  Inventory: 'Stoo',
  Expenses: 'Matumizi',
  Reports: 'Ripoti',
  'Users / Staff': 'Watumiaji / Wafanyakazi',
  Settings: 'Mipangilio',
  Logout: 'Toka',
  'Management System': 'Mfumo wa Usimamizi',
  'Logged in as': 'Umeingia kama',
  Notifications: 'Taarifa',
  'Refreshing...': 'Inasasisha...',
  'No unread updates': 'Hakuna taarifa mpya',
  'Mark all read': 'Weka zote zimesomwa',
  "You're all caught up": 'Umesoma taarifa zote',
  'New backend updates will appear here automatically.': 'Taarifa mpya za mfumo zitaonekana hapa.',
  'Total Amount Due': 'Jumla ya Kulipa',
  'Payment Method': 'Njia ya Malipo',
  Amount: 'Kiasi',
  'M-Pesa Phone Number': 'Nambari ya Simu ya M-Pesa',
  'Send M-Pesa Prompt': 'Tuma Ombi la M-Pesa',
  'Waiting for M-Pesa...': 'Inasubiri M-Pesa...',
  'Add Payment': 'Ongeza Malipo',
  'Payment Breakdown': 'Mchanganuo wa Malipo',
  'Total Paid': 'Jumla Iliyolipwa',
  Remaining: 'Salio',
  'Change Due': 'Chenji',
  Cancel: 'Ghairi',
  'Complete Payment': 'Kamilisha Malipo',
  'Please complete your payment': 'Tafadhali kamilisha malipo yako',
  'Transaction complete': 'Muamala umekamilika',
  'M-Pesa Statement': 'Taarifa ya M-Pesa',
  'Payment received from M-Pesa.': 'Malipo yamepokelewa kutoka M-Pesa.',
  Phone: 'Simu',
  Customer: 'Mteja',
  Reference: 'Kumbukumbu',
  Status: 'Hali',
  'Mark as read': 'Weka imesomwa',
  'System Settings': 'Mipangilio ya Mfumo',
  'Configure your POS system preferences and business information': 'Sanidi mapendeleo ya POS na taarifa za biashara',
  'Business Info': 'Taarifa za Biashara',
  'Invoice Settings': 'Mipangilio ya Ankara',
  'Payment Methods': 'Njia za Malipo',
  'POS Config': 'Mipangilio ya POS',
  Taxes: 'Kodi',
  System: 'Mfumo',
  Security: 'Usalama',
  Language: 'Lugha',
  'Save System Settings': 'Hifadhi Mipangilio ya Mfumo'
};

Object.assign(sw, {
  'Point of Sale': 'Sehemu ya Mauzo',
  'Search and select a product...': 'Tafuta na uchague bidhaa...',
  'No products found': 'Hakuna bidhaa zilizopatikana',
  Stock: 'Stoo',
  Cart: 'Kikapu',
  Customer: 'Mteja',
  'No items in cart': 'Hakuna bidhaa kwenye kikapu',
  Discount: 'Punguzo',
  Subtotal: 'Jumla ndogo',
  Tax: 'Kodi',
  Total: 'Jumla',
  'Cash Tendered': 'Pesa taslimu iliyotolewa',
  'Pay with Cash': 'Lipa kwa Pesa Taslimu',
  'Multi-Payment': 'Malipo Mchanganyiko',
  'Multi-Payment Checkout': 'Malipo Mchanganyiko',
  Currency: 'Sarafu',
  Timezone: 'Saa za eneo',
  'Date Format': 'Muundo wa Tarehe'
});

export const translate = (text: TranslationKey | string, language = getStoredAppSettings().systemSettings.language) => {
  if (language === 'Kiswahili') {
    return sw[text as TranslationKey] || text;
  }

  return text;
};

export const useAppLanguage = () => {
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredAppSettings().systemSettings.language);

  useEffect(() => {
    const handleLanguageChange = () => {
      setLanguage(getStoredAppSettings().systemSettings.language);
    };

    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, handleLanguageChange);
    window.addEventListener('storage', handleLanguageChange);

    return () => {
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, handleLanguageChange);
      window.removeEventListener('storage', handleLanguageChange);
    };
  }, []);

  return {
    language,
    t: (text: TranslationKey | string) => translate(text, language)
  };
};
