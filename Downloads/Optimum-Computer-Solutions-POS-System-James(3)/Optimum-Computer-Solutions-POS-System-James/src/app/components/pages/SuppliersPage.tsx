import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Textarea } from '../ui/textarea';
import {
  Activity,
  ArrowRight,
  Building,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  CreditCard,
  Edit,
  Eye,
  FileCheck2,
  Filter,
  Mail,
  MoreVertical,
  PackageCheck,
  PackagePlus,
  Phone,
  Plus,
  Search,
  Send,
  Truck,
  Upload,
  Wallet,
  X
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { ReorderRequest, SupplierOrderInvoice, SupplierOrderStatus } from '../../types/supplierOrder';
import type { POSProduct } from './POSPageEnhanced';
import type { BackendSupplier } from '../../services/api';

interface SupplierSummary {
  id: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  balance: number;
  lastPurchase: string;
  totalPurchases: number;
  isActive: boolean;
}

interface SuppliersPageProps {
  products: POSProduct[];
  suppliers: BackendSupplier[];
  supplierInvoices: SupplierOrderInvoice[];
  reorderRequest?: ReorderRequest | null;
  onSupplierCreated: (supplier: Omit<BackendSupplier, 'id'>) => Promise<void>;
  onSupplierOrderSent: (invoice: Omit<SupplierOrderInvoice, 'id'>) => Promise<void>;
  onViewAllSupplierOrders?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const supplierImportColumns = ['name', 'phone', 'email', 'contact_person', 'supplier_type', 'address_line1', 'city', 'county', 'country', 'payment_terms', 'notes'];

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
};

const parseSupplierCsv = (text: string) => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(header => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index]?.trim() || '';
      return row;
    }, {});
  });
};
const eastAfricaLocations = {
  Kenya: {
    regions: [
      'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado',
      'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia',
      'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Muranga', 'Nairobi',
      'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita Taveta', 'Tana River',
      'Tharaka Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
    ],
    cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi', 'Kitale', 'Garissa', 'Nyeri', 'Machakos', 'Meru']
  },
  Uganda: {
    regions: ['Central', 'Eastern', 'Northern', 'Western'],
    cities: ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale', 'Arua', 'Fort Portal', 'Masaka', 'Lira']
  },
  Tanzania: {
    regions: ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Kilimanjaro', 'Mbeya', 'Morogoro', 'Mwanza', 'Pwani', 'Tanga', 'Zanzibar'],
    cities: ['Dar es Salaam', 'Dodoma', 'Arusha', 'Mwanza', 'Mbeya', 'Morogoro', 'Tanga', 'Zanzibar City', 'Moshi', 'Iringa']
  },
  Rwanda: {
    regions: ['Kigali City', 'Eastern Province', 'Northern Province', 'Southern Province', 'Western Province'],
    cities: ['Kigali', 'Butare', 'Gisenyi', 'Ruhengeri', 'Kibuye', 'Cyangugu', 'Byumba', 'Rwamagana']
  },
  Burundi: {
    regions: ['Bubanza', 'Bujumbura Mairie', 'Bujumbura Rural', 'Bururi', 'Gitega', 'Muyinga', 'Ngozi', 'Rumonge'],
    cities: ['Bujumbura', 'Gitega', 'Ngozi', 'Rumonge', 'Muyinga', 'Bururi']
  },
  'South Sudan': {
    regions: ['Central Equatoria', 'Eastern Equatoria', 'Jonglei', 'Lakes', 'Northern Bahr el Ghazal', 'Unity', 'Upper Nile', 'Warrap', 'Western Bahr el Ghazal', 'Western Equatoria'],
    cities: ['Juba', 'Wau', 'Malakal', 'Bor', 'Yei', 'Aweil', 'Rumbek', 'Torit']
  },
  Somalia: {
    regions: ['Banadir', 'Bari', 'Gedo', 'Hiran', 'Lower Juba', 'Lower Shabelle', 'Nugal', 'Sanaag', 'Togdheer', 'Woqooyi Galbeed'],
    cities: ['Mogadishu', 'Hargeisa', 'Kismayo', 'Bosaso', 'Garowe', 'Baidoa', 'Berbera']
  },
  'Democratic Republic of the Congo': {
    regions: ['Kinshasa', 'Kongo Central', 'Kwilu', 'Kasai', 'Kasai Central', 'Kasai Oriental', 'Haut-Katanga', 'North Kivu', 'South Kivu', 'Ituri', 'Tshopo'],
    cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Kisangani', 'Bukavu', 'Matadi', 'Kananga', 'Mbuji-Mayi']
  },
  Ethiopia: {
    regions: ['Addis Ababa', 'Afar', 'Amhara', 'Benishangul-Gumuz', 'Dire Dawa', 'Gambela', 'Harari', 'Oromia', 'Sidama', 'Somali', 'Tigray'],
    cities: ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa', 'Adama', 'Jimma']
  },
  Djibouti: {
    regions: ['Ali Sabieh', 'Arta', 'Dikhil', 'Djibouti', 'Obock', 'Tadjourah'],
    cities: ['Djibouti City', 'Ali Sabieh', 'Tadjourah', 'Dikhil', 'Obock', 'Arta']
  },
  Eritrea: {
    regions: ['Anseba', 'Debub', 'Gash-Barka', 'Maekel', 'Northern Red Sea', 'Southern Red Sea'],
    cities: ['Asmara', 'Keren', 'Massawa', 'Assab', 'Mendefera', 'Barentu']
  },
  Comoros: {
    regions: ['Grande Comore', 'Anjouan', 'Moheli'],
    cities: ['Moroni', 'Mutsamudu', 'Fomboni', 'Domoni']
  },
  Seychelles: {
    regions: ['Mahe', 'Praslin', 'La Digue'],
    cities: ['Victoria', 'Anse Boileau', 'Beau Vallon', 'Baie Sainte Anne']
  }
} satisfies Record<string, { regions: string[]; cities: string[] }>;

const eastAfricaCountries = Object.keys(eastAfricaLocations);

const getSuggestedReorderQuantity = (product?: POSProduct) => {
  if (!product) return 1;
  const reorderLevel = product.reorderLevel || 10;
  return Math.max(1, Math.ceil((reorderLevel * 2) - product.stock));
};
const getSuggestedReorderAmount = (product?: POSProduct, quantity = 1) => {
  const unitCost = product ? product.prices.wholesale || product.prices.retail || 0 : 0;
  return unitCost > 0 ? String(Number((unitCost * quantity).toFixed(2))) : '';
};
const parseSupplierAmount = (value: string) => Number(value.replace(/,/g, '')) || 0;

type PurchaseOrderLineForm = {
  productId: string;
  productName: string;
  sku: string;
  supplierSku: string;
  requestedQuantity: string;
  receivedQuantity: string;
  unitCost: string;
};

