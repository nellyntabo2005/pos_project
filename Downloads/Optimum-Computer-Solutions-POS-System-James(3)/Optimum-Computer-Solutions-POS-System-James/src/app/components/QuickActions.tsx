import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { formatCurrency } from './utils/helpers';
import type { CompletedSale } from './pages/POSPageEnhanced';
import type { UserRole } from '../types/auth';
import { canUseQuickAction } from '../services/permissions';

export type QuickActionId = 'new-sale' | 'add-product' | 'add-customer' | 'quick-invoice';

interface QuickActionsProps {
  completedSales: CompletedSale[];
  userRole: UserRole;
  onAction: (action: QuickActionId) => void;
}

const quickActions: Array<{
  id: QuickActionId;
  label: string;
  className: string;
}> = [
  {
    id: 'new-sale',
    label: 'New Sale',
    className: 'bg-blue-600 hover:bg-blue-700'
  },
  {
    id: 'add-product',
    label: 'Add Product',
    className: 'bg-green-600 hover:bg-green-700'
  },
  {
    id: 'add-customer',
    label: 'Add Customer',
    className: 'bg-purple-600 hover:bg-purple-700'
  },
  {
    id: 'quick-invoice',
    label: 'Quick Invoice',
    className: 'bg-orange-600 hover:bg-orange-700'
  }
];

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getTopSellersForToday = (completedSales: CompletedSale[]) => {
  const todayKey = getTodayKey();
  const sellerMap = new Map<string, { name: string; salesAmount: number; transactions: number }>();

  completedSales
    .filter(sale => sale.timestamp.toISOString().slice(0, 10) === todayKey)
    .forEach(sale => {
      const sellerName = sale.cashier || 'John Cashier';
      const current = sellerMap.get(sellerName) ?? {
        name: sellerName,
        salesAmount: 0,
        transactions: 0
      };

      current.salesAmount += sale.amount;
      current.transactions += 1;
      sellerMap.set(sellerName, current);
    });

  return Array.from(sellerMap.values())
    .sort((a, b) => b.salesAmount - a.salesAmount || b.transactions - a.transactions)
    .slice(0, 5)
    .map((seller, index) => ({
      ...seller,
      rank: index + 1
    }));
};

export function QuickActions({ completedSales, userRole, onAction }: QuickActionsProps) {
  const staffData = getTopSellersForToday(completedSales);
  const availableActions = quickActions.filter(action => canUseQuickAction(action.id, userRole));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Quick Action Buttons */}
      <Card className="bg-white border-gray-200 lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-gray-900">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableActions.map((action) => (
            <Button
              key={action.id}
              className={`w-full justify-center text-white ${action.className}`}
              onClick={() => onAction(action.id)}
            >
              {action.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Staff Leaderboard */}
      <Card className="bg-white border-gray-200 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-gray-900">Today's Top Sellers</CardTitle>
        </CardHeader>
        <CardContent>
          {staffData.length > 0 ? (
            <div className="space-y-4">
              {staffData.map((staff) => (
                <div key={staff.name} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      staff.rank === 1
                        ? 'bg-yellow-500 text-black'
                        : staff.rank === 2
                        ? 'bg-gray-300 text-black'
                        : staff.rank === 3
                        ? 'bg-orange-500 text-gray-900'
                        : 'bg-gray-400 text-white'
                    }`}>
                      {staff.rank}
                    </div>
                    <div>
                      <p className="text-gray-900 font-medium">{staff.name}</p>
                      <p className="text-gray-500 text-sm">{staff.transactions} transactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-600 font-semibold">{formatCurrency(staff.salesAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">No sellers ranked yet today</p>
              <p className="text-xs text-gray-500 mt-1">Complete a sale and this list will update automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
