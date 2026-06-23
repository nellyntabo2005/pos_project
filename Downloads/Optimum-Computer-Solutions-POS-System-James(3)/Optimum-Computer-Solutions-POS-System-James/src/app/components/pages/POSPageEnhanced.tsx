import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Search, ShoppingCart, Trash2, CircleDollarSign, CreditCard, ScanBarcode } from 'lucide-react';
import { CashDrawer } from '../CashDrawer';
import { TransactionNotification } from '../TransactionNotification';
import { MultiPaymentHandler } from '../MultiPaymentHandler';
import { Receipt } from '../Receipt';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import type { PaymentTransaction } from '../MultiPaymentHandler';
import { formatCurrency } from '../utils/helpers';
import { getStoredAppSettings } from '../../services/settings';
import { useAppLanguage } from '../../services/language';
import type { BackendCustomer } from '../../services/api';
import { toast } from 'sonner';

export type PricingTier = 'retail' | 'wholesale' | 'corporate' | 'loyal';

interface ProductSubItem {
  id: string;
  name: string;
  uom: string;
  quantityLabel: string;
  priceMultiplier: number;
  stockUnits: number;
  prices?: Partial<Record<PricingTier, number>>;
}

interface ProductGroup {
  key: string;
  name: string;
  category: string;
  products: POSProduct[];
}

export interface POSProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand?: string;
  parentProduct?: string;
  variation?: string;
  packSize?: string;
  modelNumber?: string;
  uom: string;
  prices: Record<PricingTier, number>;
  costPrice?: number;
  stock: number;
  reorderLevel?: number;
  supplierId?: number;
  supplierName?: string;
  supplierSku?: string;
  expiryDate?: string;
  quantityLevels?: Array<{
    quantity: number;
    label: string;
    prices: Partial<Record<PricingTier, number>>;
  }>;
  tax: number;
  image: string;
}

export const initialProducts: POSProduct[] = [];

const quantifiableUnitLabels: Record<string, { singular: string; plural: string }> = {
  kg: { singular: 'kg', plural: 'kg' },
  g: { singular: 'g', plural: 'g' },
  l: { singular: 'liter', plural: 'liters' },
  liter: { singular: 'liter', plural: 'liters' },
  litre: { singular: 'litre', plural: 'litres' },
  ml: { singular: 'ml', plural: 'ml' },
  meter: { singular: 'meter', plural: 'meters' },
  metre: { singular: 'metre', plural: 'metres' }
};

const normalizeUnit = (unit: string) => unit.trim().toLowerCase();

const formatQuantityLevel = (quantity: number, unit: string) => {
  const unitLabel = quantifiableUnitLabels[normalizeUnit(unit)];
  if (!unitLabel) return `${quantity} ${unit}`;
  return `${quantity} ${quantity === 1 ? unitLabel.singular : unitLabel.plural}`;
};

const normalizeProductText = (value?: string) => (value || '').trim().toLowerCase();
const removeBrandFromText = (text: string, brand?: string) => {
  if (!brand) return text.trim();
  return text
    .replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '')
    .replace(/\s+/g, ' ')
    .trim();
};
const canonicalProductFamilyName = (value: string, product: POSProduct) => {
  const normalized = normalizeProductText(value);
  const normalizedCategory = normalizeProductText(product.category);
  const searchable = normalizeProductText([
    value,
    product.name,
    product.parentProduct,
    product.variation,
    product.packSize
  ].filter(Boolean).join(' '));

  if (/\bmilk\b/.test(searchable)) return 'Milk';
  if (
    /\b(laptop|laptops|notebook|notebooks)\b/.test(searchable) ||
    (normalizedCategory === 'electronics' && normalized === 'computers')
  ) return 'Laptops';
  if (/\b(smartphone|smartphones|iphone|android phone|mobile phone|mobile phones)\b/.test(searchable)) return 'Mobile Phones';
  return value.trim();
};
const getProductFamilyName = (product: POSProduct) => {
  const rawFamily = product.parentProduct?.trim() || removeBrandFromText(product.name, product.brand) || product.name;
  return canonicalProductFamilyName(rawFamily, product);
};
const getProductGroupKey = (product: POSProduct) => `${normalizeProductText(product.category)}:${normalizeProductText(getProductFamilyName(product))}`;
const uniqueValues = (values: Array<string | undefined>) => Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))));
const defaultPosCategories = [
  'Food/Groceries',
  'Fresh Produce',
  'Apparel',
  'Electronics',
  'Stationery',
  'Beverages',
  'Dairy',
  'Bakery',
  'Snacks',
  'Household',
  'Personal Care',
  'Frozen Foods',
  'Butchery',
  'Supplies'
];
const categoryAliases: Record<string, string[]> = {
  'Food/Groceries': ['food', 'grocery', 'groceries', 'food/groceries'],
  'Fresh Produce': ['fresh produce', 'produce', 'fruits', 'vegetables'],
  Apparel: ['apparel', 'clothing', 'fashion'],
  Electronics: ['electronics', 'electronic'],
  Stationery: ['stationery', 'office supplies'],
  Beverages: ['beverages', 'beverage', 'drinks'],
  Dairy: ['dairy'],
  Bakery: ['bakery'],
  Snacks: ['snacks', 'snack'],
  Household: ['household', 'household goods'],
  'Personal Care': ['personal care', 'health & beauty', 'beauty'],
  'Frozen Foods': ['frozen foods', 'frozen'],
  Butchery: ['butchery', 'meat'],
  Supplies: ['supplies', 'supply']
};
const categoryMatches = (productCategory: string, selectedCategory: string) => {
  if (selectedCategory === 'All') return true;
  const normalizedProductCategory = normalizeProductText(productCategory);
  const aliases = categoryAliases[selectedCategory] || [normalizeProductText(selectedCategory)];
  return aliases.includes(normalizedProductCategory);
};

interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  uom: string;
  stockUnits: number;
  price: number;
  quantity: number;
  tax: number;
  pricingTier: PricingTier;
  subItemId: string;
}

export interface CompletedSaleItem {
  productId: string;
  name: string;
  quantity: number;
  stockUnits: number;
  price: number;
  total: number;
  tax?: number;
}

export interface CompletedSale {
  id: string;
  customer: string;
  customerId?: number;
  customerPhone?: string;
  customerEmail?: string;
  customerAccountReference?: string;
  amount: number;
  cashAmount: number;
  method: string;
  timestamp: Date;
  items: CompletedSaleItem[];
  cashier?: string;
}

export interface DayBalance {
  date: string;
  openingBalance: number;
  closingBalance: number | null;
  status: 'open' | 'closed';
  openedAt?: string | null;
}

interface POSPageProps {
  products: POSProduct[];
  customers: BackendCustomer[];
  dayBalance: DayBalance;
  cashierName: string;
  onTransactionComplete: (sale: CompletedSale) => void;
  onOpenDay: (openingBalance: number) => void;
  onCloseDay: (closingBalance: number) => void;
  cashSalesToday: number;
  cashExpensesToday: number;
}

export function POSPage({
  products,
  customers,
  dayBalance,
  cashierName,
  onTransactionComplete,
  onOpenDay,
  onCloseDay,
  cashSalesToday,
  cashExpensesToday
}: POSPageProps) {
  const { t } = useAppLanguage();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [scannerCode, setScannerCode] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedGridProductId, setExpandedGridProductId] = useState<string | null>(null);
  const [selectedProductGroupKey, setSelectedProductGroupKey] = useState<string | null>(null);
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [selectedSubItemId, setSelectedSubItemId] = useState('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<PricingTier>('retail');
  const [discount, setDiscount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [showMultiPayment, setShowMultiPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState({ 
    id: '', 
    customer: 'Walk-in Customer',
    amount: 0, 
    method: '',
    timestamp: new Date(),
    items: [] as any[],
    subtotal: 0,
    discountAmount: 0,
    tax: 0,
    taxLabel: '0%'
  });
  const [cashTendered, setCashTendered] = useState('');
  const [cashTenderedError, setCashTenderedError] = useState('');
  const appSettings = getStoredAppSettings();
  const isScannerEnabled = appSettings.posSettings.scannerEnabled;

  const customerOptions = [
    { id: 'retail', name: 'Retail Customer', type: 'retail' as PricingTier },
    { id: 'loyal', name: 'Loyalty Customer', type: 'loyal' as PricingTier },
    { id: 'wholesale', name: 'Wholesale Customer', type: 'wholesale' as PricingTier },
    { id: 'corporate', name: 'Corporate Customer', type: 'corporate' as PricingTier }
  ];
  const selectedCustomerData = customerOptions.find(c => c.type === selectedCustomerType) || customerOptions[0];
  const selectedBackendCustomer = undefined;
  const customerType = selectedCustomerData.type;

  const categories = useMemo(() => {
    const categoryCounts = products.reduce<Record<string, number>>((counts, product) => {
      counts[product.category] = (counts[product.category] || 0) + 1;
      return counts;
    }, {});
    const categoryNames = Array.from(new Set([
      ...defaultPosCategories,
      ...Object.keys(categoryCounts)
    ]));

    return [
      { name: 'All', count: products.length },
      ...categoryNames
        .sort((left, right) => left.localeCompare(right))
        .map(name => ({
          name,
          count: defaultPosCategories.includes(name)
            ? products.filter(product => categoryMatches(product.category, name)).length
            : categoryCounts[name] || 0
        }))
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return products.filter(product => {
      const matchesCategory = categoryMatches(product.category, selectedCategory);
      if (!matchesCategory) return false;
      if (!search) return true;

      const searchFields = [
        product.name,
        product.sku,
        product.uom,
        product.category,
        product.brand,
        product.parentProduct,
        product.variation,
        product.packSize,
        product.modelNumber
      ];

      return searchFields.some(field => normalizeProductText(field).includes(search)) ||
        getProductSubItems(product).some(subItem =>
          normalizeProductText(subItem.name).includes(search) ||
          normalizeProductText(subItem.uom).includes(search)
        );
    });
  }, [products, searchTerm, selectedCategory, customerType]);

  const productGroups = useMemo<ProductGroup[]>(() => {
    const groups = filteredProducts.reduce<Map<string, ProductGroup>>((groupMap, product) => {
      const key = getProductGroupKey(product);
      const current = groupMap.get(key) || {
        key,
        name: getProductFamilyName(product),
        category: product.category,
        products: []
      };
      current.products.push(product);
      groupMap.set(key, current);
      return groupMap;
    }, new Map());

    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [filteredProducts]);

  function getProductSubItems(product: POSProduct): ProductSubItem[] {
    const unit = normalizeUnit(product.uom || 'piece');
    const canUseQuantityLevels = Boolean(quantifiableUnitLabels[unit]);
    const savedLevels = (product.quantityLevels || [])
      .filter(level => level.quantity > 0)
      .sort((left, right) => left.quantity - right.quantity);

    if (savedLevels.length > 0) {
      return savedLevels.map(level => ({
        id: `quantity-${level.quantity}`,
        name: level.label || formatQuantityLevel(level.quantity, product.uom),
        uom: product.uom,
        quantityLabel: level.label || formatQuantityLevel(level.quantity, product.uom),
        priceMultiplier: level.quantity,
        stockUnits: level.quantity,
        prices: level.prices
      }));
    }

    if (canUseQuantityLevels) {
      const maxLevel = Math.max(1, Math.min(10, Math.floor(product.stock || 10)));
      return Array.from({ length: maxLevel }, (_, index) => {
        const quantity = index + 1;
        const label = formatQuantityLevel(quantity, product.uom);

        return {
          id: `quantity-${quantity}`,
          name: label,
          uom: product.uom,
          quantityLabel: label,
          priceMultiplier: quantity,
          stockUnits: quantity
        };
      });
    }

    const quantityLabel = formatQuantityLevel(1, product.uom || 'piece');
    return [
      {
        id: 'single',
        name: quantityLabel,
        uom: product.uom,
        quantityLabel,
        priceMultiplier: 1,
        stockUnits: 1
      }
    ];
  }

  const addToCart = (product: POSProduct, subItem = getProductSubItems(product)[0]) => {
    const price = subItem.prices?.[customerType] ?? product.prices[customerType] * subItem.priceMultiplier;
    const cartId = `${product.id}-${subItem.id}-${customerType}`;
    const existingItem = cart.find(item => item.id === cartId);
    const currentReserved = cart
      .filter(item => item.productId === product.id)
      .reduce((sum, item) => sum + (item.stockUnits * item.quantity), 0);

    if (currentReserved + subItem.stockUnits > product.stock) {
      toast.warning('Insufficient stock', {
        description: `Only ${product.stock - currentReserved} ${product.uom} left in stock.`
      });
      return;
    }

    if (existingItem) {
      setCart(cart.map(item =>
        item.id === cartId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
      return;
    }

    setCart([...cart, {
      id: cartId,
      productId: product.id,
      name: `${product.name} - ${subItem.name}`,
      sku: product.sku,
      uom: subItem.quantityLabel,
      stockUnits: subItem.stockUnits,
      price,
      quantity: 1,
      tax: product.tax,
      pricingTier: customerType,
      subItemId: subItem.id
    }]);
  };

  const selectProduct = (product: POSProduct, subItem: ProductSubItem) => {
    addToCart(product, subItem);
    setSearchTerm('');
    setIsProductDropdownOpen(false);
    setExpandedProductId(null);
    setExpandedGridProductId(null);
  };

  const handleProductCardClick = (product: POSProduct) => {
    const subItems = getProductSubItems(product);
    if (subItems.length <= 1) {
      addToCart(product, subItems[0]);
      return;
    }

    setExpandedGridProductId(previous => previous === product.id ? null : product.id);
  };

  const openVariantDrawer = (group: ProductGroup) => {
    const firstProduct = group.products[0];
    setVariantSelections({
      brand: firstProduct.brand || 'Any brand',
      variation: firstProduct.variation || 'Standard',
      packSize: firstProduct.packSize || firstProduct.uom || 'Each'
    });
    setSelectedSubItemId('');
    setSelectedProductGroupKey(group.key);
  };

  const selectedProductGroup = productGroups.find(group => group.key === selectedProductGroupKey) || null;
  const selectedBrand = variantSelections.brand || '';
  const selectedVariation = variantSelections.variation || '';
  const selectedPackSize = variantSelections.packSize || '';
  const brandOptions = selectedProductGroup ? uniqueValues(selectedProductGroup.products.map(product => product.brand || 'Any brand')) : [];
  const variationOptions = selectedProductGroup ? uniqueValues(selectedProductGroup.products.map(product => product.variation || 'Standard')) : [];
  const packSizeOptions = selectedProductGroup ? uniqueValues(selectedProductGroup.products.map(product => product.packSize || product.uom || 'Each')) : [];
  const selectedVariant = selectedProductGroup?.products.find(product =>
    (product.brand || 'Any brand') === selectedBrand &&
    (product.variation || 'Standard') === selectedVariation &&
    (product.packSize || product.uom || 'Each') === selectedPackSize
  ) || selectedProductGroup?.products[0] || null;
  const selectedVariantSubItems = selectedVariant ? getProductSubItems(selectedVariant) : [];
  const selectedSubItem = selectedVariantSubItems.find(subItem => subItem.id === selectedSubItemId) || selectedVariantSubItems[0];
  const selectedSubItemPrice = selectedVariant && selectedSubItem
    ? selectedSubItem.prices?.[customerType] ?? selectedVariant.prices[customerType] * selectedSubItem.priceMultiplier
    : 0;
  const selectedReservedStock = selectedVariant
    ? cart.filter(item => item.productId === selectedVariant.id).reduce((sum, item) => sum + (item.stockUnits * item.quantity), 0)
    : 0;
  const selectedAvailableStock = selectedVariant ? Math.max(0, selectedVariant.stock - selectedReservedStock) : 0;
  const addableSubItem = selectedSubItem && selectedSubItem.stockUnits <= selectedAvailableStock
    ? selectedSubItem
    : selectedVariantSubItems.find(subItem => subItem.stockUnits <= selectedAvailableStock);
  const addableSubItemPrice = selectedVariant && addableSubItem
    ? addableSubItem.prices?.[customerType] ?? selectedVariant.prices[customerType] * addableSubItem.priceMultiplier
    : selectedSubItemPrice;

  const variantOptionAvailable = (key: 'brand' | 'variation' | 'packSize', value: string) => {
    if (!selectedProductGroup) return false;

    return selectedProductGroup.products.some(product => {
      const productBrand = product.brand || 'Any brand';
      const productVariation = product.variation || 'Standard';
      const productPackSize = product.packSize || product.uom || 'Each';

      if (key === 'brand') return productBrand === value;
      if (key === 'variation') return productBrand === selectedBrand && productVariation === value;
      return productBrand === selectedBrand && productVariation === selectedVariation && productPackSize === value;
    });
  };

  const updateVariantSelection = (key: 'brand' | 'variation' | 'packSize', value: string) => {
    if (!selectedProductGroup) return;

    const nextSelections = { ...variantSelections, [key]: value };
    const matchingProduct = selectedProductGroup.products.find(product =>
      (product.brand || 'Any brand') === nextSelections.brand &&
      (product.variation || 'Standard') === nextSelections.variation &&
      (product.packSize || product.uom || 'Each') === nextSelections.packSize
    ) || selectedProductGroup.products.find(product => {
      if (key === 'brand') return (product.brand || 'Any brand') === value;
      if (key === 'variation') return (product.variation || 'Standard') === value;
      return (product.packSize || product.uom || 'Each') === value;
    });

    setVariantSelections(matchingProduct ? {
      brand: matchingProduct.brand || 'Any brand',
      variation: matchingProduct.variation || 'Standard',
      packSize: matchingProduct.packSize || matchingProduct.uom || 'Each'
    } : nextSelections);
    setSelectedSubItemId('');
  };

  const handleScannerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = scannerCode.trim().toLowerCase();
    if (!code) return;

    const scannedProduct = products.find(product =>
      product.sku.toLowerCase() === code ||
      product.id.toLowerCase() === code ||
      product.name.toLowerCase() === code
    );

    if (!scannedProduct) {
      toast.error('Product not found', {
        description: `No product found for barcode/SKU: ${scannerCode}.`
      });
      return;
    }

    addToCart(scannedProduct);
    setScannerCode('');
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.id !== id));
      return;
    }

    const targetItem = cart.find(item => item.id === id);
    const product = targetItem ? products.find(item => item.id === targetItem.productId) : undefined;

    if (targetItem && product) {
      const otherReserved = cart
        .filter(item => item.productId === targetItem.productId && item.id !== id)
        .reduce((sum, item) => sum + (item.stockUnits * item.quantity), 0);

      if (otherReserved + (targetItem.stockUnits * quantity) > product.stock) {
        toast.warning('Insufficient stock', {
          description: `Only ${product.stock - otherReserved} ${product.uom} left in stock.`
        });
        return;
      }
    }

    setCart(cart.map(item =>
      item.id === id ? { ...item, quantity } : item
    ));
  };

  const removeItem = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = subtotal * (discount / 100);
  const beforeTax = subtotal - discountAmount;
  const totalTax = 0;
  const total = beforeTax;
  const taxSummary = (() => {
    const rates = Array.from(new Set(cart.map(item => Number(item.tax) || 0))).sort((left, right) => left - right);
    if (rates.length === 0) return '0%';
    return `${rates.map(rate => `${rate}%`).join(', ')} included`;
  })();
  const change = Math.max(0, parseFloat(cashTendered || '0') - total);

  const handleCompletePayment = (payments: PaymentTransaction[]) => {
    const transactionId = `TXN-${Date.now()}`;
    const paymentMethodLabel = payments.map(p => {
      const methodName = p.method === 'mpesa' ? 'M-Pesa' : p.method.replace('_', ' ');
      return `${methodName}: ${formatCurrency(p.amount)}`;
    }).join(', ');
    const cashAmount = payments
      .filter(payment => payment.method === 'cash')
      .reduce((sum, payment) => sum + payment.amount, 0);

    const receiptItems = cart.map(item => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      uom: item.uom,
      price: item.price,
      tax: item.tax,
      total: item.price * item.quantity
    }));

    const saleItems = cart.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      stockUnits: item.stockUnits,
      price: item.price,
      tax: item.tax,
      total: item.price * item.quantity
    }));

    setLastTransaction({
      id: transactionId,
      customer: selectedCustomerData.name,
      amount: total,
      method: paymentMethodLabel,
      timestamp: new Date(),
      items: receiptItems,
      subtotal: subtotal,
      discountAmount: discountAmount,
      tax: totalTax,
      taxLabel: taxSummary
    });

    onTransactionComplete({
      id: transactionId,
      customer: selectedCustomerData.name,
      customerId: selectedBackendCustomer?.id,
      customerPhone: selectedBackendCustomer?.phone,
      customerEmail: selectedBackendCustomer?.email,
      customerAccountReference: selectedBackendCustomer?.account_reference,
      amount: total,
      cashAmount,
      method: paymentMethodLabel,
      timestamp: new Date(),
      items: saleItems,
      cashier: cashierName
    });

    setIsNotificationOpen(true);
    setShowReceipt(true);
    setCart([]);
    setShowMultiPayment(false);
    setCashTendered('');
    setDiscount(0);
  };

  const handleCashPayment = () => {
    const tenderedAmount = parseFloat(cashTendered || '0');
    if (!cashTendered || tenderedAmount < total) {
      setCashTenderedError(`Cash is short by ${formatCurrency(total - tenderedAmount)}.`);
      return;
    }
    setCashTenderedError('');

    const payments: PaymentTransaction[] = [{
      method: 'cash',
      amount: tenderedAmount,
      timestamp: new Date()
    }];

    handleCompletePayment(payments);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Products Section */}
      <div className="lg:col-span-2">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('Point of Sale')}</h1>
          <div className="mb-4 overflow-x-auto">
            <div className="flex min-w-max gap-2 rounded-lg border border-gray-200 bg-white p-2">
              {categories.map(category => (
                <Button
                  key={category.name}
                  type="button"
                  variant={selectedCategory === category.name ? 'default' : 'outline'}
                  className={selectedCategory === category.name ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white'}
                  onClick={() => {
                    setSelectedCategory(category.name);
                    setExpandedProductId(null);
                    setExpandedGridProductId(null);
                  }}
                >
                  <span className="font-semibold">{category.name}</span>
                  <Badge variant="secondary" className={selectedCategory === category.name ? 'ml-2 bg-white/20 text-white' : 'ml-2'}>
                    {category.count}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>
          {isScannerEnabled && (
            <form onSubmit={handleScannerSubmit} className="mb-3 flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
                <Input
                  value={scannerCode}
                  onChange={(event) => setScannerCode(event.target.value)}
                  placeholder="Scan barcode or enter SKU"
                  className="bg-white pl-10"
                />
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Add
              </Button>
            </form>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
            <Input
              placeholder={t('Search and select a product...')}
              value={searchTerm}
              onFocus={() => setIsProductDropdownOpen(true)}
              onClick={() => setIsProductDropdownOpen(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsProductDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && productGroups.length > 0) {
                  e.preventDefault();
                  openVariantDrawer(productGroups[0]);
                  setIsProductDropdownOpen(false);
                }
                if (e.key === 'Escape') {
                  setIsProductDropdownOpen(false);
                }
              }}
              className="pl-10 bg-white border-gray-200"
            />
            {isProductDropdownOpen && (
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="max-h-80 overflow-y-auto py-1">
                  {productGroups.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">{t('No products found')}</div>
                  ) : (
                    productGroups.map(group => {
                      const representative = group.products[0];
                      const totalStock = group.products.reduce((sum, product) => sum + product.stock, 0);
                      const optionCount = group.products.reduce((sum, product) => sum + getProductSubItems(product).length, 0);
                      return (
                        <div key={group.key} className="border-b border-gray-100 last:border-b-0">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              openVariantDrawer(group);
                              setIsProductDropdownOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                          >
                            <ImageWithFallback
                              src={representative.image}
                              alt={group.name}
                              className="h-10 w-10 rounded object-cover"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900">{group.name}</span>
                              <span className="block truncate text-xs text-gray-500">{group.products.length} SKU{group.products.length === 1 ? '' : 's'} - stock {totalStock}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Badge variant="outline">{group.category}</Badge>
                              <span className="text-xs font-medium text-blue-600">{optionCount} options</span>
                            </span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {productGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            {t('No products found')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {productGroups.map(group => {
              const representative = group.products[0];
              const totalStock = group.products.reduce((sum, product) => sum + product.stock, 0);
              const optionCount = group.products.reduce((sum, product) => sum + getProductSubItems(product).length, 0);
              const startingPrice = Math.min(...group.products.flatMap(product => {
                const subItems = getProductSubItems(product);
                return subItems.map(subItem => subItem.prices?.[customerType] ?? product.prices[customerType] * subItem.priceMultiplier);
              }));

              return (
                <Card
                  key={group.key}
                  className="bg-white border-gray-200 cursor-pointer transition hover:border-blue-300 hover:shadow-lg"
                  onClick={() => openVariantDrawer(group)}
                >
                  <CardContent className="p-4">
                    <div className="relative mb-3">
                      <ImageWithFallback
                        src={representative.image}
                        alt={group.name}
                        className="h-28 w-full rounded-lg object-cover"
                      />
                      <Badge className="absolute right-2 top-2 bg-blue-600 text-white">
                        Multi-variant
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <h3 className="truncate text-sm font-semibold text-gray-900">{group.name}</h3>
                        <p className="truncate text-xs text-gray-500">{group.category} - {group.products.length} SKU{group.products.length === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className={`
                          ${customerType === 'loyal' ? 'bg-purple-100 text-purple-800' : ''}
                          ${customerType === 'wholesale' ? 'bg-blue-100 text-blue-800' : ''}
                          ${customerType === 'corporate' ? 'bg-green-100 text-green-800' : ''}
                          ${customerType === 'retail' ? 'bg-gray-100 text-gray-800' : ''}
                        `}>
                          {customerType.charAt(0).toUpperCase() + customerType.slice(1)}
                        </Badge>
                        <span className="text-sm font-bold text-green-600">From {formatCurrency(startingPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{t('Stock')}: {totalStock}</span>
                        <span>{optionCount} option{optionCount === 1 ? '' : 's'}</span>
                      </div>
                      <Button type="button" variant="outline" className="w-full" onClick={(event) => {
                        event.stopPropagation();
                        openVariantDrawer(group);
                      }}>
                        View Options
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={Boolean(selectedProductGroupKey)} onOpenChange={(open) => {
          if (!open) {
            setSelectedProductGroupKey(null);
            setSelectedSubItemId('');
          }
        }}>
          <DialogContent className="fixed inset-y-0 right-0 left-auto top-0 bottom-0 flex h-[100svh] max-h-[100svh] w-full max-w-lg translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l border-gray-200 bg-white p-0 sm:rounded-none">
            {selectedProductGroup && selectedVariant && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DialogHeader className="shrink-0 border-b border-gray-200 bg-blue-50 px-5 py-4">
                  <DialogTitle className="text-left text-lg text-gray-900">
                    {selectedProductGroup.name} Options
                  </DialogTitle>
                  <p className="text-sm text-gray-600">{selectedProductGroup.category} - choose the stocked variant before adding to cart</p>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                  <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    <ImageWithFallback src={selectedVariant.image} alt={selectedVariant.name} className="h-16 w-16 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{selectedVariant.name}</p>
                      <p className="truncate text-xs text-gray-500">{selectedVariant.sku}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={selectedAvailableStock > 0 ? 'secondary' : 'destructive'}>
                          Stock {selectedAvailableStock}
                        </Badge>
                        <Badge variant="outline">{selectedVariant.uom}</Badge>
                      </div>
                    </div>
                  </div>

                  {brandOptions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Select Brand</p>
                      <div className="flex flex-wrap gap-2">
                        {brandOptions.map(option => (
                          <Button
                            key={option}
                            type="button"
                            disabled={!variantOptionAvailable('brand', option)}
                            variant={selectedBrand === option ? 'default' : 'outline'}
                            className={selectedBrand === option ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white'}
                            onClick={() => updateVariantSelection('brand', option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {variationOptions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Select Type / Graphic / Color</p>
                      <div className="flex flex-wrap gap-2">
                        {variationOptions.map(option => (
                          <Button
                            key={option}
                            type="button"
                            disabled={!variantOptionAvailable('variation', option)}
                            variant={selectedVariation === option ? 'default' : 'outline'}
                            className={selectedVariation === option ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white'}
                            onClick={() => updateVariantSelection('variation', option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {packSizeOptions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Select Pack / Size</p>
                      <div className="flex flex-wrap gap-2">
                        {packSizeOptions.map(option => (
                          <Button
                            key={option}
                            type="button"
                            disabled={!variantOptionAvailable('packSize', option)}
                            variant={selectedPackSize === option ? 'default' : 'outline'}
                            className={selectedPackSize === option ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white'}
                            onClick={() => updateVariantSelection('packSize', option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Select Quantity</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {selectedVariantSubItems.map(subItem => {
                        const optionPrice = subItem.prices?.[customerType] ?? selectedVariant.prices[customerType] * subItem.priceMultiplier;
                        const canUseOption = subItem.stockUnits <= selectedAvailableStock;
                        return (
                          <button
                            key={subItem.id}
                            type="button"
                            disabled={!canUseOption}
                            onClick={() => setSelectedSubItemId(subItem.id)}
                            className={`rounded-md border px-3 py-3 text-left transition ${
                              selectedSubItem?.id === subItem.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 bg-white hover:border-blue-300'
                            } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                          >
                            <span className="block text-sm font-semibold">{subItem.name}</span>
                            <span className="block text-sm font-bold text-green-700">{formatCurrency(optionPrice)}</span>
                            <span className="block text-xs text-gray-500">Stock: {Math.floor(selectedAvailableStock / subItem.stockUnits)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t border-gray-200 bg-white pt-5">
                    <Button
                      type="button"
                      className="min-h-11 flex-1 bg-green-600 text-white hover:bg-green-700"
                      disabled={!addableSubItem}
                      onClick={() => {
                        if (!addableSubItem) {
                          toast.warning('Select an available quantity');
                          return;
                        }
                        addToCart(selectedVariant, addableSubItem);
                        setSelectedProductGroupKey(null);
                        setSelectedSubItemId('');
                      }}
                    >
                      Add to Cart - {formatCurrency(addableSubItemPrice)}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setSelectedProductGroupKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Cart Section */}
      <div className="lg:col-span-1">
        <Card className="bg-white border-gray-200 sticky top-4">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              {t('Cart')} {cart.length > 0 && `(${cart.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Selection */}
            <div>
              <label className="text-sm font-medium text-gray-600 mb-2 block">{t('Customer')}</label>
              <Select value={selectedCustomerType} onValueChange={(value) => setSelectedCustomerType(value as PricingTier)}>
                <SelectTrigger className="bg-gray-100 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customerOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cart Items */}
            <div className="space-y-2 max-h-[32rem] overflow-y-auto border border-gray-200 rounded-lg p-2">
              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">{t('No items in cart')}</p>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-gray-50 p-2 rounded flex justify-between items-center">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-sm font-medium truncate">{item.name}</p>
                      <p className="text-gray-500 text-xs">{formatCurrency(item.price)} / {item.uom}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => updateQuantity(item.id, Math.max(1, Math.floor(Number(event.target.value) || 1)))}
                        className="h-8 w-16 bg-white px-2 text-center text-sm"
                        aria-label={`Quantity for ${item.name}`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-6 h-6 p-0 ml-1"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Discount */}
            {cart.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-600 mb-2 block">{t('Discount')} (%)</label>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.min(100, parseFloat(e.target.value) || 0))}
                  className="bg-gray-100 border-gray-200"
                  min="0"
                  max="100"
                />
              </div>
            )}

            {/* Totals */}
            {cart.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{t('Subtotal')}:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>{t('Discount')} ({discount}%):</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{t('Tax')}:</span>
                  <span>{taxSummary}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 bg-blue-50 p-2 rounded">
                  <span>{t('Total')}:</span>
                  <span>{formatCurrency(total)}</span>
                </div>

                {/* Cash Input */}
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-2 block">{t('Cash Tendered')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh</span>
                    <Input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setCashTendered(nextValue);
                        if (parseFloat(nextValue || '0') >= total) {
                          setCashTenderedError('');
                        }
                      }}
                      className={`pl-12 bg-white ${cashTenderedError ? 'border-red-300 focus-visible:ring-red-300' : 'border-gray-300'}`}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                  {cashTenderedError && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <p className="font-medium">Insufficient cash</p>
                      <p>{cashTenderedError}</p>
                    </div>
                  )}
                </div>

                {change > 0 && (
                  <div className="bg-green-50 border border-green-200 p-2 rounded">
                    <p className="text-xs text-green-700">{t('Change Due')}</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(change)}</p>
                  </div>
                )}

                {/* Payment Buttons */}
                <div className="space-y-2">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={cart.length === 0 || !cashTendered}
                    onClick={handleCashPayment}
                  >
                    <CircleDollarSign className="w-4 h-4 mr-2" />
                    {t('Pay with Cash')}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={cart.length === 0}
                    onClick={() => setShowMultiPayment(true)}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {t('Multi-Payment')}
                  </Button>
                </div>
              </div>
            )}

            {/* Cash Drawer */}
            {cart.length === 0 && (
              <div className="pt-4 border-t border-gray-200">
                <CashDrawer
                  isOpen={isDrawerOpen}
                  onOpenChange={setIsDrawerOpen}
                  cashier={cashierName}
                  dayBalance={dayBalance}
                  cashSalesToday={cashSalesToday}
                  cashExpensesToday={cashExpensesToday}
                  onOpenDay={onOpenDay}
                  onCloseDay={onCloseDay}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction Notification */}
        <TransactionNotification
          isOpen={isNotificationOpen}
          onOpenChange={setIsNotificationOpen}
          amount={lastTransaction.amount}
          paymentMethod={lastTransaction.method}
          transactionId={lastTransaction.id}
        />

        {/* Multi Payment Dialog */}
        <Dialog open={showMultiPayment} onOpenChange={setShowMultiPayment}>
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle>{t('Multi-Payment Checkout')}</DialogTitle>
            </DialogHeader>
            <MultiPaymentHandler
              totalAmount={total}
              customerName={selectedCustomerData.name}
              onComplete={handleCompletePayment}
              onCancel={() => setShowMultiPayment(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Receipt Dialog */}
        <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
          <DialogContent className="bg-white border-gray-200 max-w-lg max-h-[90vh] overflow-y-auto">
            <Receipt
              transactionId={lastTransaction.id}
              timestamp={lastTransaction.timestamp}
              items={lastTransaction.items}
              subtotal={lastTransaction.subtotal}
              discount={discount}
              discountAmount={lastTransaction.discountAmount}
              tax={lastTransaction.tax}
              taxLabel={lastTransaction.taxLabel}
              total={lastTransaction.amount}
              paymentMethod={lastTransaction.method}
              cashier={cashierName}
              customerName={lastTransaction.customer}
              onClose={() => setShowReceipt(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}


