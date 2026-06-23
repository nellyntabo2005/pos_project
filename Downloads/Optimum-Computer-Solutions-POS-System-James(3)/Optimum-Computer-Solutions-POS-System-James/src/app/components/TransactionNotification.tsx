import React, { useEffect } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { CheckCircle } from 'lucide-react';
import { formatCurrency } from './utils/helpers';

interface TransactionNotificationProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  paymentMethod: string;
  transactionId: string;
}

export function TransactionNotification({
  isOpen,
  onOpenChange,
  amount,
  paymentMethod,
  transactionId
}: TransactionNotificationProps) {
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      onOpenChange(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [isOpen, onOpenChange]);

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-1rem)] max-w-sm border-green-200 bg-white animate-in fade-in zoom-in-95 duration-300">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <AlertDialogTitle className="text-green-900">Transaction Complete</AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-gray-600">Amount</span>
              <span className="font-bold text-gray-900">{formatCurrency(amount)}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-gray-600">Method</span>
              <span className="break-words text-right font-semibold text-gray-900">{paymentMethod}</span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-gray-200 pt-2">
              <span className="text-sm text-gray-600">Transaction ID</span>
              <span className="break-all text-right font-mono text-xs text-gray-600">{transactionId}</span>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500">
            Drawer is now open for the next transaction
          </p>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
