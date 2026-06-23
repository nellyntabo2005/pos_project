import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Printer, X } from 'lucide-react';
import { formatCurrency } from './utils/helpers';
import { getStoredAppSettings } from '../services/settings';
import { createQrMatrix, createReceiptQrPayload } from '../utils/qrCode';

interface ReceiptItem {
  name: string;
  sku?: string;
  quantity: number;
  uom?: string;
  price: number;
  tax: number;
  total: number;
}

interface ReceiptProps {
  transactionId: string;
  timestamp: Date;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  discountAmount: number;
  tax: number;
  taxLabel?: string;
  total: number;
  paymentMethod: string;
  cashier: string;
  customerName?: string;
  onClose: () => void;
}

const code39Patterns: Record<string, string> = {
  '0': 'nnnwwnwnw',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn'
};

const createCode39Bars = (value: string) => {
  const cleanValue = value.replace(/[^A-Z0-9.\- $/+%]/g, '').slice(0, 32) || 'RECEIPT';
  const encodedValue = `*${cleanValue}*`;
  const narrow = 2;
  const wide = 5;
  const quietZone = 10;
  let x = quietZone;
  const bars: Array<{ x: number; width: number }> = [];

  encodedValue.split('').forEach((character) => {
    const pattern = code39Patterns[character] || code39Patterns['-'];

    pattern.split('').forEach((part, index) => {
      const width = part === 'w' ? wide : narrow;
      if (index % 2 === 0) {
        bars.push({ x, width });
      }
      x += width;
    });

    x += narrow;
  });

  return {
    bars,
    value: cleanValue,
    width: x + quietZone,
    height: 58
  };
};

