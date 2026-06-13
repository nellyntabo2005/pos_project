import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { Dashboard } from './components/pages/Dashboard';
import { POSPage, type CompletedSale, type DayBalance, type POSProduct } from './components/pages/POSPageEnhanced';
import { InvoicesPage } from './components/pages/InvoicesPage';
import { CustomersPage } from './components/pages/CustomersPage';
import { ProductsPageEnhanced } from './components/pages/ProductsPageEnhanced';
import { ProcurementPage } from './components/pages/ProcurementPage';
import { InventoryPage } from './components/pages/InventoryPage';
import { ExpensesPage } from './components/pages/ExpensesPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { UsersPage } from './components/pages/UsersPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { LoginPage } from './components/auth/LoginPage';
import { Toaster } from './components/ui/sonner';
import { UserRole } from './types/auth';
import type { QuickActionId } from './components/QuickActions';
import type { Product } from './components/pages/ProductsPageEnhanced';
import { BusinessExpense, ReorderRequest, StockMovement, SupplierOrderInvoice } from './types/supplierOrder';
import { approveUser, createCustomer, createProduct, createSupplier, deactivateUser, downloadAvailableProducts, downloadProductImportTemplate, hasStoredSession, importProductsFromExcel, loadBackendState, login as apiLogin, logout as apiLogout, registerAccount, rejectUser, saveDayBalance, saveSale, saveSupplierInvoice, updateProductStock, updateUser, verifyTwoFactor as apiVerifyTwoFactor } from './services/api';
import type { BackendCustomer, BackendRole, BackendSupplier, BackendUser, CreateCustomerInput, LoginResult, RegistrationRole } from './services/api';
import { toast } from 'sonner';
import { canAccessModule, firstAccessibleModule, normalizeRole, type AppModuleId } from './services/permissions';

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const LOCAL_NOTIFICATION_STORAGE_KEY = 'pos-local-notifications';
const refreshNotificationBell = () => window.dispatchEvent(new Event('pos:notifications-changed'));
const mergeSupplierInvoices = (
  currentInvoices: SupplierOrderInvoice[],
  backendInvoices: SupplierOrderInvoice[]
) => {
  const backendIds = new Set(backendInvoices.map(invoice => invoice.id));
  const pendingLocalInvoices = currentInvoices.filter(invoice =>
    !backendIds.has(invoice.id) && invoice.status !== 'delivered'
  );

  return [...backendInvoices, ...pendingLocalInvoices].sort((a, b) => b.date.localeCompare(a.date));
};
const getLocalNotificationId = (key: string) => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index);
    hash |= 0;
  }
  return -Math.max(1, Math.abs(hash));
};
const pushLocalNotification = (title: string, message: string, key = `${title}:${message}`) => {
  const notification = {
    id: getLocalNotificationId(key),
    title,
    message,
    channel: 'inventory',
    severity: 'warning',
    priority: 'high',
    status: 'pending',
    is_read: false,
    created_at: new Date().toISOString()
  };

  try {
    const saved = window.localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEY);
    const currentNotifications = saved ? JSON.parse(saved) as Array<typeof notification> : [];
    const nextNotifications = [
      notification,
      ...currentNotifications.filter(item => item.id !== notification.id)
    ].slice(0, 20);
    window.localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEY, JSON.stringify(nextNotifications));
  } catch {
    // The bell still receives the event even if storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent('pos:local-notification', {
    detail: notification
  }));
};
const DRAWER_AUTO_CLOSE_MS = 24 * 60 * 60 * 1000;

const createInitialDayBalance = (): DayBalance => ({
  date: getTodayKey(),
  openingBalance: 0,
  closingBalance: null,
  status: 'closed',
  openedAt: null
});

const isDrawerExpired = (balance: DayBalance) => {
  if (balance.status !== 'open' || !balance.openedAt) return false;
  return Date.now() - new Date(balance.openedAt).getTime() >= DRAWER_AUTO_CLOSE_MS;
};

