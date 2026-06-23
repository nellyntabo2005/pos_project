import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Search, Eye, FileText, PackageCheck } from 'lucide-react';
import type { SupplierOrderInvoice } from '../../types/supplierOrder';
import { formatCurrency } from '../utils/helpers';

interface PurchasesPageProps {
  supplierInvoices: SupplierOrderInvoice[];
  onReceiveGoods: (invoice: SupplierOrderInvoice) => void;
}

type PurchaseRow = {
  id: string;
  supplier: string;
  date: string;
  amount: number;
  status: SupplierOrderInvoice['status'];
  items: number;
  deliveryNote?: string;
  goodsReceivingNote?: string;
  receivingLocation?: string;
  receivingNotes?: string;
  requestedItems: number;
  deliveredItems: number;
  pendingItems: number;
  orderItems: NonNullable<SupplierOrderInvoice['orderItems']>;
  invoice: SupplierOrderInvoice;
};

const hasReceivableItems = (purchase: PurchaseRow) => purchase.pendingItems > 0 || purchase.status !== 'delivered';

export function PurchasesPage({ supplierInvoices, onReceiveGoods }: PurchasesPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [documentPurchase, setDocumentPurchase] = useState<PurchaseRow | null>(null);
  const livePurchases: PurchaseRow[] = supplierInvoices.map(invoice => ({
    id: invoice.id.replace('SUP-INV', 'PUR'),
    supplier: invoice.supplierName,
    date: invoice.date,
    amount: invoice.amount,
    status: invoice.status,
    items: invoice.items,
    deliveryNote: invoice.deliveryNote,
    goodsReceivingNote: invoice.goodsReceivingNote,
    receivingLocation: invoice.receivingLocation,
    receivingNotes: invoice.receivingNotes,
    requestedItems: invoice.orderItems?.reduce((sum, item) => sum + item.requestedQuantity, 0) || invoice.quantityRequested || 0,
    deliveredItems: invoice.orderItems?.reduce((sum, item) => sum + item.deliveredQuantity, 0) || invoice.quantityDelivered || 0,
    pendingItems: invoice.orderItems?.reduce((sum, item) => sum + item.pendingQuantity, 0) || invoice.quantityPending || 0,
    orderItems: invoice.orderItems || [],
    invoice
  }));
  const pagePurchases = livePurchases;
  const pageSuppliers = Array.from(new Map(supplierInvoices.map(invoice => [invoice.supplierId, { id: invoice.supplierId, name: invoice.supplierName }])).values());

  const filteredPurchases = pagePurchases.filter(purchase => {
    const matchesSearch = purchase.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         purchase.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <Badge className="bg-blue-500/20 text-blue-600">Requested</Badge>;
      case 'pending':
        return <Badge className="bg-orange-500/20 text-orange-600">Pending</Badge>;
      case 'delivered':
        return <Badge className="bg-blue-500/20 text-blue-600">Delivered</Badge>;
      case 'draft':
        return <Badge className="bg-gray-500/20 text-gray-500">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Purchase Management</h1>
          <p className="text-gray-500">Track and manage supplier purchases</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Create New Purchase Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 text-sm mb-2">Supplier</label>
                  <Select>
                    <SelectTrigger className="bg-gray-100 border-gray-200 text-gray-900">
                      <SelectValue placeholder="Select Supplier" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 border-gray-200">
                      {pageSuppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id.toString()}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-gray-600 text-sm mb-2">Expected Delivery</label>
                  <Input type="date" className="bg-gray-100 border-gray-200 text-gray-900" />
                </div>
              </div>
              
              <div>
                <label className="block text-gray-600 text-sm mb-2">Purchase Items</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  <div className="flex gap-2 items-center">
                    <Input placeholder="Item name" className="bg-gray-100 border-gray-200 text-gray-900 flex-1" />
                    <Input placeholder="Qty" type="number" className="bg-gray-100 border-gray-200 text-gray-900 w-20" />
                    <Input placeholder="Price" type="number" className="bg-gray-100 border-gray-200 text-gray-900 w-24" />
                    <Button size="sm" variant="outline">+</Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 text-sm mb-2">Payment Method</label>
                  <Select>
                    <SelectTrigger className="bg-gray-100 border-gray-200 text-gray-900">
                      <SelectValue placeholder="Select Payment Method" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 border-gray-200">
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-gray-600 text-sm mb-2">Total Amount</label>
                  <Input placeholder="0.00" type="number" className="bg-gray-100 border-gray-200 text-gray-900" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setIsAddDialogOpen(false)}>Create Purchase</Button>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Save as Draft</Button>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Purchases</p>
                <p className="text-2xl font-semibold text-gray-900">{pagePurchases.length}</p>
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
                <p className="text-gray-500 text-sm">This Month</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(pagePurchases.reduce((sum, p) => sum + p.amount, 0))}
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
                <p className="text-gray-500 text-sm">Pending Orders</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {pagePurchases.reduce((sum, purchase) => sum + purchase.pendingItems, 0)}
                </p>
              </div>
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Eye className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Active Suppliers</p>
                <p className="text-2xl font-semibold text-gray-900">{pageSuppliers.length}</p>
              </div>
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Search className="w-6 h-6 text-purple-600" />
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
                placeholder="Search by purchase ID or supplier..."
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
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Purchases Table */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Purchase Orders ({filteredPurchases.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200">
                <TableHead className="text-gray-600">Purchase ID</TableHead>
                <TableHead className="text-gray-600">Supplier</TableHead>
                <TableHead className="text-gray-600">Date</TableHead>
                <TableHead className="text-gray-600">Amount</TableHead>
                <TableHead className="text-gray-600">Requested</TableHead>
                <TableHead className="text-gray-600">Delivered</TableHead>
                <TableHead className="text-gray-600">Pending</TableHead>
                <TableHead className="text-gray-600">GRN</TableHead>
                <TableHead className="text-gray-600">Delivery Note</TableHead>
                <TableHead className="text-gray-600">Status</TableHead>
                <TableHead className="text-gray-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.map(purchase => (
                <TableRow key={purchase.id} className="border-gray-200">
                  <TableCell className="text-blue-600 font-medium">{purchase.id}</TableCell>
                  <TableCell className="text-gray-900">{purchase.supplier}</TableCell>
                  <TableCell className="text-gray-600">{purchase.date}</TableCell>
                  <TableCell className="text-green-600">{formatCurrency(purchase.amount)}</TableCell>
                  <TableCell className="text-gray-600">{purchase.requestedItems}</TableCell>
                  <TableCell className="text-green-600">{purchase.deliveredItems}</TableCell>
                  <TableCell className={purchase.pendingItems > 0 ? 'text-orange-600' : 'text-gray-600'}>{purchase.pendingItems}</TableCell>
                  <TableCell className="text-gray-600">
                    <div className="space-y-1">
                      <p>{purchase.goodsReceivingNote || '-'}</p>
                      {(purchase.receivingLocation || purchase.receivingNotes) && (
                        <p className="text-xs text-gray-500">
                          {[purchase.receivingLocation, purchase.receivingNotes].filter(Boolean).join(' | ')}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{purchase.deliveryNote || '-'}</TableCell>
                  <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {hasReceivableItems(purchase) && (
                        <Button
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700"
                          onClick={() => onReceiveGoods(purchase.invoice)}
                        >
                          <PackageCheck className="w-4 h-4 mr-2" />
                          Receive Goods
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-300"
                        title="View purchase details"
                        aria-label={`View ${purchase.id} details`}
                        onClick={() => setSelectedPurchase(purchase)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-300"
                        title="View GRN and delivery note"
                        aria-label={`View ${purchase.id} GRN and delivery note`}
                        onClick={() => setDocumentPurchase(purchase)}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedPurchase && (
        <Dialog open={!!selectedPurchase} onOpenChange={() => setSelectedPurchase(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Purchase Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                <div>
                  <p className="font-semibold text-gray-900">{selectedPurchase.id}</p>
                  <p className="text-gray-500">{selectedPurchase.supplier}</p>
                </div>
                {getStatusBadge(selectedPurchase.status)}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-gray-500">Order Date</p>
                  <p className="font-medium text-gray-900">{selectedPurchase.date}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Amount</p>
                  <p className="font-medium text-gray-900">{formatCurrency(selectedPurchase.amount)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Requested</p>
                  <p className="font-medium text-gray-900">{selectedPurchase.requestedItems}</p>
                </div>
                <div>
                  <p className="text-gray-500">Delivered</p>
                  <p className="font-medium text-gray-900">{selectedPurchase.deliveredItems}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pending</p>
                  <p className="font-medium text-gray-900">{selectedPurchase.pendingItems}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment Method</p>
                  <p className="font-medium text-gray-900">{selectedPurchase.invoice.paymentMethod || 'Not captured'}</p>
                </div>
              </div>

              {selectedPurchase.orderItems.length > 0 && (
                <div className="overflow-hidden rounded-md border border-gray-200">
                  {selectedPurchase.orderItems.map((item) => (
                    <div key={`${item.productId}-${item.productName}`} className="grid gap-3 border-b border-gray-200 px-3 py-2 last:border-b-0 sm:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-medium text-gray-900">{item.productName}</p>
                        <p className="text-xs text-gray-500">{item.sku || item.supplierSku || 'No SKU'} | {formatCurrency(item.unitCost)}</p>
                      </div>
                      <div className="text-xs text-gray-600 sm:text-right">
                        <p>Requested: {item.requestedQuantity}</p>
                        <p className="text-green-600">Delivered: {item.deliveredQuantity}</p>
                        <p className="text-orange-600">Pending: {item.pendingQuantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSelectedPurchase(null)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {documentPurchase && (
        <Dialog open={!!documentPurchase} onOpenChange={() => setDocumentPurchase(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-gray-900">GRN & Delivery Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{documentPurchase.goodsReceivingNote || 'GRN Pending'}</p>
                    <p className="text-gray-500">{documentPurchase.id}</p>
                  </div>
                  <Badge className={documentPurchase.goodsReceivingNote ? 'bg-green-500/20 text-green-600' : 'bg-orange-500/20 text-orange-600'}>
                    {documentPurchase.goodsReceivingNote ? 'Created' : 'Pending'}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-gray-500">Supplier</p>
                  <p className="font-medium text-gray-900">{documentPurchase.supplier}</p>
                </div>
                <div>
                  <p className="text-gray-500">Order Date</p>
                  <p className="font-medium text-gray-900">{documentPurchase.date}</p>
                </div>
                <div>
                  <p className="text-gray-500">Delivery Note</p>
                  <p className="font-medium text-gray-900">{documentPurchase.deliveryNote || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Received</p>
                  <p className="font-medium text-gray-900">{documentPurchase.deliveredItems} of {documentPurchase.requestedItems}</p>
                </div>
                <div>
                  <p className="text-gray-500">Location</p>
                  <p className="font-medium text-gray-900">{documentPurchase.receivingLocation || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pending</p>
                  <p className="font-medium text-gray-900">{documentPurchase.pendingItems}</p>
                </div>
              </div>

              <div>
                <p className="text-gray-500">Receiving Notes</p>
                <p className="font-medium text-gray-900">{documentPurchase.receivingNotes || 'No notes captured'}</p>
              </div>

              {!documentPurchase.goodsReceivingNote && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-700">
                  A GRN will be available after goods are received for this order.
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDocumentPurchase(null)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
