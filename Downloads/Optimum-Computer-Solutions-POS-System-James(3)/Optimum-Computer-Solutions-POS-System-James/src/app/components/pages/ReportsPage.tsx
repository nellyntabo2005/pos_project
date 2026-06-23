import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, ReferenceLine } from 'recharts';
import { Download, Loader2, TrendingUp, DollarSign, ShoppingCart, Users, Package, Receipt } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { exportReportPdf } from '../../services/api';
import type { BusinessExpense, SupplierOrderInvoice } from '../../types/supplierOrder';
import type { CompletedSale, DayBalance, POSProduct } from './POSPageEnhanced';

interface ReportsPageProps {
  products: POSProduct[];
  completedSales: CompletedSale[];
  expenses: BusinessExpense[];
  supplierInvoices: SupplierOrderInvoice[];
  dayBalance: DayBalance;
}

type DateRange = '7days' | '30days' | '3months' | '6months' | '1year';
type ReportAccount = 'all' | 'sales' | 'expenses' | 'suppliers' | 'inventory' | 'cash';

const rangeDays: Record<DateRange, number> = {
  '7days': 7,
  '30days': 30,
  '3months': 90,
  '6months': 180,
  '1year': 365
};

const shortDate = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toLocaleString('en-US', { month: 'short' });
const toDate = (value: string | Date) => value instanceof Date ? value : new Date(value);
const axisColor = '#64748B';
const gridColor = '#E2E8F0';
const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  boxShadow: '0 18px 45px -24px rgb(15 23 42 / 0.45)',
  color: '#0F172A'
};
const compactCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `${formatCurrency(value / 1000000)}M`;
  if (Math.abs(value) >= 1000) return `${formatCurrency(value / 1000)}K`;
  return formatCurrency(value);
};
const shortLabel = (value: string) => value.length > 18 ? `${value.slice(0, 18)}...` : value;
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export function ReportsPage({ products, completedSales, expenses, supplierInvoices, dayBalance }: ReportsPageProps) {
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [reportAccount, setReportAccount] = useState<ReportAccount>('all');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const startDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - rangeDays[dateRange]);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [dateRange]);

  const filteredSales = completedSales.filter(sale => toDate(sale.timestamp) >= startDate);
  const filteredExpenses = expenses.filter(expense => toDate(expense.date) >= startDate);
  const filteredSupplierInvoices = supplierInvoices.filter(invoice => toDate(invoice.date) >= startDate);

  const revenue = filteredSales.reduce((sum, sale) => sum + sale.amount, 0);
  const taxCollected = filteredSales.reduce((saleSum, sale) => saleSum + sale.items.reduce((itemSum, item) => {
    const fallbackTax = products.find(product => product.id === item.productId)?.tax || 0;
    const taxRate = Number(item.tax ?? fallbackTax) || 0;
    return itemSum + (taxRate > 0 ? item.total * (taxRate / (100 + taxRate)) : 0);
  }, 0), 0);
  const revenueExcludingTax = Math.max(0, revenue - taxCollected);
  const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const supplierSpend = filteredSupplierInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const transactions = filteredSales.length;
  const averageOrderValue = transactions > 0 ? revenue / transactions : 0;
  const uniqueCustomers = new Set(filteredSales.map(sale => sale.customer || 'Walk-in Customer')).size;
  const inventoryValue = products.reduce((sum, product) => sum + product.stock * product.prices.wholesale, 0);
  const outstandingSupplierBalance = supplierInvoices
    .filter(invoice => invoice.status === 'requested' || invoice.status === 'pending')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const grossProfit = revenue - expenseTotal;

  const salesTrend = useMemo(() => {
    const buckets = new Map<string, { name: string; revenue: number; transactions: number }>();
    const days = rangeDays[dateRange];

    if (dateRange === '7days' || dateRange === '30days') {
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = shortDate(date);
        buckets.set(key, {
          name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: 0,
          transactions: 0
        });
      }
    } else {
      const monthCount = dateRange === '3months' ? 3 : dateRange === '6months' ? 6 : 12;
      for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setMonth(date.getMonth() - offset, 1);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        buckets.set(key, { name: monthKey(date), revenue: 0, transactions: 0 });
      }
    }

    filteredSales.forEach(sale => {
      const date = toDate(sale.timestamp);
      const key = dateRange === '7days' || dateRange === '30days' ? shortDate(date) : `${date.getFullYear()}-${date.getMonth()}`;
      const name = dateRange === '7days' || dateRange === '30days' ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : monthKey(date);
      const bucket = buckets.get(key) || { name, revenue: 0, transactions: 0 };
      bucket.revenue += sale.amount;
      bucket.transactions += 1;
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values());
  }, [filteredSales, dateRange]);

  const productPerformance = useMemo(() => {
    const productTotals = new Map<string, { name: string; sales: number; revenue: number; stock: number }>();
    products.forEach(product => {
      productTotals.set(product.id, { name: product.name, sales: 0, revenue: 0, stock: product.stock });
    });
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const current = productTotals.get(item.productId) || { name: item.name, sales: 0, revenue: 0, stock: 0 };
        current.sales += item.quantity;
        current.revenue += item.total;
        productTotals.set(item.productId, current);
      });
    });
    return Array.from(productTotals.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 8);
  }, [filteredSales, products]);

  const profitData = useMemo(() => {
    const buckets = new Map<string, { name: string; revenue: number; expenses: number; supplierSpend: number; profit: number }>();
    const ensureBucket = (date: Date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = buckets.get(key) || { name: monthKey(date), revenue: 0, expenses: 0, supplierSpend: 0, profit: 0 };
      buckets.set(key, bucket);
      return bucket;
    };

    filteredSales.forEach(sale => {
      ensureBucket(toDate(sale.timestamp)).revenue += sale.amount;
    });
    filteredExpenses.forEach(expense => {
      ensureBucket(toDate(expense.date)).expenses += expense.amount;
    });
    filteredSupplierInvoices.forEach(invoice => {
      ensureBucket(toDate(invoice.date)).supplierSpend += invoice.amount;
    });

    return Array.from(buckets.values()).map(bucket => ({
      ...bucket,
      profit: bucket.revenue - bucket.expenses
    }));
  }, [filteredSales, filteredExpenses, filteredSupplierInvoices]);

  const keyMetrics = [
    { title: 'Tax-Inclusive Revenue', value: formatCurrency(revenue), change: `${transactions} completed sales`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-500/20' },
    { title: 'Total Transactions', value: String(transactions), change: `${formatCurrency(averageOrderValue)} avg order`, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-500/20' },
    { title: 'Gross Profit', value: formatCurrency(grossProfit), change: `${formatCurrency(expenseTotal)} expenses`, icon: TrendingUp, color: grossProfit >= 0 ? 'text-purple-600' : 'text-red-600', bg: 'bg-purple-500/20' },
    { title: 'Unique Customers', value: String(uniqueCustomers), change: `${formatCurrency(outstandingSupplierBalance)} supplier balance`, icon: Users, color: 'text-orange-600', bg: 'bg-orange-500/20' }
  ];

  const accountSummaries: Record<ReportAccount, { label: string; rows: Array<[string, string]> }> = {
    all: {
      label: 'All Accounts',
      rows: [
        ['Revenue', formatCurrency(revenue)],
        ['Revenue excluding tax', formatCurrency(revenueExcludingTax)],
        ['Tax collected', formatCurrency(taxCollected)],
        ['Transactions', String(transactions)],
        ['Average order value', formatCurrency(averageOrderValue)],
        ['Expenses', formatCurrency(expenseTotal)],
        ['Supplier purchases', formatCurrency(supplierSpend)],
        ['Inventory value', formatCurrency(inventoryValue)],
        ['Cash drawer status', dayBalance.status === 'open' ? 'Open' : 'Closed']
      ]
    },
    sales: {
      label: 'Sales Account',
      rows: [
        ['Revenue', formatCurrency(revenue)],
        ['Revenue excluding tax', formatCurrency(revenueExcludingTax)],
        ['Tax collected', formatCurrency(taxCollected)],
        ['Completed sales', String(transactions)],
        ['Average order value', formatCurrency(averageOrderValue)],
        ['Unique customers', String(uniqueCustomers)]
      ]
    },
    expenses: {
      label: 'Expense Account',
      rows: [
        ['Operating expenses', formatCurrency(expenseTotal)],
        ['Expense records', String(filteredExpenses.length)],
        ['Gross profit after expenses', formatCurrency(grossProfit)]
      ]
    },
    suppliers: {
      label: 'Supplier Account',
      rows: [
        ['Supplier purchases', formatCurrency(supplierSpend)],
        ['Supplier invoices', String(filteredSupplierInvoices.length)],
        ['Outstanding supplier balance', formatCurrency(outstandingSupplierBalance)]
      ]
    },
    inventory: {
      label: 'Inventory Account',
      rows: [
        ['Inventory value', formatCurrency(inventoryValue)],
        ['Products tracked', String(products.length)],
        ['Low-stock items', String(products.filter(product => product.stock <= (product.reorderLevel || 10)).length)]
      ]
    },
    cash: {
      label: 'Cash Account',
      rows: [
        ['Drawer status', dayBalance.status === 'open' ? 'Open' : 'Closed'],
        ['Opening balance', formatCurrency(dayBalance.openingBalance)],
        ['Closing balance', dayBalance.closingBalance === null ? 'Not closed' : formatCurrency(dayBalance.closingBalance)]
      ]
    }
  };

  const exportPdf = async () => {
    const summary = accountSummaries[reportAccount];
    setIsExportingPdf(true);
    try {
      const blob = await exportReportPdf({
        title: `${summary.label} Report`,
        summary: {
          Revenue: formatCurrency(revenue),
          'Revenue excluding tax': formatCurrency(revenueExcludingTax),
          'Tax collected': formatCurrency(taxCollected),
          Expenses: formatCurrency(expenseTotal),
          Profit: formatCurrency(grossProfit),
          Period: dateRange.replace('days', ' days').replace('months', ' months')
        },
        rows: summary.rows.map(([metric, value]) => ({ metric, value }))
      });
      downloadBlob(blob, `${summary.label.toLowerCase().replace(/\s+/g, '-')}-report.pdf`);
      toast.success('PDF report exported');
    } catch (error) {
      toast.error('PDF export failed', {
        description: error instanceof Error ? error.message : 'Please check the backend server and try again.'
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reports & Analytics</h1>
          <p className="text-gray-500">Business performance from live sales, expenses, purchases, and stock</p>
        </div>
        <div className="flex gap-2">
          <Select value={reportAccount} onValueChange={(value) => setReportAccount(value as ReportAccount)}>
            <SelectTrigger className="w-44 bg-gray-100 border-gray-200 text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-100 border-gray-200">
              <SelectItem value="all">All Accounts</SelectItem>
              <SelectItem value="sales">Sales Account</SelectItem>
              <SelectItem value="expenses">Expense Account</SelectItem>
              <SelectItem value="suppliers">Supplier Account</SelectItem>
              <SelectItem value="inventory">Inventory Account</SelectItem>
              <SelectItem value="cash">Cash Account</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
            <SelectTrigger className="w-40 bg-gray-100 border-gray-200 text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-100 border-gray-200">
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportPdf} disabled={isExportingPdf}>
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isExportingPdf ? 'Exporting' : 'Export PDF'}
          </Button>
        </div>
      </div>

      <Card className="mb-6 bg-white border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-gray-900">{accountSummaries[reportAccount].label} Classification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Control Account</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {accountSummaries[reportAccount].rows.map(([metric, value]) => (
                  <tr key={metric} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-700">{metric}</td>
                    <td className="py-2 font-semibold text-gray-900">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {keyMetrics.map((metric) => {
          const IconComponent = metric.icon;
          return (
            <Card key={metric.title} className="bg-white border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">{metric.title}</p>
                    <p className="text-2xl font-semibold text-gray-900">{metric.value}</p>
                    <p className="text-gray-500 text-xs flex items-center gap-1 mt-1">
                      <TrendingUp className="w-3 h-3" />
                      {metric.change}
                    </p>
                  </div>
                  <div className={`p-2 ${metric.bg} rounded-lg`}>
                    <IconComponent className={`w-6 h-6 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Inventory Value</p>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(inventoryValue)}</p>
            </div>
            <Package className="w-6 h-6 text-blue-600" />
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Supplier Purchases</p>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(supplierSpend)}</p>
            </div>
            <Receipt className="w-6 h-6 text-orange-600" />
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Cash Drawer</p>
              <p className="text-xl font-semibold text-gray-900">{dayBalance.status === 'open' ? 'Open' : 'Closed'}</p>
            </div>
            <DollarSign className="w-6 h-6 text-green-600" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="bg-white border-gray-200">
          <TabsTrigger value="sales" className="data-[state=active]:bg-blue-600">Sales Report</TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-blue-600">Product Performance</TabsTrigger>
          <TabsTrigger value="profit" className="data-[state=active]:bg-blue-600">Profit & Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-gray-900">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesTrend} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="reportRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 6" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="name" stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis stroke={axisColor} tickLine={false} axisLine={false} width={72} tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} labelStyle={{ color: '#334155', fontWeight: 600 }} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" strokeWidth={3} fill="url(#reportRevenueGradient)" dot={{ r: 3, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#059669', stroke: '#D1FAE5', strokeWidth: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-gray-900">Transactions Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesTrend} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 6" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="name" stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis stroke={axisColor} tickLine={false} axisLine={false} width={42} allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="transactions" name="Transactions" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-gray-900">Product Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={productPerformance} layout="vertical" margin={{ top: 10, right: 24, left: 18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" stroke={axisColor} tickLine={false} axisLine={false} tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" stroke={axisColor} tickLine={false} axisLine={false} width={150} tickFormatter={shortLabel} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === 'Revenue' ? formatCurrency(Number(value)) : Number(value).toFixed(0)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="revenue" fill="#7C3AED" name="Revenue" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="stock" fill="#0891B2" name="Stock" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-gray-900">Profit & Loss Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="name" stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke={axisColor} tickLine={false} axisLine={false} width={72} tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#94A3B8" />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="revenue" fill="#059669" name="Revenue" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" fill="#DC2626" name="Expenses" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="supplierSpend" fill="#D97706" name="Supplier Purchases" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="profit" fill="#2563EB" name="Profit" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
