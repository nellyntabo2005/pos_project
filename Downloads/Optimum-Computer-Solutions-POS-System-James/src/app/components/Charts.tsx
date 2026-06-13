import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend } from 'recharts';
import type { CompletedSale, POSProduct } from './pages/POSPageEnhanced';
import { formatCurrency } from './utils/helpers';

const chartColors = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];
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

interface ChartsProps {
  completedSales: CompletedSale[];
  products: POSProduct[];
}

const buildSalesData = (completedSales: CompletedSale[]) => {
  const buckets = new Map<string, { name: string; sales: number; transactions: number }>();
  const today = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, {
      name: date.toLocaleDateString('en-US', { weekday: 'short' }),
      sales: 0,
      transactions: 0
    });
  }

  completedSales.forEach((sale) => {
    const saleDate = new Date(sale.timestamp);
    const key = saleDate.toISOString().slice(0, 10);
    const bucket = buckets.get(key);

    if (!bucket) return;

    bucket.sales += sale.amount;
    bucket.transactions += 1;
  });

  return Array.from(buckets.values());
};

const buildPaymentData = (completedSales: CompletedSale[]) => {
  const totalsByMethod = new Map<string, number>();

  completedSales.forEach((sale) => {
    const parts = sale.method.split(',').map(part => part.trim()).filter(Boolean);

    if (parts.length === 0) {
      totalsByMethod.set('Unknown', (totalsByMethod.get('Unknown') || 0) + sale.amount);
      return;
    }

    parts.forEach((part) => {
      const [rawMethod, rawAmount] = part.split(':');
      const method = (rawMethod || 'Unknown').trim().replace(/\b\w/g, letter => letter.toUpperCase());
      const parsedAmount = Number((rawAmount || '').replace(/[^\d.-]/g, ''));
      const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : sale.amount / parts.length;

      totalsByMethod.set(method, (totalsByMethod.get(method) || 0) + amount);
    });
  });

  return Array.from(totalsByMethod.entries()).map(([name, value], index) => ({
    name,
    value,
    color: chartColors[index % chartColors.length]
  }));
};

const buildProductSalesData = (completedSales: CompletedSale[]) => {
  const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();

  completedSales.forEach((sale) => {
    sale.items.forEach((item) => {
      const current = productTotals.get(item.productId) || {
        name: item.name,
        quantity: 0,
        revenue: 0
      };
      current.quantity += item.quantity * item.stockUnits;
      current.revenue += item.total;
      productTotals.set(item.productId, current);
    });
  });

  return Array.from(productTotals.values())
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 6);
};

const buildCategoryData = (products: POSProduct[]) => {
  const totalsByCategory = new Map<string, number>();

  products.forEach((product) => {
    totalsByCategory.set(product.category, (totalsByCategory.get(product.category) || 0) + 1);
  });

  return Array.from(totalsByCategory.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, value], index) => ({
      name,
      value,
      color: chartColors[index % chartColors.length]
    }));
};

export function Charts({ completedSales, products }: ChartsProps) {
  const salesData = useMemo(() => buildSalesData(completedSales), [completedSales]);
  const paymentData = useMemo(() => buildPaymentData(completedSales), [completedSales]);
  const productSalesData = useMemo(() => buildProductSalesData(completedSales), [completedSales]);
  const categoryData = useMemo(() => buildCategoryData(products), [products]);
  const hasSales = completedSales.length > 0;
  const totalProductsSold = useMemo(
    () => completedSales.reduce(
      (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + (item.quantity * item.stockUnits), 0),
      0
    ),
    [completedSales]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
      {/* Sales Over Time Chart */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-900">Sales Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSales ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No sales yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={salesData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke={axisColor} tickLine={false} axisLine={false} width={72} tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} labelStyle={{ color: '#334155', fontWeight: 600 }} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#2563EB" strokeWidth={3} fill="url(#salesGradient)" dot={{ r: 3, fill: '#2563EB', stroke: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#2563EB', stroke: '#DBEAFE', strokeWidth: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Product Sales Chart */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-900">Top Products Sold ({totalProductsSold})</CardTitle>
        </CardHeader>
        <CardContent>
          {productSalesData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No product sales yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productSalesData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} tickFormatter={(value) => String(value).length > 10 ? `${String(value).slice(0, 10)}...` : String(value)} />
                <YAxis stroke={axisColor} tickLine={false} axisLine={false} width={60} tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === 'Revenue' ? formatCurrency(Number(value)) : Number(value).toFixed(0)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="revenue" fill="#059669" name="Revenue" radius={[6, 6, 0, 0]} />
                <Bar dataKey="quantity" fill="#D97706" name="Units" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Payment Type Chart */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-900">Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No payments yet</div>
          ) : (
            <>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                    outerRadius={104}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#ffffff"
                    strokeWidth={3}
                  >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {paymentData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    ></div>
                    <span className="text-sm text-gray-600">
                      {item.name} ({formatCurrency(item.value)})
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-900">Category Mix</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No products yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    dataKey="value"
                    paddingAngle={3}
                    stroke="#ffffff"
                    strokeWidth={3}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`category-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {categoryData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span className="font-medium text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
