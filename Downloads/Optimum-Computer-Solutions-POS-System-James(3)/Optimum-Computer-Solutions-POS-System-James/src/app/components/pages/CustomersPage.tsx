import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Plus, Search, Edit, Eye, Phone, Mail, MapPin } from 'lucide-react';
import type { BackendCustomer, CreateCustomerInput } from '../../services/api';
import type { CompletedSale } from './POSPageEnhanced';
import { formatCurrency } from '../utils/helpers';

interface CustomersPageProps {
  customers: BackendCustomer[];
  completedSales: CompletedSale[];
  openAddCustomerSignal?: number;
  onCustomerCreated: (customer: CreateCustomerInput) => Promise<void>;
}

const emptyForm: CreateCustomerInput = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  address_line2: '',
  city: '',
  county: '',
  postal_code: '',
  tax_number: '',
  pricing_tier: 'retail',
  notes: ''
};

const numberValue = (value: string | number | undefined) => Number(value || 0);

const formatDate = (value?: string | null) => {
  if (!value) return 'No purchases';
  return new Date(value).toLocaleDateString();
};

const buildFallbackCustomersFromSales = (completedSales: CompletedSale[]): BackendCustomer[] => {
  const summaries = new Map<string, BackendCustomer>();

  completedSales.forEach((sale) => {
    const name = sale.customer || 'Walk-in Customer';
    const current = summaries.get(name) ?? {
      id: summaries.size + 1,
      account_reference: `SALE-${summaries.size + 1}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'walkin'}@customer.local`,
      phone: 'Not captured',
      loyalty_points: 0,
      total_spent: 0,
      pricing_tier: 'retail',
      is_active: true,
      is_blacklisted: false,
      last_purchase_date: sale.timestamp.toISOString()
    };

    current.total_spent = numberValue(current.total_spent) + sale.amount;
    current.loyalty_points = Math.floor(numberValue(current.total_spent) / 100);
    current.last_purchase_date = sale.timestamp.toISOString();
    summaries.set(name, current);
  });

  return Array.from(summaries.values()).sort((a, b) => numberValue(b.total_spent) - numberValue(a.total_spent));
};

const saleMatchesCustomer = (sale: CompletedSale, customer: BackendCustomer) => {
  if (sale.customerId && sale.customerId === customer.id) return true;
  if (sale.customerAccountReference && sale.customerAccountReference === customer.account_reference) return true;
  return sale.customer.toLowerCase() === customer.name.toLowerCase();
};