export default function App() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [quickActionSignals, setQuickActionSignals] = useState({
    addProduct: 0,
    addCustomer: 0,
    newInvoice: 0
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Set to false for login screen
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState('');
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [products, setProducts] = useState(() => {
    const savedProducts = window.localStorage.getItem('pos-products');
    return savedProducts ? JSON.parse(savedProducts) as POSProduct[] : [];
  });
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>(() => {
    const savedSales = window.localStorage.getItem('pos-sales');
    return savedSales
      ? (JSON.parse(savedSales) as CompletedSale[]).map(sale => ({
          ...sale,
          cashAmount: sale.cashAmount ?? (sale.method.toLowerCase().startsWith('cash') ? sale.amount : 0),
          cashier: sale.cashier ?? 'Cashier',
          timestamp: new Date(sale.timestamp)
        }))
      : [];
  });
  const [dayBalance, setDayBalance] = useState<DayBalance>(() => {
    const savedBalance = window.localStorage.getItem('pos-day-balance');
    const balance = savedBalance ? JSON.parse(savedBalance) as DayBalance : createInitialDayBalance();
    return balance.date === getTodayKey() && !isDrawerExpired(balance) ? balance : createInitialDayBalance();
  });
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierOrderInvoice[]>(() => {
    const savedSupplierInvoices = window.localStorage.getItem('pos-supplier-invoices');
    return savedSupplierInvoices ? JSON.parse(savedSupplierInvoices) as SupplierOrderInvoice[] : [];
  });
  const [suppliers, setSuppliers] = useState<BackendSupplier[]>(() => {
    const savedSuppliers = window.localStorage.getItem('pos-suppliers');
    return savedSuppliers ? JSON.parse(savedSuppliers) as BackendSupplier[] : [];
  });
  const [expenses, setExpenses] = useState<BusinessExpense[]>(() => {
    const savedExpenses = window.localStorage.getItem('pos-expenses');
    return savedExpenses ? JSON.parse(savedExpenses) as BusinessExpense[] : [];
  });
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    const savedStockMovements = window.localStorage.getItem('pos-stock-movements');
    return savedStockMovements ? JSON.parse(savedStockMovements) as StockMovement[] : [];
  });
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [customers, setCustomers] = useState<BackendCustomer[]>([]);
  const [reorderRequest, setReorderRequest] = useState<ReorderRequest | null>(null);
  const lowStockSnapshot = useRef('');
  const notifiedLowStockProductIds = useRef(new Set<string>());
  const pendingStockUpdates = useRef(new Map<string, number>());
  const pendingSaleDetails = useRef(new Map<string, CompletedSale>());

  const applyPendingStockUpdates = (nextProducts: POSProduct[]) =>
    nextProducts.map(product => (
      pendingStockUpdates.current.has(product.id)
        ? { ...product, stock: pendingStockUpdates.current.get(product.id)! }
        : product
    ));

  const mergeLiveSaleDetails = (backendSales: CompletedSale[]) => {
    const mergedSales = backendSales.map((sale) => {
      const pendingSale = pendingSaleDetails.current.get(sale.id);
      if (!pendingSale) return sale;

      return {
        ...sale,
        method: pendingSale.method,
        cashAmount: pendingSale.cashAmount,
        items: pendingSale.items.length > 0 ? pendingSale.items : sale.items,
        cashier: sale.cashier || pendingSale.cashier,
        customer: sale.customer || pendingSale.customer,
        customerId: sale.customerId ?? pendingSale.customerId,
        customerPhone: sale.customerPhone || pendingSale.customerPhone,
        customerEmail: sale.customerEmail || pendingSale.customerEmail,
        customerAccountReference: sale.customerAccountReference || pendingSale.customerAccountReference
      };
    });

    pendingSaleDetails.current.forEach((pendingSale, saleId) => {
      if (!mergedSales.some(sale => sale.id === saleId)) {
        mergedSales.unshift(pendingSale);
      }
    });

    return mergedSales;
  };

  const refreshBackendState = async (fallbackDayBalance = dayBalance) => {
    const backendState = await loadBackendState(fallbackDayBalance);

    setProducts(applyPendingStockUpdates(backendState.products));
    setCompletedSales(mergeLiveSaleDetails(backendState.completedSales));
    setSupplierInvoices(current => mergeSupplierInvoices(current, backendState.supplierInvoices));
    setSuppliers(backendState.suppliers);
    setCustomers(backendState.customers);
    setUsers(backendState.users);
    setIsBackendConnected(true);

    return backendState;
  };

  const cashSalesToday = completedSales
    .filter(sale => sale.timestamp.toISOString().slice(0, 10) === dayBalance.date)
    .reduce((sum, sale) => sum + sale.cashAmount, 0);

  useEffect(() => {
    if (!hasStoredSession()) {
      return;
    }

    let isMounted = true;

    loadBackendState(createInitialDayBalance())
      .then((backendState) => {
        if (!isMounted) return;

        setProducts(applyPendingStockUpdates(backendState.products));
        setCompletedSales(mergeLiveSaleDetails(backendState.completedSales));
        setDayBalance(backendState.dayBalance.date === getTodayKey() ? backendState.dayBalance : createInitialDayBalance());
        setSupplierInvoices(current => mergeSupplierInvoices(current, backendState.supplierInvoices));
        setSuppliers(backendState.suppliers);
        setCustomers(backendState.customers);
        setUsers(backendState.users);
        setIsBackendConnected(true);
      })
      .catch((error) => {
        console.warn('Backend unavailable, using local browser data.', error);
        if (isMounted) {
          setIsBackendConnected(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isBackendConnected) {
      return;
    }

    const refreshLiveState = () => {
      refreshBackendState(dayBalance)
        .catch(error => console.warn('Unable to refresh live backend state.', error));
    };

    const timer = window.setInterval(refreshLiveState, 10000);
    return () => window.clearInterval(timer);
  }, [dayBalance, isAuthenticated, isBackendConnected]);

  useEffect(() => {
    window.localStorage.setItem('pos-products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    window.localStorage.setItem('pos-sales', JSON.stringify(completedSales));
  }, [completedSales]);

  useEffect(() => {
    window.localStorage.setItem('pos-day-balance', JSON.stringify(dayBalance));
  }, [dayBalance]);

  useEffect(() => {
    const closeExpiredDrawer = () => {
      setDayBalance(previousBalance => {
        if (!isDrawerExpired(previousBalance)) return previousBalance;

        const nextDayBalance = {
          ...previousBalance,
          closingBalance: previousBalance.openingBalance + cashSalesToday,
          status: 'closed'
        } as DayBalance;

        if (isBackendConnected) {
          saveDayBalance(nextDayBalance).catch(error => console.warn('Unable to auto-close day balance in backend.', error));
        }

        return nextDayBalance;
      });
    };

    closeExpiredDrawer();
    const timer = window.setInterval(closeExpiredDrawer, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [cashSalesToday, isBackendConnected]);

  useEffect(() => {
    window.localStorage.setItem('pos-supplier-invoices', JSON.stringify(supplierInvoices));
  }, [supplierInvoices]);

  useEffect(() => {
    window.localStorage.setItem('pos-suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    window.localStorage.setItem('pos-expenses', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    window.localStorage.setItem('pos-stock-movements', JSON.stringify(stockMovements));
  }, [stockMovements]);

  useEffect(() => {
    const lowStockProducts = products.filter(product => product.stock <= (product.reorderLevel || 10));
    const lowStockIds = new Set(lowStockProducts.map(product => product.id));
    const nextSnapshot = lowStockProducts.map(product => `${product.id}:${product.stock}`).sort().join('|');
    lowStockProducts.forEach(product => {
      const linkedSupplier = product.supplierName || suppliers.find(supplier => supplier.id === product.supplierId)?.name;
      const stockChanged = lowStockSnapshot.current && nextSnapshot !== lowStockSnapshot.current;
      if (!notifiedLowStockProductIds.current.has(product.id) || stockChanged) {
        pushLocalNotification(
          `${product.name} is low in stock`,
          linkedSupplier
            ? `${product.stock} ${product.uom} remaining. ${linkedSupplier} should be notified for replenishment.`
            : `${product.stock} ${product.uom} remaining. Link or choose a supplier before replenishment.`,
          `low-stock:${product.id}`
        );
        notifiedLowStockProductIds.current.add(product.id);
      }
    });
    notifiedLowStockProductIds.current.forEach(productId => {
      if (!lowStockIds.has(productId)) {
        notifiedLowStockProductIds.current.delete(productId);
      }
    });
    lowStockSnapshot.current = nextSnapshot;
  }, [products, suppliers]);

  const handleItemClick = (itemId: string) => {
    if (!userRole || !canAccessModule(itemId as AppModuleId, userRole)) {
      toast.warning('Access restricted', {
        description: 'Your role does not have access to that module.'
      });
      return;
    }
    setActiveItem(itemId);
  };

  const handleQuickAction = (action: QuickActionId) => {
    switch (action) {
      case 'new-sale':
        handleItemClick('pos');
        break;
      case 'add-product':
        handleItemClick('inventory');
        setQuickActionSignals(previousSignals => ({
          ...previousSignals,
          addProduct: previousSignals.addProduct + 1
        }));
        break;
      case 'add-customer':
        handleItemClick('customers');
        setQuickActionSignals(previousSignals => ({
          ...previousSignals,
          addCustomer: previousSignals.addCustomer + 1
        }));
        break;
      case 'quick-invoice':
        handleItemClick('invoices');
        setQuickActionSignals(previousSignals => ({
          ...previousSignals,
          newInvoice: previousSignals.newInvoice + 1
        }));
        break;
    }
  };

  const finishAuthenticatedSession = async (username: string, role: UserRole) => {
    const normalizedRole = normalizeRole(role);
    setIsAuthenticated(true);
    setUserRole(normalizedRole);
    setUserName(username);
    setActiveItem(firstAccessibleModule(normalizedRole));

    try {
      const backendState = await loadBackendState(dayBalance);

      setProducts(applyPendingStockUpdates(backendState.products));
      setCompletedSales(mergeLiveSaleDetails(backendState.completedSales));
      setSupplierInvoices(current => mergeSupplierInvoices(current, backendState.supplierInvoices));
      setSuppliers(backendState.suppliers);
      setCustomers(backendState.customers);
      setUsers(backendState.users);
      setIsBackendConnected(true);
    } catch (error) {
      console.warn('Signed in, but backend data could not be loaded. Using local browser data.', error);
      setIsBackendConnected(false);
    }
  };

  const handleLogin = async (username: string, password: string, role: UserRole): Promise<LoginResult> => {
    const result = await apiLogin(username, password);
    if (!result.twoFactorRequired) {
      await finishAuthenticatedSession(username, (result.userRole as UserRole) || role);
    }
    return result;
  };

  const handleVerifyTwoFactor = async (username: string, code: string, role: UserRole): Promise<LoginResult> => {
    const result = await apiVerifyTwoFactor(username, code);
    await finishAuthenticatedSession(username, (result.userRole as UserRole) || role);
    return result;
  };

  const performLogout = () => {
    apiLogout();
    setIsAuthenticated(false);
    setUserRole(null);
    setUserName('');
    setActiveItem('dashboard');
  };

  const handleLogout = () => {
    toast.warning('Confirm logout', {
      description: 'Are you sure you want to log out of this session?',
      action: {
        label: 'Logout',
        onClick: performLogout
      },
      cancel: {
        label: 'Stay',
        onClick: () => undefined
      }
    });
  };

  const handleTransactionComplete = (sale: CompletedSale) => {
    pendingSaleDetails.current.set(sale.id, sale);
    setCompletedSales(previousSales => [sale, ...previousSales]);
    const soldUnitsByProduct = sale.items.reduce((totals, item) => {
      totals.set(item.productId, (totals.get(item.productId) || 0) + (item.stockUnits * item.quantity));
      return totals;
    }, new Map<string, number>());
    const nextStockByProduct = products.reduce((stockMap, product) => {
      const soldUnits = soldUnitsByProduct.get(product.id) || 0;
      if (soldUnits > 0) {
        stockMap.set(product.id, Math.max(0, product.stock - soldUnits));
      }
      return stockMap;
    }, new Map<string, number>());

    setProducts(previousProducts => previousProducts.map(product => {
      const soldUnits = soldUnitsByProduct.get(product.id) || 0;
      if (soldUnits === 0) return product;

      pendingStockUpdates.current.set(product.id, Math.max(0, product.stock - soldUnits));

      return {
        ...product,
        stock: Math.max(0, product.stock - soldUnits)
      };
    }));
    setStockMovements(previousMovements => [
      ...sale.items.map(item => ({
        id: `MOV-${sale.id}-${item.productId}`,
        item: item.name,
        type: 'out' as const,
        quantity: -(item.stockUnits * item.quantity),
        date: sale.timestamp.toISOString().slice(0, 10),
        reason: `Sale ${sale.id}`
      })),
      ...previousMovements
    ]);

    if (isBackendConnected) {
      saveSale(sale)
        .then((savedSale) => {
          const liveSavedSale = {
            ...savedSale,
            method: sale.method,
            cashAmount: sale.cashAmount,
            items: sale.items,
            cashier: savedSale.cashier || sale.cashier,
            customer: savedSale.customer || sale.customer,
            customerId: savedSale.customerId ?? sale.customerId,
            customerPhone: savedSale.customerPhone || sale.customerPhone,
            customerEmail: savedSale.customerEmail || sale.customerEmail,
            customerAccountReference: savedSale.customerAccountReference || sale.customerAccountReference
          };
          pendingSaleDetails.current.delete(sale.id);
          pendingSaleDetails.current.set(savedSale.id, liveSavedSale);

          setCompletedSales(previousSales => [
            liveSavedSale,
            ...previousSales.filter(existingSale =>
              existingSale.id !== sale.id && existingSale.id !== savedSale.id
            )
          ]);

          return Promise.all(
            Array.from(nextStockByProduct.entries()).map(([productId, nextStock]) =>
              updateProductStock(productId, nextStock)
                .then(() => {
                  pendingStockUpdates.current.delete(productId);
                })
            )
          );
        })
        .then(() => refreshBackendState(dayBalance))
        .then(refreshNotificationBell)
        .catch(error => console.warn('Unable to save sale or update sold stock in backend.', error));
    }
  };

  const handleProductCreated = async (product: Product) => {
    if (!isBackendConnected) {
      setProducts(previousProducts => [
        {
          id: Date.now().toString(),
          name: product.name,
          sku: product.sku,
          category: product.category,
          brand: product.brand,
          parentProduct: product.parentProduct,
          variation: product.variation,
          packSize: product.packSize,
          modelNumber: product.modelNumber,
          supplierId: product.supplierId,
          supplierName: product.supplierName,
          uom: product.uom,
          prices: product.prices,
          stock: product.stock,
          tax: product.tax,
          image: product.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=100&h=100&fit=crop'
        },
        ...previousProducts
      ]);
      return;
    }

    const savedProduct = await createProduct({
      name: product.name,
      sku: product.sku,
      category_name: product.category,
      generic_name: product.parentProduct,
      brand: product.brand,
      parent_product: product.parentProduct,
      variation: product.variation,
      pack_size: product.packSize,
      model_number: product.modelNumber,
      supplier_id: product.supplierId,
      supplier_sku: product.supplierSku,
      base_unit_name: product.uom,
      price: product.prices.retail || 0,
      wholesale_price: product.prices.wholesale || product.prices.retail || 0,
      corporate_price: product.prices.corporate || product.prices.wholesale || product.prices.retail || 0,
      loyalty_price: product.prices.loyal || product.prices.retail || 0,
      cost_price: product.buyingPrice || 0,
      quantity: product.stock || 0,
      minimum_stock: product.reorderLevel || 0,
      maximum_stock: product.maximumStock,
      tax_rate: product.tax || 0,
      image_data: product.image || '',
      notes: product.variation
    });

    setProducts(previousProducts => [savedProduct, ...previousProducts]);
    refreshNotificationBell();
  };

  const handleSupplierOrderCreated = (invoice: Omit<SupplierOrderInvoice, 'id'>) => {
    const newInvoice: SupplierOrderInvoice = {
      ...invoice,
      id: `SUP-INV-${Date.now()}`
    };

    setSupplierInvoices(previousInvoices => [newInvoice, ...previousInvoices]);

    if (newInvoice.status === 'requested' || newInvoice.status === 'pending') {
      const requestedSummary = newInvoice.orderItems && newInvoice.orderItems.length > 0
        ? newInvoice.orderItems.map(item => `${item.requestedQuantity} ${item.productName}`).join(', ')
        : `${newInvoice.quantityRequested || newInvoice.items} item${(newInvoice.quantityRequested || newInvoice.items) === 1 ? '' : 's'}`;
      pushLocalNotification(
        `${newInvoice.supplierName} notified`,
        `Stock request sent for ${requestedSummary}. Pending delivery confirmation.`,
        `supplier-notified:${newInvoice.id}`
      );
    }

    if (newInvoice.status === 'delivered') {
      setExpenses(previousExpenses => [
        {
          id: `EXP-${newInvoice.id}`,
          category: 'Supplies',
          description: `${newInvoice.supplierName} delivery${newInvoice.productName ? ` - ${newInvoice.productName}` : ''}`,
          amount: newInvoice.amount,
          date: newInvoice.date,
          paymentMethod: newInvoice.paymentMethod,
          receipt: true,
          sourceInvoiceId: newInvoice.id
        },
        ...previousExpenses
      ]);
    }

    const deliveredItems = newInvoice.status === 'delivered'
      ? (newInvoice.orderItems || []).filter(item => item.deliveredQuantity > 0)
      : [];

    if (deliveredItems.length > 0) {
      setProducts(previousProducts => previousProducts.map(product => {
        const deliveredItem = deliveredItems.find(item => item.productId === product.id);
        return deliveredItem
          ? { ...product, stock: product.stock + deliveredItem.deliveredQuantity }
          : product;
      }));
      setStockMovements(previousMovements => [
        ...deliveredItems.map(item => ({
          id: `MOV-${newInvoice.id}-${item.productId}`,
          item: item.productName,
          type: 'in' as const,
          quantity: item.deliveredQuantity,
          date: newInvoice.date,
          reason: `GRN ${newInvoice.goodsReceivingNote || newInvoice.id}`,
          sourceInvoiceId: newInvoice.id
        })),
        ...previousMovements
      ]);
    }

    if (isBackendConnected) {
      saveSupplierInvoice(newInvoice)
        .then(savedInvoice => {
          setSupplierInvoices(previousInvoices => previousInvoices.map(existingInvoice =>
            existingInvoice.id === newInvoice.id
              ? {
                  ...savedInvoice,
                  status: newInvoice.status,
                  productId: newInvoice.productId,
                  productName: newInvoice.productName,
                  quantityRequested: newInvoice.quantityRequested,
                  quantityDelivered: newInvoice.quantityDelivered,
                  quantityPending: newInvoice.quantityPending,
                  orderItems: newInvoice.orderItems,
                  goodsReceivingNote: newInvoice.goodsReceivingNote
                }
              : existingInvoice
          ));
        })
        .catch(error => console.warn('Unable to save supplier invoice to backend.', error));
    }
  };

  const handleSupplierCreated = async (supplier: Omit<BackendSupplier, 'id'>) => {
    if (!isBackendConnected) {
      setSuppliers(previousSuppliers => [
        {
          ...supplier,
          id: Date.now(),
          is_active: true
        },
        ...previousSuppliers
      ]);
      return;
    }

    const savedSupplier = await createSupplier(supplier);

    setSuppliers(previousSuppliers => [savedSupplier, ...previousSuppliers]);
  };

  const handleCustomerCreated = async (customer: CreateCustomerInput) => {
    if (!isBackendConnected) {
      setCustomers(previousCustomers => [
        {
          ...customer,
          id: Date.now(),
          account_reference: `LOCAL-${Date.now()}`,
          loyalty_points: 0,
          total_spent: 0,
          pricing_tier: customer.pricing_tier || 'retail',
          is_active: true,
          is_blacklisted: false,
          full_address: [customer.address_line1, customer.address_line2, customer.city, customer.county].filter(Boolean).join(', ')
        },
        ...previousCustomers
      ]);
      return;
    }

    const savedCustomer = await createCustomer(customer);
    setCustomers(previousCustomers => [savedCustomer, ...previousCustomers]);
    refreshNotificationBell();
  };

  const handleInventoryStockAdjustment = (productId: string, type: 'in' | 'out', quantity: number, reason: string) => {
    const product = products.find(item => item.id === productId);
    if (!product) return;

    if (type === 'out' && quantity > product.stock) {
      toast.warning('Insufficient stock', {
        description: `Only ${product.stock} ${product.uom} available for ${product.name}.`
      });
      return;
    }

    const signedQuantity = type === 'in' ? quantity : -quantity;
    const nextStock = product.stock + signedQuantity;

    setProducts(previousProducts => previousProducts.map(item =>
      item.id === productId
        ? { ...item, stock: Math.max(0, item.stock + signedQuantity) }
        : item
    ));

    setStockMovements(previousMovements => [
      {
        id: `MOV-${Date.now()}`,
        item: product.name,
        type,
        quantity: signedQuantity,
        date: getTodayKey(),
        reason
      },
      ...previousMovements
    ]);

    if (isBackendConnected) {
      updateProductStock(productId, nextStock)
        .then(refreshNotificationBell)
        .catch(error => console.warn('Unable to update adjusted stock in backend.', error));
    }
  };

  const handleInventoryItemCreated = async (product: Product) => {
    await handleProductCreated(product);

    if (product.stock > 0) {
      setStockMovements(previousMovements => [
        {
          id: `MOV-${Date.now()}`,
          item: product.name,
          type: 'in',
          quantity: product.stock,
          date: getTodayKey(),
          reason: 'Opening stock'
        },
        ...previousMovements
      ]);
    }
  };

  const handleUserCreated = async (user: { username: string; email: string; password: string; role: RegistrationRole | BackendRole }) => {
    await registerAccount(user);
    const backendState = await loadBackendState(dayBalance);
    setUsers(backendState.users);
    refreshNotificationBell();
  };

  const handleUserUpdated = async (userId: number, data: { role?: BackendRole; is_active?: boolean }) => {
    const updatedUser = await updateUser(userId, data);
    setUsers(previousUsers => previousUsers.map(user => user.id === userId ? updatedUser : user));
    refreshNotificationBell();
  };

  const handleUserDeactivated = async (userId: number) => {
    await deactivateUser(userId);
    setUsers(previousUsers => previousUsers.map(user => user.id === userId ? { ...user, is_active: false } : user));
    refreshNotificationBell();
  };

  const handleUserApproved = async (userId: number) => {
    const approvedUser = await approveUser(userId);
    setUsers(previousUsers => previousUsers.map(user => user.id === userId ? approvedUser : user));
    refreshNotificationBell();
  };

  const handleUserRejected = async (userId: number) => {
    const rejectedUser = await rejectUser(userId);
    setUsers(previousUsers => previousUsers.map(user => user.id === userId ? rejectedUser : user));
    refreshNotificationBell();
  };

  const handleDownloadProductImportTemplate = async () => {
    const template = await downloadProductImportTemplate();
    const url = window.URL.createObjectURL(template);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'product_import_template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadAvailableProducts = async () => {
    const exportFile = await downloadAvailableProducts();
    const url = window.URL.createObjectURL(exportFile);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'available_products.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleBulkProductImport = async (file: File) => {
    if (!isBackendConnected) {
      throw new Error('Excel import requires the backend connection.');
    }

    const result = await importProductsFromExcel(file);
    const backendState = await loadBackendState(dayBalance);

    setProducts(backendState.products);
    setCompletedSales(mergeLiveSaleDetails(backendState.completedSales));
    setSupplierInvoices(current => mergeSupplierInvoices(current, backendState.supplierInvoices));
    setSuppliers(backendState.suppliers);
    setCustomers(backendState.customers);
    setUsers(backendState.users);

    return result;
  };

  const handleInventoryReorder = (productId: string) => {
    const product = products.find(item => item.id === productId);
    if (!product) return;

    const invoiceSupplier = supplierInvoices.find(invoice => invoice.productId === productId);
    const fallbackSupplier = suppliers.find(supplier => supplier.is_active !== false);
    const supplierId = product.supplierId || invoiceSupplier?.supplierId || fallbackSupplier?.id;
    const supplierName = product.supplierName || invoiceSupplier?.supplierName || fallbackSupplier?.name;
    const reorderLevel = product.reorderLevel || 10;
    const suggestedQuantity = Math.max(1, Math.ceil((reorderLevel * 2) - product.stock));
    const suggestedAmount = Number(((product.prices.wholesale || product.prices.retail || 0) * suggestedQuantity).toFixed(2));

    setReorderRequest({
      signal: Date.now(),
      productId,
      supplierId,
      supplierName,
      suggestedQuantity,
      suggestedAmount
    });
    setActiveItem('procurement');
    pushLocalNotification(
      `Reorder started for ${product.name}`,
      supplierName
        ? `${supplierName} notified for ${suggestedQuantity} ${product.uom}. You can change supplier before sending.`
        : `${suggestedQuantity} ${product.uom} queued. Choose a supplier to continue.`,
      `reorder-started:${product.id}`
    );
  };

  const nextPurchaseOrderNumber = (offset = 0) => {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const maxNumber = supplierInvoices.reduce((max, invoice) => {
      if (!invoice.id.startsWith(prefix)) return max;
      const numericPart = Number(invoice.id.slice(prefix.length));
      return Number.isFinite(numericPart) ? Math.max(max, numericPart) : max;
    }, 0);
    return `${prefix}${String(maxNumber + offset + 1).padStart(3, '0')}`;
  };

  const handleLowStockPurchaseOrdersCreated = (items: Array<{ productId: string; quantity: number }>) => {
    const requestedItems = items
      .map(item => {
        const product = products.find(existingProduct => existingProduct.id === item.productId);
        if (!product) return null;

        const invoiceSupplier = supplierInvoices.find(invoice => invoice.productId === product.id);
        const supplierId = product.supplierId || invoiceSupplier?.supplierId;
        const supplierName = product.supplierName || invoiceSupplier?.supplierName;

        if (!supplierId || !supplierName) {
          return {
            product,
            quantity: item.quantity,
            supplierId: 0,
            supplierName: ''
          };
        }

        return {
          product,
          quantity: item.quantity,
          supplierId,
          supplierName
        };
      })
      .filter((item): item is { product: POSProduct; quantity: number; supplierId: number; supplierName: string } => Boolean(item));

    const missingSupplierItems = requestedItems.filter(item => !item.supplierId || !item.supplierName);
    if (missingSupplierItems.length > 0) {
      toast.warning('Some items have no linked supplier', {
        description: `${missingSupplierItems.map(item => item.product.name).join(', ')} must be linked to a supplier before creating a purchase order.`
      });
    }

    const validItems = requestedItems.filter(item => item.supplierId && item.supplierName && item.quantity > 0);
    if (validItems.length === 0) {
      toast.warning('No purchase order created', {
        description: 'Select items with linked suppliers and quantities greater than zero.'
      });
      return;
    }

    const groupedBySupplier = validItems.reduce((groups, item) => {
      const key = String(item.supplierId);
      const group = groups.get(key) || {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        items: [] as typeof validItems
      };
      group.items.push(item);
      groups.set(key, group);
      return groups;
    }, new Map<string, { supplierId: number; supplierName: string; items: typeof validItems }>());

    const newInvoices = Array.from(groupedBySupplier.values()).map((group, index) => {
      const orderItems = group.items.map(item => {
        const unitCost = item.product.prices.wholesale || item.product.prices.retail || 0;
        return {
          productId: item.product.id,
          productName: item.product.name,
          requestedQuantity: item.quantity,
          deliveredQuantity: 0,
          pendingQuantity: item.quantity,
          unitCost
        };
      });
      const quantityRequested = orderItems.reduce((sum, item) => sum + item.requestedQuantity, 0);
      const amount = orderItems.reduce((sum, item) => sum + (item.requestedQuantity * item.unitCost), 0);

      return {
        id: nextPurchaseOrderNumber(index),
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        contact: '',
        date: getTodayKey(),
        amount: Number(amount.toFixed(2)),
        status: 'requested' as const,
        items: orderItems.length,
        orderItems,
        paymentMethod: 'Credit',
        quantityRequested,
        quantityDelivered: 0,
        quantityPending: quantityRequested,
        deliveryNote: 'Created from low-stock reorder suggestions'
      };
    });

    setSupplierInvoices(previousInvoices => [
      ...newInvoices,
      ...previousInvoices
    ]);

    if (isBackendConnected) {
      Promise.all(newInvoices.map(invoice => saveSupplierInvoice(invoice)))
        .then(refreshNotificationBell)
        .catch(error => console.warn('Unable to save low-stock purchase orders to backend.', error));
    }

    setActiveItem('procurement');
    toast.success('Purchase order requested', {
      description: `${newInvoices.length} requested purchase order${newInvoices.length === 1 ? '' : 's'} created.`
    });
    pushLocalNotification(
      'Low-stock purchase order requested',
      `${validItems.length} item${validItems.length === 1 ? '' : 's'} queued across ${newInvoices.length} supplier order${newInvoices.length === 1 ? '' : 's'}.`,
      `low-stock-po:${newInvoices.map(invoice => invoice.id).join(',')}`
    );
  };

  const handleOutOfStockReorder = (productIds: string[]) => {
    const outOfStockProducts = products.filter(product =>
      productIds.includes(product.id) && product.stock === 0
    );

    if (outOfStockProducts.length === 0) {
      toast.info('No out-of-stock items selected', {
        description: 'Bulk reorder only creates requests for products with stock at 0.'
      });
      return;
    }

    const fallbackSupplier = suppliers.find(supplier => supplier.is_active !== false);
    const batchId = Date.now();
    const newInvoices = outOfStockProducts.map((product) => {
      const invoiceSupplier = supplierInvoices.find(invoice => invoice.productId === product.id);
      const supplierId = product.supplierId || invoiceSupplier?.supplierId || fallbackSupplier?.id || 0;
      const supplierName = product.supplierName || invoiceSupplier?.supplierName || fallbackSupplier?.name || 'Choose supplier';
      const reorderLevel = product.reorderLevel || 10;
      const suggestedQuantity = Math.max(1, reorderLevel * 2);
      const unitCost = product.prices.wholesale || product.prices.retail || 0;

      return {
        supplierId,
        supplierName,
        contact: '',
        date: getTodayKey(),
        amount: Number((unitCost * suggestedQuantity).toFixed(2)),
        status: 'requested' as const,
        items: 1,
        paymentMethod: 'Credit',
        productId: product.id,
        productName: product.name,
        quantityRequested: suggestedQuantity,
        quantityDelivered: 0,
        quantityPending: suggestedQuantity,
        orderItems: [{
          productId: product.id,
          productName: product.name,
          requestedQuantity: suggestedQuantity,
          deliveredQuantity: 0,
          pendingQuantity: suggestedQuantity,
          unitCost
        }]
      };
    });

    setSupplierInvoices(previousInvoices => [
      ...newInvoices.map((invoice, index) => ({
        ...invoice,
        id: `SUP-INV-OUT-${batchId}-${index + 1}`
      })),
      ...previousInvoices
    ]);

    if (isBackendConnected) {
      Promise.all(newInvoices.map(invoice => saveSupplierInvoice({
        ...invoice,
        id: `SUP-INV-OUT-${batchId}-${invoice.productId}`
      })))
        .then(refreshNotificationBell)
        .catch(error => console.warn('Unable to save out-of-stock reorder requests to backend.', error));
    }

    setActiveItem('procurement');
    pushLocalNotification(
      'Out-of-stock reorder requests created',
      `${outOfStockProducts.length} item${outOfStockProducts.length === 1 ? '' : 's'} queued. Linked suppliers have been selected where available; change supplier before sending if needed.`,
      `out-of-stock-reorder:${outOfStockProducts.map(product => product.id).sort().join(',')}`
    );
  };

  const handleExpenseCreated = (expense: Omit<BusinessExpense, 'id'>) => {
    setExpenses(previousExpenses => [
      {
        ...expense,
        id: `EXP-${Date.now()}`
      },
      ...previousExpenses
    ]);
  };

  const handleOpenDay = (openingBalance: number) => {
    const nextDayBalance = {
      date: getTodayKey(),
      openingBalance,
      closingBalance: null,
      status: 'open',
      openedAt: new Date().toISOString()
    } as DayBalance;

    setDayBalance(nextDayBalance);

    if (isBackendConnected) {
      saveDayBalance(nextDayBalance).catch(error => console.warn('Unable to save day balance to backend.', error));
    }
  };

  const handleCloseDay = (closingBalance: number) => {
    setDayBalance(previousBalance => {
      const nextDayBalance = {
      ...previousBalance,
      closingBalance,
      status: 'closed'
      } as DayBalance;

      if (isBackendConnected) {
        saveDayBalance(nextDayBalance).catch(error => console.warn('Unable to save day balance to backend.', error));
      }

      return nextDayBalance;
    });
  };

  const renderContent = () => {
    if (userRole && !canAccessModule(activeItem as AppModuleId, userRole)) {
      const fallbackModule = firstAccessibleModule(userRole);
      window.setTimeout(() => setActiveItem(fallbackModule), 0);
      return (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-orange-900">
          <h2 className="font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm">Your role cannot access this module. Redirecting to an allowed page.</p>
        </div>
      );
    }

    switch (activeItem) {
      case 'dashboard':
        return (
          <Dashboard
            products={products}
            completedSales={completedSales}
            dayBalance={dayBalance}
            cashSalesToday={cashSalesToday}
            userRole={userRole!}
            onQuickAction={handleQuickAction}
          />
        );
      case 'pos':
        return (
          <POSPage
            products={products}
            customers={customers}
            dayBalance={dayBalance}
            cashSalesToday={cashSalesToday}
            cashierName={userName || 'Cashier'}
            onOpenDay={handleOpenDay}
            onCloseDay={handleCloseDay}
            onTransactionComplete={handleTransactionComplete}
          />
        );
      case 'invoices':
        return (
          <InvoicesPage
            supplierInvoices={supplierInvoices}
            completedSales={completedSales}
            openNewInvoiceSignal={quickActionSignals.newInvoice}
            onStartSale={() => setActiveItem('pos')}
            onRecordSupplierOrder={() => setActiveItem('procurement')}
          />
        );
      case 'customers':
        return (
          <CustomersPage
            customers={customers}
            completedSales={completedSales}
            openAddCustomerSignal={quickActionSignals.addCustomer}
            onCustomerCreated={handleCustomerCreated}
          />
        );
      case 'products':
        return (
          <ProductsPageEnhanced
            products={products}
            readOnly
          />
        );
      case 'purchases':
      case 'suppliers':
      case 'procurement':
        return (
          <ProcurementPage
            products={products}
            suppliers={suppliers}
            supplierInvoices={supplierInvoices}
            reorderRequest={reorderRequest}
            onReorderProduct={handleInventoryReorder}
            onSupplierCreated={handleSupplierCreated}
            onSupplierOrderCreated={handleSupplierOrderCreated}
          />
        );
      case 'inventory':
        return (
          <InventoryPage
            products={products}
            suppliers={suppliers}
            supplierInvoices={supplierInvoices}
            stockMovements={stockMovements}
            openAddItemSignal={quickActionSignals.addProduct}
            onStockAdjustment={handleInventoryStockAdjustment}
            onAddItem={handleInventoryItemCreated}
            onBulkImportItems={handleBulkProductImport}
            onDownloadImportTemplate={handleDownloadProductImportTemplate}
            onDownloadAvailableItems={handleDownloadAvailableProducts}
            onReorderOutOfStock={handleOutOfStockReorder}
            onCreateReorderPurchaseOrders={handleLowStockPurchaseOrdersCreated}
          />
        );
      case 'expenses':
        return <ExpensesPage expenses={expenses} onExpenseCreated={handleExpenseCreated} />;
      case 'reports':
        return (
          <ReportsPage
            products={products}
            completedSales={completedSales}
            expenses={expenses}
            supplierInvoices={supplierInvoices}
            dayBalance={dayBalance}
          />
        );
      case 'users':
        return (
          <UsersPage
            users={users}
            onCreateUser={handleUserCreated}
            onUpdateUser={handleUserUpdated}
            onDeactivateUser={handleUserDeactivated}
            onApproveUser={handleUserApproved}
            onRejectUser={handleUserRejected}
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return (
          <Dashboard
            products={products}
            completedSales={completedSales}
            dayBalance={dayBalance}
            cashSalesToday={cashSalesToday}
            userRole={userRole!}
            onQuickAction={handleQuickAction}
          />
        );
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleLogin} onVerifyTwoFactor={handleVerifyTwoFactor} />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <div className="animate-soft-pop min-h-screen bg-gray-50 flex flex-col">
      <Toaster richColors position="top-right" />
      {/* Top Header with Time and Notifications */}
      <TopHeader />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar 
          activeItem={activeItem} 
          onItemClick={handleItemClick}
          onLogout={handleLogout}
          userRole={userRole!}
          userName={userName}
        />
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-7xl mx-auto p-8">
            <div key={activeItem} className="animate-page-enter">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
