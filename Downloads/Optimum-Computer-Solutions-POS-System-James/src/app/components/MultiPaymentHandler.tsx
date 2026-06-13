import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { CheckCircle, DollarSign, TrendingUp, TrendingDown, Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatCurrency } from './utils/helpers';
import { getMpesaPaymentStatus, initiateMpesaPayment, type MpesaPaymentStatus } from '../services/api';
import { useAppLanguage } from '../services/language';
import { toast } from 'sonner';

export type PaymentMethod = 'cash' | 'card' | 'mpesa' | 'check' | 'bank_transfer';

export interface PaymentTransaction {
  method: PaymentMethod;
  amount: number;
  timestamp: Date;
  reference?: string;
}

interface MultiPaymentProps {
  totalAmount: number;
  customerName?: string;
  onComplete: (payments: PaymentTransaction[]) => void;
  onCancel: () => void;
}

export function MultiPaymentHandler({ totalAmount, customerName = 'Walk-in Customer', onComplete, onCancel }: MultiPaymentProps) {
  const { t } = useAppLanguage();
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod>('cash');
  const [currentAmount, setCurrentAmount] = useState('');
  const [reference, setReference] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaMessage, setMpesaMessage] = useState('');
  const [mpesaStatement, setMpesaStatement] = useState<PaymentTransaction | null>(null);
  const [mpesaStatementPhone, setMpesaStatementPhone] = useState('');
  const [isSendingMpesaPrompt, setIsSendingMpesaPrompt] = useState(false);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = totalAmount - totalPaid;
  const currentAmountNumber = parseFloat(currentAmount);
  const sleep = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const isStatusComplete = (paymentStatus: MpesaPaymentStatus) => (
    ['completed', 'paid', 'success'].includes(paymentStatus.status) ||
    paymentStatus.result_code === 0 ||
    Boolean(paymentStatus.mpesa_receipt_number)
  );

  const formatPaymentMethod = (method: PaymentMethod) => {
    if (method === 'mpesa') return 'M-Pesa';
    if (method === 'bank_transfer') return 'Bank Transfer';
    if (method === 'card') return 'Credit/Debit Card';
    if (method === 'check') return 'Check';
    return 'Cash';
  };

  const addPayment = async () => {
    if (!currentAmount || currentAmountNumber <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (currentAmountNumber > remaining) {
      toast.warning('Amount is too high', {
        description: `Amount cannot exceed remaining: ${formatCurrency(remaining)}.`
      });
      return;
    }

    let paymentReference = reference || undefined;

    if (currentMethod === 'mpesa') {
      if (!mpesaPhone.trim()) {
        toast.error('M-Pesa phone required', {
          description: 'Enter the customer M-Pesa phone number.'
        });
        return;
      }

      setIsSendingMpesaPrompt(true);
      setMpesaMessage('');

      try {
        const response = await initiateMpesaPayment({
          phoneNumber: mpesaPhone.trim(),
          amount: currentAmountNumber,
          customerName,
          accountReference: customerName,
          transactionDesc: 'POS payment'
        });

        const checkoutRequestId = response.checkout_request_id || response.transaction?.checkout_request_id;
        if (!checkoutRequestId) {
          throw new Error('M-Pesa prompt was sent but no checkout request ID was returned.');
        }

        setMpesaMessage('Prompt sent. Waiting for customer confirmation...');

        const maxConfirmationAttempts = 40;
        let confirmedPayment: MpesaPaymentStatus | null = null;
        let lastStatusError = '';
        for (let attempt = 0; attempt < maxConfirmationAttempts; attempt += 1) {
          await sleep(3000);
          const status = await getMpesaPaymentStatus(checkoutRequestId);
          lastStatusError = status.query_error || '';

          if (isStatusComplete(status)) {
            confirmedPayment = status;
            break;
          }

          if (['failed', 'cancelled', 'timeout'].includes(status.status)) {
            throw new Error(status.result_desc || `M-Pesa payment ${status.status}.`);
          }

          setMpesaMessage(`Waiting for M-Pesa confirmation... ${attempt + 1}/${maxConfirmationAttempts}`);
        }

        if (!confirmedPayment) {
          const setupMessage = lastStatusError
            ? 'M-Pesa payment could not be confirmed. Check the Daraja credentials and callback URL in backend settings.'
            : 'Payment confirmation has not reached the POS yet. Please check that the customer completed the M-Pesa PIN prompt, then try again.';
          throw new Error(setupMessage);
        }

        const confirmedAmount = Number(confirmedPayment.amount);
        if (Math.abs(confirmedAmount - currentAmountNumber) >= 0.01) {
          throw new Error(`M-Pesa amount mismatch. Expected ${formatCurrency(currentAmountNumber)}, received ${formatCurrency(confirmedAmount)}.`);
        }

        paymentReference = `${mpesaPhone.trim()} - ${customerName}`;
      } catch (error) {
        toast.error('M-Pesa prompt failed', {
          description: error instanceof Error ? error.message : 'M-Pesa prompt could not be sent.'
        });
        setIsSendingMpesaPrompt(false);
        return;
      } finally {
        setIsSendingMpesaPrompt(false);
      }
    }

    const newPayment: PaymentTransaction = {
      method: currentMethod,
      amount: currentAmountNumber,
      timestamp: new Date(),
      reference: paymentReference
    };

    const nextPayments = [...payments, newPayment];
    const nextTotalPaid = nextPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const isPaymentComplete = Math.abs(nextTotalPaid - totalAmount) < 0.01;

    setPayments(nextPayments);
    setCurrentAmount('');
    setReference('');
    setMpesaPhone('');

    if (currentMethod === 'mpesa') {
      setMpesaMessage(isPaymentComplete ? t('Transaction complete') : `M-Pesa confirmed: ${formatCurrency(currentAmountNumber)}`);
      setMpesaStatementPhone(mpesaPhone.trim());
      setMpesaStatement(newPayment);
    }
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const isComplete = Math.abs(totalPaid - totalAmount) < 0.01;

  const completePayment = () => {
    if (!isComplete) {
      toast.warning(t('Please complete your payment'));
      return;
    }

    onComplete(payments);
  };

  return (
    <div className="space-y-4">
      <AlertDialog open={Boolean(mpesaStatement)} onOpenChange={(open) => !open && setMpesaStatement(null)}>
        <AlertDialogContent className="max-w-sm border-green-200 bg-white">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <AlertDialogTitle className="text-green-900">{t('M-Pesa Statement')}</AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-600">{t('Payment received from M-Pesa.')}</p>
              </div>
            </div>
          </AlertDialogHeader>
          {mpesaStatement && (
            <div className="space-y-3">
              <div className="rounded-lg bg-gray-50 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">{t('Amount')}</span>
                  <span className="font-bold text-gray-900">{formatCurrency(mpesaStatement.amount)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span className="text-gray-600">{t('Phone')}</span>
                  <span className="font-semibold text-gray-900">{mpesaStatementPhone || '-'}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span className="text-gray-600">{t('Customer')}</span>
                  <span className="max-w-44 truncate font-semibold text-gray-900">{customerName}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span className="text-gray-600">{t('Reference')}</span>
                  <span className="max-w-44 truncate text-xs font-semibold text-gray-900">
                    {mpesaStatementPhone ? `${mpesaStatementPhone} - ${customerName}` : customerName}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-4 border-t border-gray-200 pt-2">
                  <span className="text-gray-600">{t('Status')}</span>
                  <span className="font-semibold text-green-700">{t('Transaction complete')}</span>
                </div>
              </div>
              <Button
                type="button"
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => setMpesaStatement(null)}
              >
                {t('Mark as read')}
              </Button>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
        <p className="text-sm text-gray-600 mb-1">{t('Total Amount Due')}</p>
        <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-600">{t('Payment Method')}</label>
            <Select value={currentMethod} onValueChange={(val) => {
              setCurrentMethod(val as PaymentMethod);
              setReference('');
              setMpesaMessage('');
            }}>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Credit/Debit Card</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">{t('Amount')}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
              <Input
                type="number"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="pl-12 bg-white border-gray-300"
              />
            </div>
          </div>
        </div>

        {(currentMethod === 'check' || currentMethod === 'bank_transfer') && (
          <div>
            <label className="text-sm font-medium text-gray-600">Reference/Check #</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Enter reference number"
              className="bg-white border-gray-300"
            />
          </div>
        )}

        {currentMethod === 'mpesa' && (
          <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
            <div>
              <label className="text-sm font-medium text-gray-600">{t('M-Pesa Phone Number')}</label>
              <Input
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="e.g. 254712345678"
                className="bg-white border-gray-300"
              />
            </div>
            {mpesaMessage && <p className="text-xs font-medium text-green-700">{mpesaMessage}</p>}
          </div>
        )}

        <Button 
          onClick={addPayment} 
          className="w-full bg-blue-600 hover:bg-blue-700"
          disabled={!currentAmount || currentAmountNumber <= 0 || isSendingMpesaPrompt}
        >
          <Plus className="w-4 h-4 mr-2" />
          {isSendingMpesaPrompt ? 'Checking M-Pesa payment...' : currentMethod === 'mpesa' ? t('Send M-Pesa Prompt') : t('Add Payment')}
        </Button>
      </div>

      {/* Payments List */}
      {payments.length > 0 && (
        <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 mb-3">{t('Payment Breakdown')}</p>
          {payments.map((payment, idx) => (
            <div key={idx} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{formatPaymentMethod(payment.method)}</p>
                {payment.reference && <p className="text-xs text-gray-500">Ref: {payment.reference}</p>}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removePayment(idx)}
                  className="h-6 w-6 p-0"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <Card className="border-gray-200">
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t('Total Paid')}</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t('Remaining')}</span>
              <span className={`font-semibold ${remaining <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {formatCurrency(Math.max(0, remaining))}
              </span>
            </div>
            {totalPaid > totalAmount && (
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">{t('Change Due')}</span>
                <span className="font-bold text-green-600">{formatCurrency(totalPaid - totalAmount)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button 
          onClick={onCancel}
          variant="outline"
          className="flex-1"
        >
          {t('Cancel')}
        </Button>
        <Button 
          onClick={completePayment}
          disabled={isSendingMpesaPrompt}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isSendingMpesaPrompt ? 'Checking payment...' : t('Complete Payment')}
        </Button>
      </div>
    </div>
  );
}