export function CustomersPage({ customers, completedSales, openAddCustomerSignal = 0, onCustomerCreated }: CustomersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<BackendCustomer | null>(null);
  const [form, setForm] = useState<CreateCustomerInput>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const displayCustomers = useMemo(() => {
    if (customers.length === 0) return buildFallbackCustomersFromSales(completedSales);

    const mergedCustomers = customers.map(customer => {
      const customerSales = completedSales.filter(sale => saleMatchesCustomer(sale, customer));
      if (customerSales.length === 0) return customer;

      const saleTotal = customerSales.reduce((sum, sale) => sum + sale.amount, 0);
      const latestSale = customerSales.reduce((latest, sale) =>
        sale.timestamp > latest.timestamp ? sale : latest
      );

      return {
        ...customer,
        total_spent: numberValue(customer.total_spent) + saleTotal,
        loyalty_points: customer.loyalty_points + Math.floor(saleTotal / 100),
        last_purchase_date: latestSale.timestamp.toISOString()
      };
    });

    const unmatchedSales = completedSales.filter(sale =>
      !customers.some(customer => saleMatchesCustomer(sale, customer))
    );

    return [...mergedCustomers, ...buildFallbackCustomersFromSales(unmatchedSales)]
      .sort((a, b) => numberValue(b.total_spent) - numberValue(a.total_spent));
  }, [customers, completedSales]);

  useEffect(() => {
    if (openAddCustomerSignal > 0) {
      setIsAddDialogOpen(true);
    }
  }, [openAddCustomerSignal]);

  const filteredCustomers = displayCustomers.filter(customer => {
    const query = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.account_reference.toLowerCase().includes(query)
    );
  });

  const totalSpent = displayCustomers.reduce((sum, customer) => sum + numberValue(customer.total_spent), 0);
  const totalLoyaltyPoints = displayCustomers.reduce((sum, customer) => sum + customer.loyalty_points, 0);
  const getCustomerSales = (customer: BackendCustomer) =>
    completedSales.filter(sale => saleMatchesCustomer(sale, customer))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getPricingTier = (tier: BackendCustomer['pricing_tier']) => {
    if (tier === 'vip') return <Badge className="bg-yellow-500/20 text-yellow-700">VIP</Badge>;
    if (tier === 'wholesale') return <Badge className="bg-blue-500/20 text-blue-700">Wholesale</Badge>;
    return <Badge className="bg-gray-500/20 text-gray-700">Retail</Badge>;
  };

  const updateForm = (field: keyof CreateCustomerInput, value: string) => {
    setForm(previousForm => ({ ...previousForm, [field]: value }));
  };

  const handleSubmit = async () => {
    setFormError('');

    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      setFormError('Name, phone, and email are required.');
      return;
    }

    setIsSaving(true);
    try {
      await onCustomerCreated({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        tax_number: form.tax_number?.trim() || null,
        pricing_tier: form.pricing_tier || 'retail'
      });
      setForm(emptyForm);
      setIsAddDialogOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Customer could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Customer Management</h1>
          <p className="text-gray-500">Manage customer information and loyalty programs</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input placeholder="Full Name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="Phone Number" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="Email Address" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <select value={form.pricing_tier} onChange={(event) => updateForm('pricing_tier', event.target.value)} className="h-10 rounded-md border border-gray-200 bg-gray-100 px-3 text-sm text-gray-900">
                <option value="retail">Retail Customer</option>
                <option value="wholesale">Wholesale Customer</option>
                <option value="vip">VIP Customer</option>
              </select>
              <Input placeholder="Address Line 1" value={form.address_line1} onChange={(event) => updateForm('address_line1', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="Address Line 2" value={form.address_line2} onChange={(event) => updateForm('address_line2', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="City" value={form.city} onChange={(event) => updateForm('city', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="County" value={form.county} onChange={(event) => updateForm('county', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="Postal Code" value={form.postal_code} onChange={(event) => updateForm('postal_code', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Input placeholder="KRA PIN / Tax Number" value={form.tax_number || ''} onChange={(event) => updateForm('tax_number', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900" />
              <Textarea placeholder="Notes (Optional)" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} className="bg-gray-100 border-gray-200 text-gray-900 md:col-span-2" />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Saving...' : 'Add Customer'}</Button>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <p className="text-gray-500 text-sm">Total Customers</p>
            <p className="text-2xl font-semibold text-gray-900">{displayCustomers.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <p className="text-gray-500 text-sm">VIP Customers</p>
            <p className="text-2xl font-semibold text-gray-900">{displayCustomers.filter(c => c.pricing_tier === 'vip').length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <p className="text-gray-500 text-sm">Average Spent</p>
            <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalSpent / Math.max(displayCustomers.length, 1))}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <p className="text-gray-500 text-sm">Total Loyalty Points</p>
            <p className="text-2xl font-semibold text-gray-900">{totalLoyaltyPoints.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-gray-200 mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
            <Input
              placeholder="Search by name, email, phone, or account reference..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10 bg-gray-100 border-gray-200 text-gray-900"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200">
                <TableHead className="text-gray-600">Reference</TableHead>
                <TableHead className="text-gray-600">Name</TableHead>
                <TableHead className="text-gray-600">Contact</TableHead>
                <TableHead className="text-gray-600">Address</TableHead>
                <TableHead className="text-gray-600">Tax Number</TableHead>
                <TableHead className="text-gray-600">Loyalty</TableHead>
                <TableHead className="text-gray-600">Total Spent</TableHead>
                <TableHead className="text-gray-600">Tier</TableHead>
                <TableHead className="text-gray-600">Status</TableHead>
                <TableHead className="text-gray-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map(customer => (
                <TableRow key={customer.id} className="border-gray-200">
                  <TableCell className="text-gray-600">{customer.account_reference}</TableCell>
                  <TableCell className="text-gray-900 font-medium">{customer.name}</TableCell>
                  <TableCell>
                    <div className="text-gray-600 text-sm">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {customer.email}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{customer.full_address || customer.city || 'Not captured'}</TableCell>
                  <TableCell className="text-gray-600">{customer.tax_number || 'None'}</TableCell>
                  <TableCell className="text-yellow-700">{customer.loyalty_points}</TableCell>
                  <TableCell className="text-green-700">{formatCurrency(numberValue(customer.total_spent))}</TableCell>
                  <TableCell>{getPricingTier(customer.pricing_tier)}</TableCell>
                  <TableCell>
                    <Badge className={customer.is_blacklisted ? 'bg-red-500/20 text-red-700' : customer.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'}>
                      {customer.is_blacklisted ? 'Blacklisted' : customer.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-300" onClick={() => setSelectedCustomer(customer)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-300">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedCustomer && (
        <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
          <DialogContent className="bg-white border-gray-200 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Customer Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-gray-900 font-semibold">{selectedCustomer.name}</h3>
                  <p className="text-sm text-gray-500">{selectedCustomer.account_reference}</p>
                </div>
                {getPricingTier(selectedCustomer.pricing_tier)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4" />{selectedCustomer.email}</div>
                <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4" />{selectedCustomer.phone}</div>
                <div className="flex items-center gap-2 text-gray-600 md:col-span-2"><MapPin className="w-4 h-4" />{selectedCustomer.full_address || 'No address captured'}</div>
                <div><p className="text-gray-500">City</p><p className="text-gray-900 font-semibold">{selectedCustomer.city || 'Not captured'}</p></div>
                <div><p className="text-gray-500">County</p><p className="text-gray-900 font-semibold">{selectedCustomer.county || 'Not captured'}</p></div>
                <div><p className="text-gray-500">Postal Code</p><p className="text-gray-900 font-semibold">{selectedCustomer.postal_code || 'Not captured'}</p></div>
                <div><p className="text-gray-500">Tax Number</p><p className="text-gray-900 font-semibold">{selectedCustomer.tax_number || 'None'}</p></div>
                <div><p className="text-gray-500">Loyalty Points</p><p className="text-yellow-700 font-semibold">{selectedCustomer.loyalty_points}</p></div>
                <div><p className="text-gray-500">Total Spent</p><p className="text-green-700 font-semibold">{formatCurrency(numberValue(selectedCustomer.total_spent))}</p></div>
                <div><p className="text-gray-500">Discount</p><p className="text-gray-900 font-semibold">{selectedCustomer.discount_percentage ?? 0}%</p></div>
                <div><p className="text-gray-500">Last Purchase</p><p className="text-gray-900 font-semibold">{formatDate(selectedCustomer.last_purchase_date)}</p></div>
                <div className="md:col-span-2"><p className="text-gray-500">Notes</p><p className="text-gray-900">{selectedCustomer.notes || 'No notes captured'}</p></div>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">Transaction History</h4>
                  <Badge className="bg-blue-500/20 text-blue-700">
                    {getCustomerSales(selectedCustomer).length} transaction{getCustomerSales(selectedCustomer).length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {getCustomerSales(selectedCustomer).length === 0 ? (
                  <p className="text-sm text-gray-500">No transactions recorded for this customer yet.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {getCustomerSales(selectedCustomer).map(sale => (
                      <div key={sale.id} className="rounded-md border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-blue-600">{sale.id}</p>
                            <p className="text-xs text-gray-500">{sale.timestamp.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-700">{formatCurrency(sale.amount)}</p>
                            <p className="text-xs text-gray-500">{sale.items.length} item{sale.items.length === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                          {sale.items.slice(0, 3).map(item => item.name).join(', ')}
                          {sale.items.length > 3 ? ` +${sale.items.length - 3} more` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={() => setSelectedCustomer(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