export function Receipt({
  transactionId,
  timestamp,
  items,
  subtotal,
  discount,
  discountAmount,
  tax,
  taxLabel,
  total,
  paymentMethod,
  cashier,
  customerName = 'Walk-in Customer',
  onClose
}: ReceiptProps) {
  const appSettings = getStoredAppSettings();
  const { businessInfo, invoiceSettings, posSettings } = appSettings;
  const qrValue = createReceiptQrPayload(transactionId, total, timestamp);
  const barcodeValue = `${transactionId}-${Math.round(total * 100)}`.toUpperCase();
  const barcode = React.useMemo(() => createCode39Bars(barcodeValue), [barcodeValue]);
  const qrMatrix = createQrMatrix(qrValue);

  const handlePrint = () => {
    window.print();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-white border-gray-200 print:shadow-none print:border-0 print:max-w-2xl print:mx-0">
      <CardHeader className="pb-3 print:pb-2">
        <div className="flex justify-between items-start mb-4 print:mb-2">
          <CardTitle className="text-lg print:text-xl">Receipt</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="print:hidden"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 print:space-y-3">
        {/* Header Info */}
        <div className="text-center border-b border-gray-200 pb-3 print:pb-2">
          <div className="mb-3">
            <p className="text-lg font-bold text-gray-900">{businessInfo.name}</p>
            <p className="text-xs text-gray-500">{businessInfo.phone}</p>
            <p className="text-xs text-gray-500">{businessInfo.address}</p>
            {businessInfo.taxId && <p className="text-xs text-gray-500">Tax ID: {businessInfo.taxId}</p>}
          </div>
          <div className="text-sm font-mono">
            <p className="text-gray-600">Transaction ID</p>
            <p className="font-bold text-base">{transactionId}</p>
          </div>
        </div>

        {/* Date and Time */}
        <div className="text-center text-xs text-gray-600 border-b border-gray-200 pb-3 print:pb-2">
          <p className="font-mono">{formatTime(timestamp)}</p>
          <p className="text-gray-500 mt-1">Cashier: {cashier}</p>
          <p className="text-gray-500 mt-1">Customer: {customerName}</p>
        </div>

        {/* Items */}
        <div className="space-y-2 border-b border-gray-200 pb-3 print:pb-2">
          <div className="text-xs font-bold text-gray-700 grid grid-cols-5 gap-1 mb-2">
            <div className="col-span-2">Item</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
          </div>
          {items.map((item, index) => (
            <div key={index} className="text-xs text-gray-600">
              <div className="grid grid-cols-5 gap-1 mb-1">
                <div className="col-span-2 font-medium truncate">{item.name}</div>
                <div className="text-right">
                  {item.quantity}{item.uom ? ` ${item.uom}` : ''}
                </div>
                <div className="text-right">{formatCurrency(item.price)}</div>
                <div className="text-right font-semibold">{formatCurrency(item.total)}</div>
              </div>
              {item.tax > 0 && (
                <div className="text-gray-500 text-xs ml-2">
                  Tax: {item.tax}% included
                </div>
              )}
              {item.sku && (
                <div className="text-gray-500 text-xs ml-2 font-mono">
                  SKU/Barcode: {item.sku}
                </div>
              )}
            </div>
          ))}
        </div>

        {(posSettings.receiptBarcodeEnabled || posSettings.receiptQrEnabled) && (
          <div className="grid grid-cols-2 gap-3 border-b border-gray-200 pb-3 print:pb-2">
            {posSettings.receiptBarcodeEnabled && (
              <div className="text-center">
                <p className="mb-2 text-xs font-semibold text-gray-600">Live Barcode</p>
                <div className="mx-auto w-40 rounded bg-white px-2 py-2 ring-1 ring-gray-200">
                  <svg
                    viewBox={`0 0 ${barcode.width} ${barcode.height}`}
                    role="img"
                    aria-label={`Barcode for receipt ${barcode.value}`}
                    className="h-14 w-full"
                    preserveAspectRatio="none"
                  >
                    <rect width={barcode.width} height={barcode.height} fill="white" />
                    {barcode.bars.map((bar, index) => (
                      <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height={barcode.height} fill="#111827" />
                    ))}
                  </svg>
                </div>
                <p className="mt-1 break-all text-[10px] font-mono text-gray-500">{barcode.value}</p>
              </div>
            )}
            {posSettings.receiptQrEnabled && (
              <div className="text-center">
                <p className="mb-2 text-xs font-semibold text-gray-600">QR Code</p>
                <div
                  className="mx-auto grid h-28 w-28 rounded bg-white p-2 ring-1 ring-gray-200"
                  style={{ gridTemplateColumns: `repeat(${qrMatrix.length}, minmax(0, 1fr))` }}
                  aria-label={`QR code for receipt ${transactionId}`}
                >
                  {qrMatrix.flat().map((isFilled, index) => (
                    <div key={index} className={isFilled ? 'bg-gray-900' : 'bg-white'} />
                  ))}
                </div>
                <p className="mt-1 text-[10px] font-mono text-gray-500">Scan ref: {transactionId}</p>
              </div>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="space-y-2 text-sm print:text-base">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal:</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-orange-600">
              <span>Discount ({discount}%):</span>
              <span className="font-mono">-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Tax:</span>
            <span className="font-mono">{taxLabel || `${tax}%`}</span>
          </div>
          <div className="flex justify-between text-lg font-bold bg-blue-50 p-2 rounded">
            <span>Total:</span>
            <span className="font-mono">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="text-center text-xs text-gray-600 border-t border-gray-200 pt-3 print:pt-2">
          <p className="font-semibold">Payment Method</p>
          <p className="text-gray-700">{paymentMethod}</p>
        </div>

        {/* Footer */}
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 print:bg-white print:py-2">
          <p className="mb-1 text-sm font-semibold text-gray-800">{invoiceSettings.footerNote}</p>
          <p className="text-gray-400">Please keep this receipt for your records</p>
        </div>

        {/* Print Button */}
        <Button
          onClick={handlePrint}
          className="w-full bg-blue-600 hover:bg-blue-700 print:hidden"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print Receipt
        </Button>
      </CardContent>
    </Card>
  );
}
