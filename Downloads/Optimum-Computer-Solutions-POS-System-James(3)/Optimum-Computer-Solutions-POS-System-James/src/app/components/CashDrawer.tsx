import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Clock, DollarSign } from 'lucide-react';
import { formatCurrency } from './utils/helpers';
import type { DayBalance } from './pages/POSPageEnhanced';

export interface CashDrawerData {
  id: string;
  cashierId: string;
  date: string;
  openingBalance: number;
  closingBalance: number;
  transactions: number;
  status: 'open' | 'closed';
  createdAt: Date;
  closedAt?: Date;
}

interface CashDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  cashier: string;
  dayBalance: DayBalance;
  cashSalesToday: number;
  cashExpensesToday: number;
  onOpenDay: (openingBalance: number) => void;
  onCloseDay: (closingBalance: number) => void;
}

export function CashDrawer({
  isOpen,
  onOpenChange,
  cashier,
  dayBalance,
  cashSalesToday,
  cashExpensesToday,
  onOpenDay
}: CashDrawerProps) {
  const nextOpeningBalance = dayBalance.closingBalance ?? dayBalance.openingBalance;
  const [openingBalance, setOpeningBalance] = useState(nextOpeningBalance.toString());
  const expectedClosingBalance = dayBalance.openingBalance + cashSalesToday - cashExpensesToday;
  const openedAt = dayBalance.openedAt ? new Date(dayBalance.openedAt) : null;
  const autoCloseAt = openedAt ? new Date(openedAt.getTime() + 8 * 60 * 60 * 1000) : null;

  useEffect(() => {
    if (dayBalance.status === 'closed') {
      setOpeningBalance(String(nextOpeningBalance));
    }
  }, [dayBalance.status, nextOpeningBalance]);

  const handleOpenDrawer = (event: React.FormEvent) => {
    event.preventDefault();

    if (openingBalance && parseFloat(openingBalance) >= 0) {
      onOpenDay(parseFloat(openingBalance));
      onOpenChange(false);
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (dayBalance.status === 'closed') {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2 w-full">
            <DollarSign className="w-4 h-4" />
            Open Cash Drawer
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle>Open Cash Drawer for Today</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOpenDrawer} className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-sm text-gray-600">Date</p>
              <p className="font-semibold text-gray-900">{today}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-2 text-sm text-gray-600">Cashier</p>
              <p className="font-semibold text-gray-900">{cashier}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600">Opening Balance</label>
              {dayBalance.closingBalance !== null && (
                <p className="text-xs text-gray-500">
                  Carried forward from previous cashier: {formatCurrency(dayBalance.closingBalance)}
                </p>
              )}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KSh </span>
                <Input
                  type="number"
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  className="pl-12 bg-white border-gray-300"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
              Open Drawer
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-green-600 hover:bg-green-700 w-full">
          <DollarSign className="w-4 h-4" />
          Drawer Open
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white border-gray-200 max-w-md">
        <DialogHeader>
          <DialogTitle>Cash Drawer Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-xs text-gray-600">Opening Balance</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(dayBalance.openingBalance)}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-600">Today's Cash Sales</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(cashSalesToday)}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-600">Today's Cash Expenses</p>
                <p className="text-lg font-bold text-red-600">-{formatCurrency(cashExpensesToday)}</p>
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-xs text-gray-600">Expected Balance at Auto Close</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(expectedClosingBalance)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-700" />
              <p className="text-sm font-medium text-green-900">Automatic close enabled</p>
            </div>
            <p className="text-sm text-green-800">
              This drawer closes automatically after the cashier's 8-hour shift. The closing amount becomes the next cashier's opening balance.
            </p>
            {openedAt && (
              <p className="mt-2 text-xs text-green-700">
                Opened: {openedAt.toLocaleString()}
              </p>
            )}
            {autoCloseAt && (
              <p className="mt-1 text-xs text-green-700">
                Auto close time: {autoCloseAt.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