const buildPurchaseOrderLine = (product?: POSProduct, quantity = 1): PurchaseOrderLineForm => {
  const unitCost = product?.costPrice || product?.prices.wholesale || (product?.prices.retail ? product.prices.retail * 0.7 : 0);
  return {
    productId: product?.id || '',
    productName: product?.name || 'Product',
    sku: product?.sku || '',
    supplierSku: product?.supplierSku || product?.sku || '',
    requestedQuantity: String(Math.max(1, quantity)),
    receivedQuantity: '',
    unitCost: unitCost ? String(Number(unitCost.toFixed(2))) : ''
  };
};

export function SuppliersPage({ products, suppliers: backendSuppliers, supplierInvoices, reorderRequest, onSupplierCreated, onSupplierOrderSent, onViewAllSupplierOrders }: SuppliersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'withBalance' | 'withOrders'>('all');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [supplierImportFile, setSupplierImportFile] = useState<File | null>(null);
  const [supplierImportMessage, setSupplierImportMessage] = useState('');
  const [supplierImportErrors, setSupplierImportErrors] = useState<string[]>([]);
  const [isImportingSuppliers, setIsImportingSuppliers] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierSummary | null>(null);
  const [orderSupplier, setOrderSupplier] = useState<SupplierSummary | null>(null);
  const [progressDialog, setProgressDialog] = useState<'grn' | 'details' | null>(null);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSendingPurchaseOrder, setIsSendingPurchaseOrder] = useState(false);
  const [supplierSaveError, setSupplierSaveError] = useState('');
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    code: '',
    supplier_type: '',
    supplier_category: '',
    registration_number: '',
    tax_number: '',
    website: '',
    contact_person: '',
    designation: '',
    email: '',
    phone: '',
    alternate_phone: '',
    fax_number: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    postal_code: '',
    country: 'Kenya',
    payment_terms: '30',
    currency: 'KES',
    credit_limit: '',
    preferred_payment_method: '',
    bank_name: '',
    bank_account: '',
    mpesa_paybill: '',
    mpesa_till: '',
    default_warehouse: '',
    minimum_order_amount: '',
    lead_time_days: '',
    notes: '',
    is_active: true,
    is_preferred: false,
    uploaded_documents: [
      { name: 'Business License.pdf', size: '234 KB' },
      { name: 'KRA PIN Certificate.pdf', size: '180 KB' },
      { name: 'Bank Details.pdf', size: '210 KB' }
    ]
  });
  const [orderForm, setOrderForm] = useState({
    date: today(),
    amount: '',
    items: '1',
    productId: '',
    quantityRequested: '1',
    quantityDelivered: '',
    deliveryNote: '',
    goodsReceivingNote: '',
    paymentMethod: 'Credit',
    status: 'requested' as SupplierOrderStatus
  });
  const [orderLines, setOrderLines] = useState<PurchaseOrderLineForm[]>([]);
  const locationOptions = eastAfricaLocations[supplierForm.country as keyof typeof eastAfricaLocations] || eastAfricaLocations.Kenya;

  const invoiceSummaries = supplierInvoices.reduce((map, invoice) => {
      const existing = map.get(invoice.supplierId);
      const pendingBalance = invoice.status === 'requested' || invoice.status === 'pending' ? invoice.amount : 0;
      map.set(invoice.supplierId, {
        id: invoice.supplierId,
        name: invoice.supplierName,
        contact: invoice.contact || 'Not captured',
        email: existing?.email || '',
        phone: existing?.phone || 'Not captured',
        address: existing?.address || '',
        notes: existing?.notes || '',
        balance: (existing?.balance || 0) + pendingBalance,
        lastPurchase: existing && existing.lastPurchase > invoice.date ? existing.lastPurchase : invoice.date,
        totalPurchases: (existing?.totalPurchases || 0) + 1,
        isActive: true
      });
      return map;
    }, new Map<number, SupplierSummary>());

  const suppliers = backendSuppliers.map((supplier) => {
    const summary = invoiceSummaries.get(supplier.id);
    return {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact_person || 'Not captured',
      email: supplier.email || '',
      phone: supplier.phone || 'Not captured',
      address: supplier.address || supplier.address_line1 || '',
      notes: supplier.notes || '',
      balance: summary?.balance || 0,
      lastPurchase: summary?.lastPurchase || 'No purchases yet',
      totalPurchases: summary?.totalPurchases || 0,
      isActive: supplier.is_active !== false
    };
  });

  invoiceSummaries.forEach((summary, supplierId) => {
    if (!backendSuppliers.some(supplier => supplier.id === supplierId)) {
      suppliers.push(summary);
    }
  });

  const getSupplierInvoices = (supplierId: number) =>
    supplierInvoices.filter(invoice => invoice.supplierId === supplierId);

  const getSupplierSummary = (supplier: SupplierSummary) => {
    const invoices = getSupplierInvoices(supplier.id);
    return {
      totalPurchases: supplier.totalPurchases,
      lastPurchase: supplier.lastPurchase,
      balance: supplier.balance,
      requestedItems: invoices.reduce((sum, invoice) => sum + (invoice.quantityRequested || invoice.orderItems?.reduce((itemSum, item) => itemSum + item.requestedQuantity, 0) || 0), 0),
      deliveredItems: invoices.reduce((sum, invoice) => sum + (invoice.quantityDelivered || invoice.orderItems?.reduce((itemSum, item) => itemSum + item.deliveredQuantity, 0) || 0), 0),
      pendingItems: invoices.reduce((sum, invoice) => sum + (invoice.quantityPending || invoice.orderItems?.reduce((itemSum, item) => itemSum + item.pendingQuantity, 0) || 0), 0)
    };
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const summary = getSupplierSummary(supplier);
    const matchesSearch =
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contact.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      supplierStatusFilter === 'all' ||
      (supplierStatusFilter === 'active' && supplier.isActive) ||
      (supplierStatusFilter === 'inactive' && !supplier.isActive);
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'active' && supplier.isActive) ||
      (activeTab === 'withBalance' && summary.balance > 0) ||
      (activeTab === 'withOrders' && summary.totalPurchases > 0);

    return matchesSearch && matchesStatus && matchesTab;
  });

  const supplierStats = {
    total: suppliers.length,
    active: suppliers.filter(supplier => supplier.isActive).length,
    outstanding: suppliers.reduce((sum, supplier) => sum + Math.max(0, getSupplierSummary(supplier).balance), 0),
    orders: suppliers.reduce((sum, supplier) => sum + getSupplierSummary(supplier).totalPurchases, 0),
    delivered: suppliers.reduce((sum, supplier) => sum + getSupplierSummary(supplier).deliveredItems, 0),
    pending: suppliers.reduce((sum, supplier) => sum + getSupplierSummary(supplier).pendingItems, 0)
  };

  const openSupplierInvoices = supplierInvoices.filter(invoice => invoice.status !== 'delivered');
  const latestInvoice = [...openSupplierInvoices].sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestProgress = latestInvoice
    ? Math.round(((latestInvoice.quantityDelivered || latestInvoice.orderItems?.reduce((sum, item) => sum + item.deliveredQuantity, 0) || 0) /
      Math.max(1, latestInvoice.quantityRequested || latestInvoice.orderItems?.reduce((sum, item) => sum + item.requestedQuantity, 0) || 1)) * 100)
    : 0;
  const recentActivities = [...supplierInvoices]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  const getBalanceBadge = (balance: number) => {
    if (balance > 0) return <Badge className="bg-green-500/20 text-green-600">Credit: {formatCurrency(balance)}</Badge>;
    if (balance < 0) return <Badge className="bg-red-500/20 text-red-600">Debt: {formatCurrency(Math.abs(balance))}</Badge>;
    return <Badge variant="secondary">Settled</Badge>;
  };

  const openOrderDialog = (supplier: SupplierSummary) => {
    const defaultProduct = products[0];
    const defaultQuantity = getSuggestedReorderQuantity(defaultProduct);
    const defaultLine = buildPurchaseOrderLine(defaultProduct, defaultQuantity);
    setOrderSupplier(supplier);
    setOrderLines(defaultProduct ? [defaultLine] : []);
    setOrderForm({
      date: today(),
      amount: defaultLine.unitCost ? String(Number(defaultLine.unitCost) * defaultQuantity) : '',
      items: '1',
      productId: defaultProduct?.id || '',
      quantityRequested: String(defaultQuantity),
      quantityDelivered: '',
      deliveryNote: '',
      goodsReceivingNote: '',
      paymentMethod: 'Credit',
      status: 'requested'
    });
  };

  useEffect(() => {
    if (!reorderRequest || suppliers.length === 0) return;

    const requestedProduct = products.find(product => product.id === reorderRequest.productId) || products[0];
    const requestedSupplier =
      suppliers.find(supplier => supplier.id === reorderRequest.supplierId) ||
      suppliers.find(supplier => supplier.name === reorderRequest.supplierName) ||
      suppliers[0];

    setSelectedSupplier(null);
    setOrderSupplier(requestedSupplier);
    const requestItems = reorderRequest.items?.length
      ? reorderRequest.items
      : [{ productId: reorderRequest.productId, quantity: reorderRequest.suggestedQuantity || getSuggestedReorderQuantity(requestedProduct) }];
    const nextLines = requestItems
      .map(item => buildPurchaseOrderLine(products.find(product => product.id === item.productId), item.quantity))
      .filter(line => line.productId);
    setOrderLines(nextLines);
    const suggestedQuantity = nextLines.reduce((sum, line) => sum + (Number(line.requestedQuantity) || 0), 0) || reorderRequest.suggestedQuantity || getSuggestedReorderQuantity(requestedProduct);
    const suggestedAmount = nextLines.reduce((sum, line) => sum + ((Number(line.requestedQuantity) || 0) * (Number(line.unitCost) || 0)), 0);
    setOrderForm({
      date: today(),
      amount: suggestedAmount ? String(Number(suggestedAmount.toFixed(2))) : reorderRequest.suggestedAmount ? String(reorderRequest.suggestedAmount) : getSuggestedReorderAmount(requestedProduct, suggestedQuantity),
      items: String(Math.max(1, nextLines.length)),
      productId: requestedProduct?.id || '',
      quantityRequested: String(suggestedQuantity),
      quantityDelivered: '',
      deliveryNote: '',
      goodsReceivingNote: '',
      paymentMethod: 'Credit',
      status: 'requested'
    });
  }, [reorderRequest?.signal]);

  const resetSupplierForm = () => setSupplierForm({
    name: '',
    code: '',
    supplier_type: '',
    supplier_category: '',
    registration_number: '',
    tax_number: '',
    website: '',
    contact_person: '',
    designation: '',
    email: '',
    phone: '',
    alternate_phone: '',
    fax_number: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    postal_code: '',
    country: 'Kenya',
    payment_terms: '30',
    currency: 'KES',
    credit_limit: '',
    preferred_payment_method: '',
    bank_name: '',
    bank_account: '',
    mpesa_paybill: '',
    mpesa_till: '',
    default_warehouse: '',
    minimum_order_amount: '',
    lead_time_days: '',
    notes: '',
    is_active: true,
    is_preferred: false,
    uploaded_documents: [
      { name: 'Business License.pdf', size: '234 KB' },
      { name: 'KRA PIN Certificate.pdf', size: '180 KB' },
      { name: 'Bank Details.pdf', size: '210 KB' }
    ]
  });

  const handleCreateSupplier = async () => {
    setSupplierSaveError('');
    if (!supplierForm.name.trim() || !supplierForm.phone.trim()) {
      setSupplierSaveError('Supplier name and phone number are required.');
      return;
    }

    setIsSavingSupplier(true);
    try {
      await onSupplierCreated({
        name: supplierForm.name.trim(),
        code: supplierForm.code.trim(),
        supplier_type: supplierForm.supplier_type,
        supplier_category: supplierForm.supplier_category,
        registration_number: supplierForm.registration_number.trim(),
        tax_number: supplierForm.tax_number.trim(),
        website: supplierForm.website.trim(),
        contact_person: supplierForm.contact_person.trim(),
        designation: supplierForm.designation.trim(),
        email: supplierForm.email.trim(),
        phone: supplierForm.phone.trim(),
        alternate_phone: supplierForm.alternate_phone.trim(),
        fax_number: supplierForm.fax_number.trim(),
        address: supplierForm.address_line1.trim(),
        address_line1: supplierForm.address_line1.trim(),
        address_line2: supplierForm.address_line2.trim(),
        city: supplierForm.city.trim(),
        county: supplierForm.county.trim(),
        postal_code: supplierForm.postal_code.trim(),
        country: supplierForm.country,
        payment_terms: Number(supplierForm.payment_terms) || 30,
        currency: supplierForm.currency,
        credit_limit: parseSupplierAmount(supplierForm.credit_limit),
        preferred_payment_method: supplierForm.preferred_payment_method,
        bank_name: supplierForm.bank_name.trim(),
        bank_account: supplierForm.bank_account.trim(),
        mpesa_paybill: supplierForm.mpesa_paybill.trim(),
        mpesa_till: supplierForm.mpesa_till.trim(),
        default_warehouse: supplierForm.default_warehouse,
        minimum_order_amount: parseSupplierAmount(supplierForm.minimum_order_amount),
        lead_time_days: Number(supplierForm.lead_time_days) || 0,
        uploaded_documents: supplierForm.uploaded_documents,
        notes: supplierForm.notes.trim(),
        is_active: supplierForm.is_active,
        is_preferred: supplierForm.is_preferred
      });
      resetSupplierForm();
      setIsAddDialogOpen(false);
    } catch (error) {
      setSupplierSaveError(error instanceof Error ? error.message : 'Supplier could not be saved.');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const resetSupplierImport = () => {
    setSupplierImportFile(null);
    setSupplierImportMessage('');
    setSupplierImportErrors([]);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleImportSuppliers = async () => {
    setSupplierImportMessage('');
    setSupplierImportErrors([]);

    if (!supplierImportFile) {
      setSupplierImportErrors(['Choose a CSV file first.']);
      return;
    }

    if (!supplierImportFile.name.toLowerCase().endsWith('.csv')) {
      setSupplierImportErrors(['Supplier import currently supports CSV files.']);
      return;
    }

    setIsImportingSuppliers(true);
    try {
      const rows = parseSupplierCsv(await supplierImportFile.text());
      if (rows.length === 0) {
        setSupplierImportErrors(['The CSV file has no supplier rows.']);
        return;
      }

      const errors: string[] = [];
      let created = 0;

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const name = row.name || row.supplier || row.supplier_name || '';
        const phone = row.phone || row.phone_number || row.contact_phone || '';

        if (!name.trim() || !phone.trim()) {
          errors.push(`Row ${rowNumber}: supplier name and phone are required.`);
          continue;
        }

        try {
          await onSupplierCreated({
            name: name.trim(),
            code: row.code || '',
            phone: phone.trim(),
            email: row.email || '',
            contact_person: row.contact_person || row.contact || '',
            designation: row.designation || '',
            supplier_type: row.supplier_type || '',
            supplier_category: row.supplier_category || '',
            registration_number: row.registration_number || '',
            tax_number: row.tax_number || '',
            website: row.website || '',
            address: row.address || row.address_line1 || '',
            address_line1: row.address_line1 || row.address || '',
            address_line2: row.address_line2 || '',
            city: row.city || '',
            county: row.county || '',
            postal_code: row.postal_code || '',
            country: row.country || 'Kenya',
            payment_terms: Number(row.payment_terms) || 30,
            currency: row.currency || 'KES',
            credit_limit: parseSupplierAmount(row.credit_limit || ''),
            preferred_payment_method: row.preferred_payment_method || '',
            bank_name: row.bank_name || '',
            bank_account: row.bank_account || '',
            mpesa_paybill: row.mpesa_paybill || '',
            mpesa_till: row.mpesa_till || '',
            default_warehouse: row.default_warehouse || '',
            minimum_order_amount: parseSupplierAmount(row.minimum_order_amount || ''),
            lead_time_days: Number(row.lead_time_days) || 0,
            notes: row.notes || '',
            is_active: row.is_active ? row.is_active.toLowerCase() !== 'false' : true,
            is_preferred: row.is_preferred ? row.is_preferred.toLowerCase() === 'true' : false,
            uploaded_documents: []
          });
          created += 1;
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'could not be imported.'}`);
        }
      }

      setSupplierImportErrors(errors);
      setSupplierImportMessage(`Imported ${created} supplier${created === 1 ? '' : 's'}.`);
      if (created > 0 && errors.length === 0) {
        resetSupplierImport();
        setIsImportDialogOpen(false);
      }
    } finally {
      setIsImportingSuppliers(false);
    }
  };

  const updateOrderLine = (index: number, changes: Partial<PurchaseOrderLineForm>) => {
    setOrderLines(previousLines => previousLines.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...changes } : line
    )));
  };

  const getProductsForSupplier = (supplier?: SupplierSummary | null) => {
    if (!supplier) return products;
    const linkedProducts = products.filter(product =>
      product.supplierId === supplier.id || product.supplierName === supplier.name
    );
    return linkedProducts.length > 0 ? linkedProducts : products;
  };

  const addOrderLine = (productId?: string) => {
    const supplierProducts = getProductsForSupplier(orderSupplier);
    const selectedProduct = supplierProducts.find(product => product.id === productId)
      || supplierProducts.find(product => !orderLines.some(line => line.productId === product.id))
      || supplierProducts[0];

    if (!selectedProduct) return;

    setOrderLines(previousLines => [
      ...previousLines,
      buildPurchaseOrderLine(selectedProduct, getSuggestedReorderQuantity(selectedProduct))
    ]);
  };

  const removeOrderLine = (index: number) => {
    setOrderLines(previousLines => previousLines.filter((_, lineIndex) => lineIndex !== index));
  };

  const orderLineItems = orderLines.map(line => {
    const requestedQuantity = Math.max(0, Number(line.requestedQuantity) || 0);
    const deliveredQuantity = orderForm.status === 'delivered'
      ? Math.min(requestedQuantity, Math.max(0, Number(line.receivedQuantity || line.requestedQuantity) || 0))
      : 0;
    const unitCost = Math.max(0, Number(line.unitCost) || 0);
    return {
      ...line,
      requestedQuantity,
      deliveredQuantity,
      pendingQuantity: Math.max(0, requestedQuantity - deliveredQuantity),
      unitCost,
      lineTotal: requestedQuantity * unitCost
    };
  });
  const orderTotal = orderLineItems.reduce((sum, line) => sum + line.lineTotal, 0);
  const orderRequestedQuantity = orderLineItems.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const orderDeliveredQuantity = orderLineItems.reduce((sum, line) => sum + line.deliveredQuantity, 0);
  const orderHasValidLines = orderLineItems.length > 0 && orderLineItems.every(line =>
    line.productId && line.requestedQuantity > 0 && line.unitCost >= 0
  );
  const orderSupplierProducts = getProductsForSupplier(orderSupplier);
  const availableOrderProducts = orderSupplierProducts.filter(product =>
    !orderLines.some(line => line.productId === product.id)
  );

  const handleEmailSupplier = () => {
    if (!orderSupplier) return;
    if (!orderHasValidLines) {
      alert('Add at least one product with a valid quantity before sending the purchase order.');
      return;
    }
    if (onSupplierOrderSent) {
      setIsSendingPurchaseOrder(true);
      onSupplierOrderSent(buildOrderInvoice('requested'))
        .then(() => {
          setOrderSupplier(null);
          setOrderLines([]);
        })
        .catch((error) => {
          alert(error instanceof Error ? error.message : 'Purchase order could not be emailed.');
        })
        .finally(() => setIsSendingPurchaseOrder(false));
      return;
    }
    const subject = encodeURIComponent(`Purchase Order - ${orderForm.date || today()}`);
    const body = encodeURIComponent(`Hello ${orderSupplier.name},\n\nPlease find the purchase order summary below. A PDF/download copy can be generated from the POS admin dashboard.\n\nItems:\n${orderLineItems.map(line => `- ${line.productName} (${line.supplierSku || line.sku}): ${line.requestedQuantity} x ${formatCurrency(line.unitCost)} = ${formatCurrency(line.lineTotal)}`).join('\n')}\n\nTotal: ${formatCurrency(orderTotal)}\n\nRegards`);
    window.location.href = `mailto:${orderSupplier.email || ''}?subject=${subject}&body=${body}`;
  };

  const buildOrderInvoice = (status: SupplierOrderStatus = orderForm.status): Omit<SupplierOrderInvoice, 'id'> => {
    const amount = Number(orderTotal.toFixed(2));
    const items = Math.max(1, orderLineItems.length);
    const quantityRequested = Math.max(1, orderRequestedQuantity);
    const quantityDelivered = status === 'delivered' ? orderDeliveredQuantity : 0;
    const deliveredProduct = products.find(product => product.id === (orderLineItems[0]?.productId || orderForm.productId)) || products[0];
    const nextGrnNumber = status === 'delivered' ? orderForm.goodsReceivingNote.trim() || `GRN-${Date.now()}` : undefined;

    return {
      supplierId: orderSupplier!.id,
      supplierName: orderSupplier!.name,
      contact: orderSupplier!.contact,
      date: orderForm.date || today(),
      amount,
      status,
      items,
      paymentMethod: orderForm.paymentMethod,
      deliveryNote: orderForm.deliveryNote.trim() || undefined,
      productId: deliveredProduct?.id,
      productName: deliveredProduct?.name,
      quantityRequested,
      quantityDelivered,
      quantityPending: Math.max(0, quantityRequested - quantityDelivered),
      orderItems: orderLineItems.map(line => ({
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        supplierSku: line.supplierSku,
        requestedQuantity: line.requestedQuantity,
        deliveredQuantity: line.deliveredQuantity,
        pendingQuantity: line.pendingQuantity,
        unitCost: line.unitCost
      })),
      goodsReceivingNote: nextGrnNumber
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Suppliers</h1>
          <p className="text-gray-500">Manage supplier contacts, orders, balances, and receiving activity</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setSupplierSaveError('');
            setIsAddDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden border-gray-200 bg-white p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-[1280px]">
              <DialogHeader className="border-b border-gray-200 px-6 py-5">
                <DialogTitle className="text-gray-900">Add New Supplier</DialogTitle>
              </DialogHeader>
              <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-6 py-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-blue-500/20 p-2 text-blue-600"><Building className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Basic Information</h3>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Supplier Name <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. Brookside Dairy Limited" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Supplier Code</label>
                          <Input placeholder="e.g. SUP-001" value={supplierForm.code} onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                          <p className="mt-1 text-xs text-gray-500">Unique code for internal reference</p>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Supplier Type</label>
                          <select value={supplierForm.supplier_type} onChange={(e) => setSupplierForm({ ...supplierForm, supplier_type: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select type</option>
                            <option value="manufacturer">Manufacturer</option>
                            <option value="distributor">Distributor</option>
                            <option value="wholesaler">Wholesaler</option>
                            <option value="service_provider">Service Provider</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Company Registration No.</label>
                          <Input placeholder="e.g. CR12/3456" value={supplierForm.registration_number} onChange={(e) => setSupplierForm({ ...supplierForm, registration_number: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Tax / VAT Number</label>
                          <Input placeholder="e.g. P051234567Z" value={supplierForm.tax_number} onChange={(e) => setSupplierForm({ ...supplierForm, tax_number: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Website</label>
                          <Input placeholder="e.g. www.brookside.co.ke" value={supplierForm.website} onChange={(e) => setSupplierForm({ ...supplierForm, website: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-blue-500/20 p-2 text-blue-600"><Phone className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Contact Information</h3>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Contact Person <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. John Mwangi" value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Designation</label>
                          <Input placeholder="e.g. Sales Manager" value={supplierForm.designation} onChange={(e) => setSupplierForm({ ...supplierForm, designation: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Email <span className="text-red-500">*</span></label>
                          <Input type="email" placeholder="e.g. john@brookside.co.ke" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Phone Number <span className="text-red-500">*</span></label>
                          <Input placeholder="+254 7 123 45678" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Alternate Phone</label>
                          <Input placeholder="+254 7 987 65432" value={supplierForm.alternate_phone} onChange={(e) => setSupplierForm({ ...supplierForm, alternate_phone: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Fax Number</label>
                          <Input placeholder="+254 20 1234567" value={supplierForm.fax_number} onChange={(e) => setSupplierForm({ ...supplierForm, fax_number: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-blue-500/20 p-2 text-blue-600"><Building className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Address Information</h3>
                      </div>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-medium text-gray-600">Address Line 1 <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. 1 Brookside Drive" value={supplierForm.address_line1} onChange={(e) => setSupplierForm({ ...supplierForm, address_line1: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-medium text-gray-600">Address Line 2</label>
                          <Input placeholder="e.g. Off Thika Road" value={supplierForm.address_line2} onChange={(e) => setSupplierForm({ ...supplierForm, address_line2: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">City <span className="text-red-500">*</span></label>
                          <select value={supplierForm.city} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select city</option>
                            {locationOptions.cities.map(city => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">State / County <span className="text-red-500">*</span></label>
                          <select value={supplierForm.county} onChange={(e) => setSupplierForm({ ...supplierForm, county: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select state / county</option>
                            {locationOptions.regions.map(region => (
                              <option key={region} value={region}>{region}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Postal Code <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. 00100" value={supplierForm.postal_code} onChange={(e) => setSupplierForm({ ...supplierForm, postal_code: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Country <span className="text-red-500">*</span></label>
                          <select
                            value={supplierForm.country}
                            onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value, county: '', city: '' })}
                            className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                          >
                            {eastAfricaCountries.map(country => (
                              <option key={country} value={country}>{country}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-blue-500/20 p-2 text-blue-600"><CreditCard className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Business & Payment Information</h3>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Payment Terms <span className="text-red-500">*</span></label>
                          <select value={supplierForm.payment_terms} onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="0">Due on receipt</option>
                            <option value="15">15 Days</option>
                            <option value="30">30 Days</option>
                            <option value="60">60 Days</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Currency <span className="text-red-500">*</span></label>
                          <select value={supplierForm.currency} onChange={(e) => setSupplierForm({ ...supplierForm, currency: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="KES">KES - Kenyan Shilling</option>
                            <option value="USD">USD - US Dollar</option>
                            <option value="UGX">UGX - Ugandan Shilling</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Credit Limit (KES)</label>
                          <Input placeholder="e.g. 500,000.00" value={supplierForm.credit_limit} onChange={(e) => setSupplierForm({ ...supplierForm, credit_limit: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Preferred Payment Method</label>
                          <select value={supplierForm.preferred_payment_method} onChange={(e) => setSupplierForm({ ...supplierForm, preferred_payment_method: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select payment method</option>
                            <option>Bank Transfer</option>
                            <option>M-Pesa</option>
                            <option>Cash</option>
                            <option>Cheque</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Bank Name</label>
                          <Input placeholder="e.g. KCB Bank" value={supplierForm.bank_name} onChange={(e) => setSupplierForm({ ...supplierForm, bank_name: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Bank Account Number</label>
                          <Input placeholder="e.g. 1234567890" value={supplierForm.bank_account} onChange={(e) => setSupplierForm({ ...supplierForm, bank_account: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">MPESA Paybill (Optional)</label>
                          <Input placeholder="e.g. 123456" value={supplierForm.mpesa_paybill} onChange={(e) => setSupplierForm({ ...supplierForm, mpesa_paybill: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">MPESA Till Number (Optional)</label>
                          <Input placeholder="e.g. 987654" value={supplierForm.mpesa_till} onChange={(e) => setSupplierForm({ ...supplierForm, mpesa_till: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Default Warehouse / Store</label>
                          <select value={supplierForm.default_warehouse} onChange={(e) => setSupplierForm({ ...supplierForm, default_warehouse: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select warehouse / store</option>
                            <option>Main Warehouse</option>
                            <option>Main Store</option>
                            <option>Branch Store</option>
                          </select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  </div>

                  <div className="space-y-4">
                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-purple-500/20 p-2 text-purple-600"><ClipboardList className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Additional Information</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-600">Supplier Category</label>
                            <select value={supplierForm.supplier_category} onChange={(e) => setSupplierForm({ ...supplierForm, supplier_category: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                              <option value="">Select category</option>
                              <option>Dairy</option>
                              <option>Beverages</option>
                              <option>Produce</option>
                              <option>General Merchandise</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-600">Lead Time (Days)</label>
                            <Input placeholder="e.g. 3" value={supplierForm.lead_time_days} onChange={(e) => setSupplierForm({ ...supplierForm, lead_time_days: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Minimum Order Amount (KES)</label>
                          <Input placeholder="e.g. 10,000.00" value={supplierForm.minimum_order_amount} onChange={(e) => setSupplierForm({ ...supplierForm, minimum_order_amount: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Notes</label>
                          <Textarea maxLength={500} placeholder="Any additional notes about this supplier..." value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} className="min-h-24 bg-gray-100 border-gray-200 text-gray-900" />
                          <p className="mt-1 text-right text-xs text-gray-500">{supplierForm.notes.length} / 500</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-purple-500/20 p-2 text-purple-600"><FileCheck2 className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Documents</h3>
                      </div>
                      <div className="rounded-md border border-dashed border-gray-300 p-6 text-center">
                        <Upload className="mx-auto mb-3 h-8 w-8 text-gray-500" />
                        <p className="font-medium text-gray-900">Upload Documents</p>
                        <p className="text-xs text-gray-500">Upload supplier related documents</p>
                        <Button variant="outline" className="mt-4">Choose Files</Button>
                      </div>
                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-medium text-gray-900">Uploaded Documents</p>
                        {supplierForm.uploaded_documents.map((document) => (
                          <div key={document.name} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2 text-gray-900">
                              <FileCheck2 className="h-4 w-4 shrink-0 text-blue-600" />
                              <span className="truncate">{document.name}</span>
                            </span>
                            <span className="shrink-0 text-gray-500">{document.size}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-md bg-blue-500/20 p-2 text-blue-600"><CheckCircle className="h-4 w-4" /></div>
                        <h3 className="font-semibold text-gray-900">Status</h3>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Supplier Status <span className="text-red-500">*</span></label>
                          <select value={supplierForm.is_active ? 'active' : 'inactive'} onChange={(e) => setSupplierForm({ ...supplierForm, is_active: e.target.value === 'active' })} className="h-9 w-full rounded-md border border-green-200 bg-green-50 px-3 text-sm text-green-700">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                          <p className="mt-1 text-xs text-gray-500">Only active suppliers can be used for purchases</p>
                        </div>
                        <label className="flex items-center gap-3 text-sm text-gray-600">
                          <input type="checkbox" checked={supplierForm.is_preferred} onChange={(e) => setSupplierForm({ ...supplierForm, is_preferred: e.target.checked })} />
                          Set as default supplier for quick selection
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-white px-6 py-4">
                {supplierSaveError && (
                  <p className="mr-auto self-center text-sm text-red-600">{supplierSaveError}</p>
                )}
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateSupplier} disabled={isSavingSupplier || !supplierForm.name.trim() || !supplierForm.phone.trim()}>
                  {isSavingSupplier ? 'Saving...' : 'Save Supplier'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
            setIsImportDialogOpen(open);
            if (!open && !isImportingSuppliers) resetSupplierImport();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200 max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-gray-900">Import Suppliers</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Upload a CSV file. Required columns are <strong>name</strong> and <strong>phone</strong>.
                </div>
                <Input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="bg-gray-100 border-gray-200"
                  onChange={(event) => {
                    setSupplierImportFile(event.target.files?.[0] || null);
                    setSupplierImportMessage('');
                    setSupplierImportErrors([]);
                  }}
                />
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">Supported columns</p>
                  <p className="mt-1 text-xs text-gray-500">{supplierImportColumns.join(', ')}</p>
                </div>
                {supplierImportMessage && <p className="text-sm text-green-700">{supplierImportMessage}</p>}
                {supplierImportErrors.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {supplierImportErrors.map(error => <p key={error}>{error}</p>)}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleImportSuppliers} disabled={isImportingSuppliers}>
                    {isImportingSuppliers ? 'Importing...' : 'Import Suppliers'}
                  </Button>
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)} disabled={isImportingSuppliers}>Cancel</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: 'Total Suppliers', value: supplierStats.total, hint: 'All time', icon: Building, iconClass: 'bg-blue-500/20 text-blue-600' },
          { label: 'Active', value: supplierStats.active, hint: `${supplierStats.total ? Math.round((supplierStats.active / supplierStats.total) * 100) : 0}%`, icon: CheckCircle, iconClass: 'bg-green-500/20 text-green-600' },
          { label: 'With Orders', value: supplierStats.orders, hint: 'Purchase records', icon: ClipboardList, iconClass: 'bg-purple-500/20 text-purple-600' },
          { label: 'Pending Items', value: supplierStats.pending, hint: 'Awaiting receipt', icon: Truck, iconClass: 'bg-orange-500/20 text-orange-600' },
          { label: 'Delivered Items', value: supplierStats.delivered, hint: 'Received stock', icon: PackageCheck, iconClass: 'bg-teal-500/20 text-teal-600' },
          { label: 'Outstanding', value: formatCurrency(supplierStats.outstanding), hint: 'Supplier balance', icon: Wallet, iconClass: 'bg-red-500/20 text-red-600' }
        ].map((stat) => (
          <Card key={stat.label} className="bg-white border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`rounded-full p-3 ${stat.iconClass}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="break-words text-xl font-semibold leading-tight text-gray-900 2xl:text-2xl">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.hint}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-6">
          <Card className="bg-white border-gray-200">
            <CardContent className="p-0">
              <div className="flex overflow-x-auto border-b border-gray-200 px-4">
                {[
                  { key: 'all', label: 'All Suppliers' },
                  { key: 'active', label: 'Active' },
                  { key: 'withBalance', label: 'With Balance' },
                  { key: 'withOrders', label: 'With Orders' }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    className={`border-b-2 px-4 py-4 text-sm font-medium ${
                      activeTab === tab.key
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 border-b border-gray-200 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    placeholder="Search supplier, contact, email or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-100 border-gray-200 text-gray-900"
                  />
                </div>
                <select
                  value={supplierStatusFilter}
                  onChange={(e) => setSupplierStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <div className="flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600">
                  <CalendarDays className="h-4 w-4" />
                  This month
                </div>
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  More Filters
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-600">Supplier</TableHead>
                      <TableHead className="text-gray-600">Contact</TableHead>
                      <TableHead className="text-gray-600">Status</TableHead>
                      <TableHead className="text-gray-600">Items</TableHead>
                      <TableHead className="text-gray-600">Purchases</TableHead>
                      <TableHead className="text-gray-600">Balance</TableHead>
                      <TableHead className="text-gray-600">Last Purchase</TableHead>
                      <TableHead className="text-gray-600">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map(supplier => (
                      <TableRow key={supplier.id} className="border-gray-200">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${supplier.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="font-medium text-blue-600">{supplier.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-600">
                            <div>{supplier.contact}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {supplier.email || 'No email'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {supplier.phone}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={supplier.isActive ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-500'}>
                            {supplier.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          <div>Req: {getSupplierSummary(supplier).requestedItems}</div>
                          <div className="text-green-600">Del: {getSupplierSummary(supplier).deliveredItems}</div>
                          <div className="text-orange-600">Pend: {getSupplierSummary(supplier).pendingItems}</div>
                        </TableCell>
                        <TableCell className="text-gray-600">{getSupplierSummary(supplier).totalPurchases}</TableCell>
                        <TableCell>{getBalanceBadge(getSupplierSummary(supplier).balance)}</TableCell>
                        <TableCell className="text-gray-600">{getSupplierSummary(supplier).lastPurchase}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" aria-label={`Open actions for ${supplier.name}`}>
                              <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 bg-white">
                              <DropdownMenuItem onClick={() => openOrderDialog(supplier)}>
                                <PackagePlus className="h-4 w-4 text-orange-600" />
                                Record Order
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSelectedSupplier(supplier)}>
                                <Eye className="h-4 w-4 text-blue-600" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 text-green-600" />
                                Edit Supplier
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {filteredSuppliers.length ? 1 : 0} to {filteredSuppliers.length} of {suppliers.length} suppliers</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled>1</Button>
                  <Button size="sm" variant="outline">10 / page</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardContent className="p-4">
              <h2 className="mb-4 font-semibold text-gray-900">Supplier Process Flow</h2>
              <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
                {[
                  { label: 'Add Supplier', hint: 'Capture contact', icon: Building, className: 'bg-green-500/20 text-green-600' },
                  { label: 'Create Order', hint: 'Request items', icon: ClipboardList, className: 'bg-purple-500/20 text-purple-600' },
                  { label: 'Notify Supplier', hint: 'Send request', icon: Send, className: 'bg-blue-500/20 text-blue-600' },
                  { label: 'Receive Goods', hint: 'Record GRN', icon: FileCheck2, className: 'bg-orange-500/20 text-orange-600' },
                  { label: 'Make Payment', hint: 'Clear balance', icon: CreditCard, className: 'bg-teal-500/20 text-teal-600' }
                ].map((step, index, steps) => (
                  <React.Fragment key={step.label}>
                    <div className="flex flex-col items-center text-center">
                      <div className={`mb-2 rounded-full p-4 ${step.className}`}>
                        <step.icon className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">{step.label}</p>
                      <p className="text-xs text-gray-500">{step.hint}</p>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="hidden items-center text-gray-400 md:flex">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-gray-900">Recent Supplier Progress</CardTitle>
              <Button variant="ghost" size="sm" className="text-blue-600" onClick={onViewAllSupplierOrders}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestInvoice ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{latestInvoice.id}</p>
                      <p className="mt-1 text-sm text-gray-500">{latestInvoice.supplierName}</p>
                    </div>
                    <Badge className={latestInvoice.status === 'delivered' ? 'bg-green-500/20 text-green-600' : 'bg-orange-500/20 text-orange-600'}>
                      {latestInvoice.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Order Date</p>
                      <p className="font-medium text-gray-900">{latestInvoice.date}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Amount</p>
                      <p className="font-medium text-gray-900">{formatCurrency(latestInvoice.amount)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Requested</p>
                      <p className="font-medium text-gray-900">{latestInvoice.quantityRequested || latestInvoice.items}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Received</p>
                      <p className="font-medium text-gray-900">{latestInvoice.quantityDelivered || 0}</p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-gray-500">Receiving progress</span>
                      <span className="font-medium text-green-600">{latestProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, latestProgress)}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setProgressDialog('grn')}>View GRN</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setProgressDialog('details')}>View Details</Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No supplier orders recorded yet.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900">Workflow Guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ['1. Add Supplier', 'Save contact and terms'],
                  ['2. Record Order', 'Request items from supplier'],
                  ['3. Receive Goods', 'Capture delivered quantity'],
                  ['4. Match Notes', 'Attach delivery note or GRN'],
                  ['5. Make Payment', 'Process supplier payment']
                ].map(([title, detail], index) => (
                  <div key={title} className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-600">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500">{detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-gray-900">Recent Activity</CardTitle>
                <Button variant="ghost" size="sm" className="text-blue-600">View all</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentActivities.length > 0 ? recentActivities.map((invoice) => (
                  <div key={invoice.id} className="flex gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-600">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{invoice.id} {invoice.status}</p>
                      <p className="text-xs text-gray-500">{invoice.supplierName} - {invoice.date}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No recent supplier activity.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {latestInvoice && (
        <Dialog open={progressDialog === 'grn'} onOpenChange={() => setProgressDialog(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Goods Receiving Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{latestInvoice.goodsReceivingNote || 'GRN Pending'}</p>
                    <p className="text-gray-500">{latestInvoice.id}</p>
                  </div>
                  <Badge className={latestInvoice.goodsReceivingNote ? 'bg-green-500/20 text-green-600' : 'bg-orange-500/20 text-orange-600'}>
                    {latestInvoice.goodsReceivingNote ? 'Created' : 'Pending'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-500">Supplier</p>
                  <p className="font-medium text-gray-900">{latestInvoice.supplierName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Order Date</p>
                  <p className="font-medium text-gray-900">{latestInvoice.date}</p>
                </div>
                <div>
                  <p className="text-gray-500">Delivery Note</p>
                  <p className="font-medium text-gray-900">{latestInvoice.deliveryNote || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Received</p>
                  <p className="font-medium text-gray-900">{latestInvoice.quantityDelivered || 0} of {latestInvoice.quantityRequested || latestInvoice.items}</p>
                </div>
              </div>

              {!latestInvoice.goodsReceivingNote && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-700">
                  A GRN will be available after goods are received for this order.
                </div>
              )}

              <Button className="w-full" variant="outline" onClick={() => setProgressDialog(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {latestInvoice && (
        <Dialog open={progressDialog === 'details'} onOpenChange={() => setProgressDialog(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Supplier Order Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                <div>
                  <p className="font-semibold text-gray-900">{latestInvoice.id}</p>
                  <p className="text-gray-500">{latestInvoice.supplierName}</p>
                </div>
                <Badge className={latestInvoice.status === 'delivered' ? 'bg-green-500/20 text-green-600' : 'bg-orange-500/20 text-orange-600'}>
                  {latestInvoice.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-500">Contact</p>
                  <p className="font-medium text-gray-900">{latestInvoice.contact || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Amount</p>
                  <p className="font-medium text-gray-900">{formatCurrency(latestInvoice.amount)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment Method</p>
                  <p className="font-medium text-gray-900">{latestInvoice.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-gray-500">Product</p>
                  <p className="font-medium text-gray-900">{latestInvoice.productName || 'Multiple items'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Requested</p>
                  <p className="font-medium text-gray-900">{latestInvoice.quantityRequested || latestInvoice.items}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pending</p>
                  <p className="font-medium text-gray-900">{latestInvoice.quantityPending ?? Math.max(0, (latestInvoice.quantityRequested || latestInvoice.items) - (latestInvoice.quantityDelivered || 0))}</p>
                </div>
              </div>

              {latestInvoice.orderItems && latestInvoice.orderItems.length > 0 && (
                <div className="rounded-md border border-gray-200">
                  {latestInvoice.orderItems.map((item) => (
                    <div key={`${item.productId}-${item.productName}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-gray-200 px-3 py-2 last:border-b-0">
                      <div>
                        <p className="font-medium text-gray-900">{item.productName}</p>
                        <p className="text-xs text-gray-500">Unit cost {formatCurrency(item.unitCost)}</p>
                      </div>
                      <div className="text-right text-xs text-gray-600">
                        <p>Req: {item.requestedQuantity}</p>
                        <p className="text-green-600">Rec: {item.deliveredQuantity}</p>
                        <p className="text-orange-600">Pend: {item.pendingQuantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={() => setProgressDialog(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Supplier Detail Dialog */}
      {selectedSupplier && (
        <Dialog open={!!selectedSupplier} onOpenChange={() => setSelectedSupplier(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Supplier Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="text-gray-900 font-semibold text-lg">{selectedSupplier.name}</h3>
                <p className="text-gray-500">{selectedSupplier.contact}</p>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  {selectedSupplier.email}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  {selectedSupplier.phone}
                </div>
                {selectedSupplier.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <Building className="w-4 h-4 mt-0.5" />
                    {selectedSupplier.address}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <p className="text-gray-500 text-xs">Total Purchases</p>
                  <p className="text-gray-900 font-semibold">{getSupplierSummary(selectedSupplier).totalPurchases}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Current Balance</p>
                  <p className={`font-semibold ${getSupplierSummary(selectedSupplier).balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(getSupplierSummary(selectedSupplier).balance))}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs">Last Purchase</p>
                  <p className="text-gray-900 font-semibold">{getSupplierSummary(selectedSupplier).lastPurchase}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => openOrderDialog(selectedSupplier)}>
                  Record Order
                </Button>
                <Button variant="outline" onClick={() => setSelectedSupplier(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {orderSupplier && (
        <Dialog open={!!orderSupplier} onOpenChange={() => setOrderSupplier(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-5xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Purchase Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-gray-900 font-medium">{orderSupplier.name}</p>
                <p className="text-sm text-gray-500">{orderSupplier.contact}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-600">Supplier to notify</label>
                <select
                  value={orderSupplier.id}
                  onChange={(e) => {
                    const nextSupplier = suppliers.find(supplier => supplier.id === Number(e.target.value));
                    if (nextSupplier) {
                      const nextProduct = getProductsForSupplier(nextSupplier)[0];
                      setOrderSupplier(nextSupplier);
                      setOrderLines(nextProduct ? [buildPurchaseOrderLine(nextProduct, getSuggestedReorderQuantity(nextProduct))] : []);
                    }
                  }}
                  className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                >
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Change this if the linked supplier cannot fulfil the item.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="date"
                  value={orderForm.date}
                  onChange={(e) => setOrderForm({ ...orderForm, date: e.target.value })}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-right">
                  <p className="text-xs text-gray-500">PO Total</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(orderTotal)}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200">
                <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Bulky PO Items Requested</p>
                    <p className="text-xs text-gray-500">Add several products from this supplier, then send one purchase order.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) addOrderLine(event.target.value);
                      }}
                      className="h-9 min-w-56 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900"
                    >
                      <option value="">Add bulky item</option>
                      {availableOrderProducts.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {product.sku}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addOrderLine()}
                      disabled={availableOrderProducts.length === 0}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Item
                    </Button>
                    <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={handleEmailSupplier} disabled={isSendingPurchaseOrder || !orderSupplier.email || !orderHasValidLines}>
                      <Send className="mr-2 h-4 w-4" />
                      {isSendingPurchaseOrder ? 'Sending...' : 'Send to Supplier'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-[1.5fr_.8fr_.9fr_.7fr_.8fr_.8fr_44px] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                  <span>Item</span>
                  <span>SKU</span>
                  <span>Supplier SKU</span>
                  <span>Qty</span>
                  <span>Unit cost</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {orderLines.map((line, index) => {
                    const calculatedLine = orderLineItems[index];
                    return (
                      <div key={`${line.productId}-${index}`} className="grid grid-cols-[1.5fr_.8fr_.9fr_.7fr_.8fr_.8fr_44px] gap-2 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0">
                        <div>
                          <select
                            value={line.productId}
                            onChange={(event) => {
                              const nextProduct = orderSupplierProducts.find(product => product.id === event.target.value);
                              if (nextProduct) {
                                updateOrderLine(index, buildPurchaseOrderLine(nextProduct, Number(line.requestedQuantity) || getSuggestedReorderQuantity(nextProduct)));
                              }
                            }}
                            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-medium text-gray-900"
                          >
                            {orderSupplierProducts.map(product => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">{products.find(product => product.id === line.productId)?.supplierName || orderSupplier.name}</p>
                        </div>
                        <p className="self-center text-gray-600">{line.sku}</p>
                        <Input value={line.supplierSku} onChange={(e) => updateOrderLine(index, { supplierSku: e.target.value })} className="h-8 bg-white border-gray-200" />
                        <Input type="number" min="1" value={line.requestedQuantity} onChange={(e) => updateOrderLine(index, { requestedQuantity: e.target.value })} className="h-8 bg-white border-gray-200" />
                        <Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => updateOrderLine(index, { unitCost: e.target.value })} className="h-8 bg-white border-gray-200" />
                        <p className="self-center text-right font-medium text-gray-900">{formatCurrency(calculatedLine?.lineTotal || 0)}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                          onClick={() => removeOrderLine(index)}
                          disabled={orderLines.length === 1}
                          aria-label={`Remove ${line.productName}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {orderLines.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">
                      Add at least one item from {orderSupplier.name} to create this purchase order.
                    </div>
                  )}
                </div>
              </div>

              <Input
                placeholder="Supplier delivery note"
                value={orderForm.deliveryNote}
                onChange={(e) => setOrderForm({ ...orderForm, deliveryNote: e.target.value })}
                className="bg-gray-100 border-gray-200 text-gray-900"
              />
              <div className="grid grid-cols-1 gap-4">
                <select
                  value={orderForm.paymentMethod}
                  onChange={(e) => setOrderForm({ ...orderForm, paymentMethod: e.target.value })}
                  className="h-9 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                >
                  <option>Credit</option>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Check</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOrderSupplier(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
