import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Search, Eye, Download, Send, Plus, FileText, CreditCard } from 'lucide-react';
import { SupplierOrderInvoice } from '../../types/supplierOrder';
import type { CompletedSale } from './POSPageEnhanced';
import { formatCurrency } from '../utils/helpers';

type SupplierPaymentInput = {
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
};

interface InvoicesPageProps {
  supplierInvoices: SupplierOrderInvoice[];
  completedSales: CompletedSale[];
  openNewInvoiceSignal?: number;
  onStartSale?: () => void;
  onRecordSupplierOrder?: () => void;
  onPaySupplierInvoice?: (invoice: SupplierOrderInvoice, payment: SupplierPaymentInput) => Promise<void> | void;
}

interface InvoiceLineItem {
  name: string;
  quantity: number;
  total: number;
}

interface InvoiceRow {
  id: string;
  customer: string;
  customerDetail: string;
  date: string;
  amount: number;
  status: string;
  items: number;
  paymentMethod: string;
  type: 'Supplier' | 'Customer';
  lineItems: InvoiceLineItem[];
  sourceInvoice?: SupplierOrderInvoice;
}

export function InvoicesPage({
  supplierInvoices,
  completedSales,
  openNewInvoiceSignal = 0,
  onStartSale,
  onRecordSupplierOrder,
  onPaySupplierInvoice
}: InvoicesPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [isNewInvoiceDialogOpen, setIsNewInvoiceDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  useEffect(() => {
    if (openNewInvoiceSignal > 0) {
      setIsNewInvoiceDialogOpen(true);
    }
  }, [openNewInvoiceSignal]);
  const allInvoices: InvoiceRow[] = [
    ...supplierInvoices.map(invoice => ({
      id: invoice.id,
      customer: invoice.supplierName,
      customerDetail: invoice.contact || '',
      date: invoice.date,
      amount: invoice.amount,
      status: invoice.status,
      items: invoice.items,
      paymentMethod: invoice.paymentMethod,
      type: 'Supplier' as const,
      sourceInvoice: invoice,
      lineItems: (invoice.orderItems || []).map(item => ({
        name: item.productName,
        quantity: item.requestedQuantity,
        total: item.unitCost * item.requestedQuantity
      }))
    })),
    ...completedSales.map(sale => ({
      id: sale.id,
      customer: sale.customer,
      customerDetail: [sale.customerAccountReference, sale.customerPhone].filter(Boolean).join(' - '),
      date: sale.timestamp.toISOString().slice(0, 10),
      amount: sale.amount,
      status: 'paid',
      items: sale.items.length,
      paymentMethod: sale.method || 'Cash',
      type: 'Customer' as const,
      lineItems: sale.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        total: item.total
      }))
    }))
  ];

  const filteredInvoices = allInvoices.filter(invoice => {
    const matchesSearch = invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.customerDetail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const normalizePaymentStatus = (invoice: InvoiceRow) => (
    invoice.sourceInvoice?.paymentStatus || invoice.paymentMethod || 'unpaid'
  ).toLowerCase();

  const getPaidAmount = (invoice: InvoiceRow) => {
    if (typeof invoice.sourceInvoice?.paidAmount === 'number') {
      return Math.min(invoice.amount, Math.max(0, invoice.sourceInvoice.paidAmount));
    }
    return normalizePaymentStatus(invoice) === 'paid' ? invoice.amount : 0;
  };
  const getPaymentBalance = (invoice: InvoiceRow) => Math.max(0, invoice.amount - getPaidAmount(invoice));
  const hasReceivedGoods = (invoice: InvoiceRow) => {
    if (invoice.type !== 'Supplier' || !invoice.sourceInvoice) return false;
    return invoice.status === 'delivered'
      || (invoice.sourceInvoice.quantityDelivered || 0) > 0
      || (invoice.sourceInvoice.orderItems || []).some(item => item.deliveredQuantity > 0);
  };
  const canPaySupplier = (invoice: InvoiceRow) => (
    invoice.type === 'Supplier'
    && Boolean(invoice.sourceInvoice)
    && hasReceivedGoods(invoice)
    && normalizePaymentStatus(invoice) !== 'paid'
  );

  const openSupplierPayment = (invoice: InvoiceRow) => {
    setPaymentInvoice(invoice);
    setPaymentAmount(String(getPaymentBalance(invoice) || invoice.amount));
    setPaymentMethod(invoice.sourceInvoice?.supplierPaymentMethod || 'Cash');
    setPaymentReference(invoice.sourceInvoice?.paymentReference || '');
    setPaymentNotes(invoice.sourceInvoice?.paymentNotes || '');
    setPaymentError('');
  };

  const recordSupplierPayment = async () => {
    if (!paymentInvoice?.sourceInvoice || !onPaySupplierInvoice) return;

    const amount = Number(paymentAmount);
    const balance = getPaymentBalance(paymentInvoice);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a payment amount greater than zero.');
      return;
    }
    if (amount > balance) {
      setPaymentError(`Payment cannot exceed the balance of ${formatCurrency(balance)}.`);
      return;
    }

    setIsRecordingPayment(true);
    setPaymentError('');
    try {
      await onPaySupplierInvoice(paymentInvoice.sourceInvoice, {
        amount,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined
      });
      setPaymentInvoice(null);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Supplier payment could not be recorded.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-600">Paid</Badge>;
      case 'requested':
        return <Badge className="bg-blue-500/20 text-blue-600">Requested</Badge>;
      case 'pending':
        return <Badge className="bg-orange-500/20 text-orange-600">Pending</Badge>;
      case 'delivered':
        return <Badge className="bg-blue-500/20 text-blue-600">Delivered</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500/20 text-red-600">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentBadge = (invoice: InvoiceRow) => {
    const status = normalizePaymentStatus(invoice);
    const labels: Record<string, string> = {
      unpaid: 'Unpaid',
      partial: 'Partial',
      paid: 'Paid'
    };
    const colors: Record<string, string> = {
      unpaid: 'bg-gray-500/20 text-gray-600',
      partial: 'bg-orange-500/20 text-orange-600',
      paid: 'bg-green-500/20 text-green-600'
    };
    return <Badge className={colors[status] || 'bg-gray-500/20 text-gray-500'}>{labels[status] || invoice.paymentMethod}</Badge>;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Invoice Management</h1>
          <p className="text-gray-500">Track and manage customer invoices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setIsNewInvoiceDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      <Dialog open={isNewInvoiceDialogOpen} onOpenChange={setIsNewInvoiceDialogOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              className="justify-start bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                setIsNewInvoiceDialogOpen(false);
                onStartSale?.();
              }}
            >
              <FileText className="w-4 h-4 mr-2" />
              Customer Sale Invoice
            </Button>
            <Button
              className="justify-start bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => {
                setIsNewInvoiceDialogOpen(false);
                onRecordSupplierOrder?.();
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Supplier Order Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Invoices</p>
                <p className="text-2xl font-semibold text-gray-900">{allInvoices.length}</p>
              </div>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Amount</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(allInvoices.reduce((sum, inv) => sum + inv.amount, 0))}
                </p>
              </div>
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Plus className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Requested</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {allInvoices.filter(inv => inv.status === 'requested').length}
                </p>
              </div>
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Eye className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Pending</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {allInvoices.filter(inv => inv.status === 'pending').length}
                </p>
              </div>
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Send className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white border-gray-200 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
              <Input
                placeholder="Search by invoice ID or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-100 border-gray-200 text-gray-900"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-gray-100 border-gray-200 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 border-gray-200">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40 bg-gray-100 border-gray-200 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 border-gray-200">
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Invoices ({filteredInvoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200">
                <TableHead className="text-gray-600">Invoice ID</TableHead>
                <TableHead className="text-gray-600">Party</TableHead>
                <TableHead className="text-gray-600">Type</TableHead>
                <TableHead className="text-gray-600">Date</TableHead>
                <TableHead className="text-gray-600">Amount</TableHead>
                <TableHead className="text-gray-600">Paid</TableHead>
                <TableHead className="text-gray-600">Balance</TableHead>
                <TableHead className="text-gray-600">Items</TableHead>
                <TableHead className="text-gray-600">Payment</TableHead>
                <TableHead className="text-gray-600">Status</TableHead>
                <TableHead className="text-gray-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map(invoice => (
                <TableRow key={invoice.id} className="border-gray-200">
                  <TableCell className="text-blue-600 font-medium">{invoice.id}</TableCell>
                  <TableCell className="text-gray-900">
                    <div className="font-medium">{invoice.customer}</div>
                    {invoice.customerDetail && (
                      <div className="text-xs text-gray-500">{invoice.customerDetail}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={invoice.type === 'Supplier' ? 'bg-orange-500/20 text-orange-600' : 'bg-blue-500/20 text-blue-600'}>
                      {invoice.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">{invoice.date}</TableCell>
                  <TableCell className="text-green-600">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell className={invoice.type === 'Supplier' ? 'text-blue-700' : 'text-gray-600'}>
                    {invoice.type === 'Supplier' ? formatCurrency(getPaidAmount(invoice)) : formatCurrency(invoice.amount)}
                  </TableCell>
                  <TableCell className={invoice.type === 'Supplier' && getPaymentBalance(invoice) > 0 ? 'font-medium text-orange-600' : 'text-gray-600'}>
                    {invoice.type === 'Supplier' ? formatCurrency(getPaymentBalance(invoice)) : formatCurrency(0)}
                  </TableCell>
                  <TableCell className="text-gray-600">{invoice.items} items</TableCell>
                  <TableCell>{getPaymentBadge(invoice)}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-300" onClick={() => setSelectedInvoice(invoice)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-300">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={canPaySupplier(invoice) ? 'text-purple-600 hover:text-purple-300' : 'text-gray-400 hover:text-gray-500'}
                        onClick={() => canPaySupplier(invoice) ? openSupplierPayment(invoice) : undefined}
                        disabled={invoice.type === 'Supplier' && !canPaySupplier(invoice)}
                        title={invoice.type === 'Supplier' ? 'Pay supplier' : 'Send invoice'}
                      >
                        {invoice.type === 'Supplier' ? <CreditCard className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedInvoice && (
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Invoice Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-gray-500">Invoice ID</p>
                  <p className="text-lg font-semibold text-blue-600">{selectedInvoice.id}</p>
                  <p className="mt-1 font-medium text-gray-900">{selectedInvoice.customer}</p>
                  {selectedInvoice.customerDetail && (
                    <p className="text-sm text-gray-500">{selectedInvoice.customerDetail}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-semibold text-green-700">{formatCurrency(selectedInvoice.amount)}</p>
                  <div className="mt-2 flex gap-2 sm:justify-end">
                    <Badge className={selectedInvoice.type === 'Supplier' ? 'bg-orange-500/20 text-orange-600' : 'bg-blue-500/20 text-blue-600'}>
                      {selectedInvoice.type}
                    </Badge>
                    {getStatusBadge(selectedInvoice.status)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{selectedInvoice.date}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment</p>
                  <div className="mt-1">{getPaymentBadge(selectedInvoice)}</div>
                </div>
                <div>
                  <p className="text-gray-500">Paid</p>
                  <p className="font-medium text-blue-700">
                    {selectedInvoice.type === 'Supplier' ? formatCurrency(getPaidAmount(selectedInvoice)) : formatCurrency(selectedInvoice.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Balance</p>
                  <p className={selectedInvoice.type === 'Supplier' && getPaymentBalance(selectedInvoice) > 0 ? 'font-medium text-orange-600' : 'font-medium text-gray-900'}>
                    {selectedInvoice.type === 'Supplier' ? formatCurrency(getPaymentBalance(selectedInvoice)) : formatCurrency(0)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Items</p>
                  <p className="font-medium text-gray-900">{selectedInvoice.items}</p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-semibold text-gray-900">Line Items</h4>
                {selectedInvoice.lineItems.length === 0 ? (
                  <p className="rounded-md border border-gray-200 p-3 text-sm text-gray-500">No line item details captured for this invoice.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
                    {selectedInvoice.lineItems.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-200 px-3 py-2 text-sm last:border-b-0">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-gray-600">Qty {item.quantity}</p>
                        <p className="font-semibold text-green-700">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={() => setSelectedInvoice(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {paymentInvoice && (
        <Dialog open={!!paymentInvoice} onOpenChange={() => setPaymentInvoice(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Pay Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm text-gray-500">{paymentInvoice.id}</p>
                <p className="font-semibold text-gray-900">{paymentInvoice.customer}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Invoice Total</p>
                    <p className="font-semibold">{formatCurrency(paymentInvoice.amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Already Paid</p>
                    <p className="font-semibold text-blue-700">{formatCurrency(getPaidAmount(paymentInvoice))}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Balance</p>
                    <p className="font-semibold text-orange-600">{formatCurrency(getPaymentBalance(paymentInvoice))}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Amount to pay</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Payment method</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-gray-100 border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-100 border-gray-200">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Reference</label>
                <Input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Receipt, transaction, cheque or bank ref"
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <Input
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  placeholder="Optional payment notes"
                  className="bg-gray-100 border-gray-200 text-gray-900"
                />
              </div>

              {paymentError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{paymentError}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setPaymentInvoice(null)} disabled={isRecordingPayment}>
                  Cancel
                </Button>
                <Button className="bg-green-600 text-white hover:bg-green-700" onClick={recordSupplierPayment} disabled={isRecordingPayment}>
                  {isRecordingPayment ? 'Recording...' : 'Record Payment'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
