import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
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
  Wallet
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
  onSupplierOrderCreated: (invoice: Omit<SupplierOrderInvoice, 'id'>) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
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

export function SuppliersPage({ products, suppliers: backendSuppliers, supplierInvoices, reorderRequest, onSupplierCreated, onSupplierOrderCreated }: SuppliersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'withBalance' | 'withOrders'>('all');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierSummary | null>(null);
  const [orderSupplier, setOrderSupplier] = useState<SupplierSummary | null>(null);
  const [progressDialog, setProgressDialog] = useState<'grn' | 'details' | null>(null);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
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
    setOrderSupplier(supplier);
    setOrderForm({
      date: today(),
      amount: '',
      items: '1',
      productId: defaultProduct?.id || '',
      quantityRequested: String(getSuggestedReorderQuantity(defaultProduct)),
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
    const suggestedQuantity = reorderRequest.suggestedQuantity || getSuggestedReorderQuantity(requestedProduct);
    setOrderForm({
      date: today(),
      amount: reorderRequest.suggestedAmount ? String(reorderRequest.suggestedAmount) : getSuggestedReorderAmount(requestedProduct, suggestedQuantity),
      items: '1',
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
    if (!supplierForm.name.trim() || !supplierForm.phone.trim()) return;

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
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleCreateOrder = () => {
    if (!orderSupplier) return;

    const amount = Number(orderForm.amount);
    const items = Math.max(1, Number(orderForm.items) || 1);
    const quantityRequested = Math.max(1, Number(orderForm.quantityRequested) || 1);
    const rawDelivered = Number(orderForm.quantityDelivered);
    const quantityDelivered = orderForm.status === 'delivered'
      ? Math.max(0, Math.min(quantityRequested, Number.isFinite(rawDelivered) ? rawDelivered : quantityRequested))
      : 0;
    const deliveredProduct = products.find(product => product.id === orderForm.productId) || products[0];
    if (!amount || amount <= 0) return;
    const unitCost = amount / quantityRequested;

    onSupplierOrderCreated({
      supplierId: orderSupplier.id,
      supplierName: orderSupplier.name,
      contact: orderSupplier.contact,
      date: orderForm.date || today(),
      amount,
      status: orderForm.status,
      items,
      paymentMethod: orderForm.paymentMethod,
      deliveryNote: orderForm.deliveryNote.trim() || undefined,
      goodsReceivingNote: orderForm.status === 'delivered' ? orderForm.goodsReceivingNote.trim() || `GRN-${Date.now()}` : undefined,
      productId: deliveredProduct?.id,
      productName: deliveredProduct?.name,
      quantityRequested,
      quantityDelivered,
      quantityPending: Math.max(0, quantityRequested - quantityDelivered),
      orderItems: deliveredProduct ? [{
        productId: deliveredProduct.id,
        productName: deliveredProduct.name,
        requestedQuantity: quantityRequested,
        deliveredQuantity: quantityDelivered,
        pendingQuantity: Math.max(0, quantityRequested - quantityDelivered),
        unitCost
      }] : []
    });
    setOrderSupplier(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Suppliers</h1>
          <p className="text-gray-500">Manage supplier contacts, orders, balances, and receiving activity</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                          <Input placeholder="e.g. Nairobi" value={supplierForm.city} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">State / County <span className="text-red-500">*</span></label>
                          <select value={supplierForm.county} onChange={(e) => setSupplierForm({ ...supplierForm, county: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option value="">Select state / county</option>
                            <option>Nairobi</option>
                            <option>Kiambu</option>
                            <option>Mombasa</option>
                            <option>Nakuru</option>
                            <option>Kisumu</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Postal Code <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. 00100" value={supplierForm.postal_code} onChange={(e) => setSupplierForm({ ...supplierForm, postal_code: e.target.value })} className="bg-gray-100 border-gray-200 text-gray-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-600">Country <span className="text-red-500">*</span></label>
                          <select value={supplierForm.country} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })} className="h-9 w-full rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                            <option>Kenya</option>
                            <option>Uganda</option>
                            <option>Tanzania</option>
                            <option>Rwanda</option>
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
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateSupplier} disabled={isSavingSupplier || !supplierForm.name.trim() || !supplierForm.phone.trim() || !supplierForm.contact_person.trim() || !supplierForm.email.trim()}>
                  {isSavingSupplier ? 'Saving...' : 'Save Supplier'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
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
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="text-orange-600 hover:text-orange-300" onClick={() => openOrderDialog(supplier)}>
                              <PackagePlus className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-300" onClick={() => setSelectedSupplier(supplier)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-300">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-gray-500 hover:text-gray-900">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </div>
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
              <Button variant="ghost" size="sm" className="text-blue-600">View all</Button>
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
                    KSh {Math.abs(getSupplierSummary(selectedSupplier).balance).toFixed(2)}
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
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Record Supplier Order</DialogTitle>
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
                    if (nextSupplier) setOrderSupplier(nextSupplier);
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
                <Input
                  type="number"
                  min="1"
                  placeholder="Items"
                  value={orderForm.items}
                  onChange={(e) => setOrderForm({ ...orderForm, items: e.target.value })}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Order amount"
                value={orderForm.amount}
                onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })}
                className="bg-gray-100 border-gray-200 text-gray-900"
              />
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={orderForm.productId}
                  onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                  className="h-9 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                >
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="1"
                  placeholder="Qty requested"
                  value={orderForm.quantityRequested}
                  onChange={(e) => {
                    const quantityRequested = Number(e.target.value) || 1;
                    setOrderForm({
                      ...orderForm,
                      quantityRequested: e.target.value,
                      amount: getSuggestedReorderAmount(products.find(product => product.id === orderForm.productId), quantityRequested)
                    });
                  }}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  min="0"
                  placeholder="Qty delivered"
                  value={orderForm.quantityDelivered}
                  onChange={(e) => setOrderForm({ ...orderForm, quantityDelivered: e.target.value })}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
                <Input
                  placeholder="Goods receiving note"
                  value={orderForm.goodsReceivingNote}
                  onChange={(e) => setOrderForm({ ...orderForm, goodsReceivingNote: e.target.value })}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>
              <Input
                placeholder="Supplier delivery note"
                value={orderForm.deliveryNote}
                onChange={(e) => setOrderForm({ ...orderForm, deliveryNote: e.target.value })}
                className="bg-gray-100 border-gray-200 text-gray-900"
              />
              <div className="grid grid-cols-2 gap-4">
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
                <select
                  value={orderForm.status}
                  onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value as SupplierOrderStatus })}
                  className="h-9 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900"
                >
                  <option value="requested">Requested</option>
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleCreateOrder}>
                  {orderForm.status === 'delivered' ? 'Receive Delivery Note' : `Notify ${orderSupplier.name}`}
                </Button>
                <Button variant="outline" onClick={() => setOrderSupplier(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
