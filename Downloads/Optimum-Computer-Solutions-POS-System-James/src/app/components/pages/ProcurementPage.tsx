import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { AlertTriangle, ShoppingBag, Truck } from 'lucide-react';
import { PurchasesPage } from './PurchasesPage';
import { SuppliersPage } from './SuppliersPage';
import type { ReorderRequest, SupplierOrderInvoice } from '../../types/supplierOrder';
import type { POSProduct } from './POSPageEnhanced';
import type { BackendSupplier } from '../../services/api';

interface ProcurementPageProps {
  products: POSProduct[];
  suppliers: BackendSupplier[];
  supplierInvoices: SupplierOrderInvoice[];
  reorderRequest?: ReorderRequest | null;
  onReorderProduct?: (productId: string) => void;
  onSupplierCreated: (supplier: Omit<BackendSupplier, 'id'>) => Promise<void>;
  onSupplierOrderCreated: (invoice: Omit<SupplierOrderInvoice, 'id'>) => void;
}

export function ProcurementPage({
  products,
  suppliers,
  supplierInvoices,
  reorderRequest,
  onReorderProduct,
  onSupplierCreated,
  onSupplierOrderCreated
}: ProcurementPageProps) {
  const [activeView, setActiveView] = useState<'suppliers' | 'purchases'>('suppliers');
  const lowStockProducts = products.filter(product => product.stock <= (product.reorderLevel || 10));

  useEffect(() => {
    if (reorderRequest) {
      setActiveView('suppliers');
    }
  }, [reorderRequest?.signal]);

  const getLinkedSupplierName = (product: POSProduct) => {
    if (product.supplierName) return product.supplierName;
    const supplierFromProduct = suppliers.find(supplier => supplier.id === product.supplierId);
    if (supplierFromProduct) return supplierFromProduct.name;
    const supplierFromInvoices = supplierInvoices.find(invoice => invoice.productId === product.id);
    if (supplierFromInvoices) return supplierFromInvoices.supplierName;
    return suppliers.find(supplier => supplier.is_active !== false)?.name || 'No supplier linked';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Procurement</h1>
          <p className="text-gray-500">Manage suppliers and supplier purchases in one place</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeView === 'suppliers' ? 'default' : 'outline'}
            className={activeView === 'suppliers' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
            onClick={() => setActiveView('suppliers')}
          >
            <Truck className="w-4 h-4 mr-2" />
            Suppliers
          </Button>
          <Button
            variant={activeView === 'purchases' ? 'default' : 'outline'}
            className={activeView === 'purchases' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
            onClick={() => setActiveView('purchases')}
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            Purchases
          </Button>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="font-semibold">Low stock reorders</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lowStockProducts.map(product => (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-orange-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      {product.stock} {product.uom} left • {getLinkedSupplierName(product)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => {
                      setActiveView('suppliers');
                      onReorderProduct?.(product.id);
                    }}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Reorder
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeView === 'suppliers' ? (
        <SuppliersPage
          products={products}
          suppliers={suppliers}
          supplierInvoices={supplierInvoices}
          reorderRequest={reorderRequest}
          onSupplierCreated={onSupplierCreated}
          onSupplierOrderCreated={onSupplierOrderCreated}
        />
      ) : (
        <PurchasesPage supplierInvoices={supplierInvoices} />
      )}
    </div>
  );
}
