import React from 'react';
import { KPICards } from '../KPICards';
import { Charts } from '../Charts';
import { DataTables } from '../DataTables';
import { QuickActions, type QuickActionId } from '../QuickActions';
import type { CompletedSale, DayBalance, POSProduct } from './POSPageEnhanced';
import type { UserRole } from '../../types/auth';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { formatCurrency } from '../utils/helpers';

interface DashboardProps {
  products: POSProduct[];
  completedSales: CompletedSale[];
  dayBalance: DayBalance;
  cashSalesToday: number;
  cashExpensesToday: number;
  userRole: UserRole;
  onQuickAction: (action: QuickActionId) => void;
}

export function Dashboard({ products, completedSales, dayBalance, cashSalesToday, cashExpensesToday, userRole, onQuickAction }: DashboardProps) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySales = completedSales.filter(sale => new Date(sale.timestamp).toISOString().slice(0, 10) === todayKey);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.amount, 0);
  const lowStockItems = products.filter(product => product.stock <= (product.reorderLevel || 10));
  const expectedCash = dayBalance.openingBalance + cashSalesToday - cashExpensesToday;
  const cashVariance = dayBalance.closingBalance === null ? 0 : dayBalance.closingBalance - expectedCash;
  const hasCriticalAlerts = lowStockItems.length > 0 || cashVariance < 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">DASHBOARD OVERVIEW</h1>
        <p className="text-gray-500">Welcome back! Here's what's happening with your store today.</p>
      </div>

      {/* KPI Cards */}
      <KPICards
        products={products}
        completedSales={completedSales}
        dayBalance={dayBalance}
        cashSalesToday={cashSalesToday}
        cashExpensesToday={cashExpensesToday}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Alert className={lowStockItems.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}>
          <AlertTitle className={lowStockItems.length > 0 ? 'text-orange-900' : 'text-green-900'}>
            Stock Watch
          </AlertTitle>
          <AlertDescription className={lowStockItems.length > 0 ? 'text-orange-800' : 'text-green-800'}>
            {lowStockItems.length > 0
              ? `${lowStockItems.length} product${lowStockItems.length === 1 ? '' : 's'} at or below reorder level.`
              : 'All visible products are above reorder level.'}
          </AlertDescription>
        </Alert>

        <Alert className={cashVariance < 0 ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
          <AlertTitle className={cashVariance < 0 ? 'text-red-900' : 'text-blue-900'}>
            Cash Position
          </AlertTitle>
          <AlertDescription className={cashVariance < 0 ? 'text-red-800' : 'text-blue-800'}>
            {cashVariance === 0
              ? 'Cash drawer matches expected cash.'
              : `${cashVariance > 0 ? 'Over' : 'Short'} by ${formatCurrency(Math.abs(cashVariance))}.`}
          </AlertDescription>
        </Alert>

        <Alert className={hasCriticalAlerts ? 'border-slate-200 bg-white' : 'border-green-200 bg-green-50'}>
          <AlertTitle className={hasCriticalAlerts ? 'text-slate-900' : 'text-green-900'}>
            Today
          </AlertTitle>
          <AlertDescription className={hasCriticalAlerts ? 'text-slate-700' : 'text-green-800'}>
            <span>{todaySales.length} transactions</span>
            <Badge variant="secondary" className="ml-2 bg-white text-slate-700">
              {formatCurrency(todayRevenue)}
            </Badge>
          </AlertDescription>
        </Alert>
      </div>

      {/* Charts Section */}
      <Charts completedSales={completedSales} products={products} />

      {/* Data Tables */}
      <DataTables products={products} completedSales={completedSales} />

      {/* Quick Actions and Staff Leaderboard */}
      <QuickActions completedSales={completedSales} userRole={userRole} onAction={onQuickAction} />
    </div>
  );
}
