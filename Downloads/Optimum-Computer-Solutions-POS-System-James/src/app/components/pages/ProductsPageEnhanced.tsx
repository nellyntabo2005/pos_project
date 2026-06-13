import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Search, Edit, Trash2, TrendingUp, BarChart3 } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import type { POSProduct } from './POSPageEnhanced';
import { toast } from 'sonner';

export type UnitOfMeasurement = 'pcs' | 'kg' | 'liter' | 'meter' | 'dozen' | 'box' | 'pack' | 'carton';
export type PricingTier = 'retail' | 'wholesale' | 'corporate' | 'loyal';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand?: string;
  parentProduct?: string;
  variation?: string;
  packSize?: string;
  modelNumber?: string;
  buyingPrice: number;
  prices: {
    retail: number;
    wholesale: number;
    corporate: number;
    loyal: number;
  };
  profitMargin: number;
  uom: string;
  stock: number;
  reorderLevel: number;
  maximumStock?: number;
  supplierId?: number;
  supplierName?: string;
  supplierSku?: string;
  image: string;
  tax: number;
}

const uomOptions: UnitOfMeasurement[] = ['pcs', 'kg', 'liter', 'meter', 'dozen', 'box', 'pack', 'carton'];

interface ProductsPageEnhancedProps {
  products?: POSProduct[];
  openAddProductSignal?: number;
  onProductCreated?: (product: Product) => Promise<void> | void;
  readOnly?: boolean;
}

const mapLiveProduct = (product: POSProduct): Product => {
  const retail = product.prices.retail || 0;
  const buyingPrice = Math.max(retail * 0.65, 0);

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    brand: product.brand,
    parentProduct: product.parentProduct,
    variation: product.variation,
    packSize: product.packSize,
    modelNumber: product.modelNumber,
    buyingPrice,
    prices: product.prices,
    profitMargin: buyingPrice > 0 ? ((retail - buyingPrice) / buyingPrice) * 100 : 0,
    uom: product.uom,
    stock: product.stock,
    reorderLevel: 5,
    supplierId: product.supplierId,
    supplierName: product.supplierName,
    image: product.image,
    tax: product.tax
  };
};

const readImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const buildSpecificProductName = (product: Partial<Product>) => [
  product.brand,
  product.parentProduct || product.name,
  product.variation,
  product.packSize,
  product.modelNumber
].map(part => String(part || '').trim()).filter(Boolean).join(' ');

export function ProductsPageEnhanced({
  products: liveProducts,
  openAddProductSignal = 0,
  onProductCreated,
  readOnly = false
}: ProductsPageEnhancedProps) {
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const products = liveProducts ? liveProducts.map(mapLiveProduct) : localProducts;

  useEffect(() => {
    if (!readOnly && openAddProductSignal > 0) {
      resetForm();
      setIsAddDialogOpen(true);
    }
  }, [openAddProductSignal, readOnly]);

  const categories = ['All', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(product => {
    const searchableText = [
      product.name,
      product.sku,
      product.brand,
      product.parentProduct,
      product.variation,
      product.packSize,
      product.modelNumber
    ].join(' ').toLowerCase();
    const matchesSearch = searchableText.includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const resetForm = () => {
    setFormData({});
    setEditingProduct(null);
    setImageError('');
    setFormError('');
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData(product);
    } else {
      resetForm();
    }
    setIsAddDialogOpen(true);
  };

  const calculateProfitMargin = (buyingPrice: number, sellingPrice: number) => {
    return ((sellingPrice - buyingPrice) / buyingPrice * 100);
  };

  const handleImageSelected = async (file?: File) => {
    setImageError('');

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('Choose a valid image file.');
      return;
    }

    if (file.size > 1_500_000) {
      setImageError('Choose an image under 1.5 MB.');
      return;
    }

    try {
      const imageData = await readImageAsDataUrl(file);
      setFormData(previousFormData => ({ ...previousFormData, image: imageData }));
    } catch {
      setImageError('Image could not be loaded. Try another file.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    const requiredFields = ['parentProduct', 'brand', 'sku', 'category', 'buyingPrice', 'uom'];
    if (!requiredFields.every(field => formData[field as keyof Product])) {
      setFormError('Please fill brand, generic product, SKU/barcode, category, buying price, and unit.');
      return;
    }

    const specificName = (formData.name || '').trim() || buildSpecificProductName(formData);

    setIsSubmitting(true);

    if (editingProduct) {
      setLocalProducts(localProducts.map(p => p.id === editingProduct.id ? { ...p, ...formData } as Product : p));
    } else {
      const newProduct: Product = {
        id: Date.now().toString(),
        name: specificName,
        sku: formData.sku || '',
        category: formData.category || '',
        brand: formData.brand || '',
        parentProduct: formData.parentProduct || '',
        variation: formData.variation || '',
        packSize: formData.packSize || '',
        modelNumber: formData.modelNumber || '',
        buyingPrice: formData.buyingPrice || 0,
        prices: formData.prices || { retail: 0, wholesale: 0, corporate: 0, loyal: 0 },
        profitMargin: formData.profitMargin || 0,
        uom: formData.uom || 'pcs',
        stock: formData.stock || 0,
        reorderLevel: formData.reorderLevel || 0,
        image: formData.image || '',
        tax: formData.tax || 10
      };

      try {
        await onProductCreated?.(newProduct);

        if (!liveProducts) {
          setLocalProducts([...localProducts, newProduct]);
        }
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Product could not be saved.');
        setIsSubmitting(false);
        return;
      }
    }
    resetForm();
    setIsAddDialogOpen(false);
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;

    if (liveProducts) {
      try {
        // call backend to deactivate product
        await fetch(`${(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')}/products/delete/${id}/`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });

        // optimistically remove from UI
        setLocalProducts(previous => previous.filter(p => p.id !== id));
      } catch (error) {
        console.error('Could not delete product', error);
        toast.error('Product could not be deleted.');
      }
    } else {
      setLocalProducts(localProducts.filter(p => p.id !== id));
    }
  };

  const getTotalValue = (product: Product) => product.buyingPrice * product.stock;
  const totalInventoryValue = products.reduce((sum, p) => sum + getTotalValue(p), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600 mb-2">Total Products</p>
            <p className="text-3xl font-bold text-gray-900">{products.length}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600 mb-2">Total Stock Value</p>
            <p className="text-3xl font-bold text-gray-900">KSh {totalInventoryValue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600 mb-2">Low Stock Items</p>
            <p className="text-3xl font-bold text-orange-600">{products.filter(p => p.stock < p.reorderLevel).length}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600 mb-2">Avg Profit Margin</p>
            <p className="text-3xl font-bold text-green-600">
              {(products.reduce((sum, p) => sum + p.profitMargin, 0) / products.length).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by name, SKU, brand, category, variant..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white border-gray-300"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Button
                  key={cat}
                  type="button"
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  className={selectedCategory === cat ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {!readOnly && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleOpenDialog()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
            <DialogContent className="bg-white border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Specific Product Name</label>
                    <Input
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder={buildSpecificProductName(formData) || 'Auto-built from brand, product, size'}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">SKU / Barcode *</label>
                    <Input
                      value={formData.sku || ''}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="Scan or enter barcode"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Category *</label>
                    <Input
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="Type category name"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Unit of Measurement *</label>
                    <Select value={formData.uom || 'pcs'} onValueChange={(val) => setFormData({ ...formData, uom: val as UnitOfMeasurement })}>
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {uomOptions.map(uom => (
                          <SelectItem key={uom} value={uom}>{uom.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Brand *</label>
                    <Input
                      value={formData.brand || ''}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="e.g., Brookside, Samsung, Ajab"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Generic Product *</label>
                    <Input
                      value={formData.parentProduct || ''}
                      onChange={(e) => setFormData({ ...formData, parentProduct: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="e.g., Milk, Sugar, Laptop"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Variant</label>
                    <Input
                      value={formData.variation || ''}
                      onChange={(e) => setFormData({ ...formData, variation: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="e.g., Whole milk, Brown, Core i5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Pack / Size</label>
                    <Input
                      value={formData.packSize || ''}
                      onChange={(e) => setFormData({ ...formData, packSize: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="e.g., 500ml, 2kg, 14 inch"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Model / Code</label>
                    <Input
                      value={formData.modelNumber || ''}
                      onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                      className="bg-white border-gray-300"
                      placeholder="e.g., A15, SM-A155"
                    />
                  </div>
                </div>

                {/* Pricing */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-medium text-gray-900 mb-3">Pricing & Cost</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Buying Price *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
                        <Input
                          type="number"
                          value={formData.buyingPrice || ''}
                          onChange={(e) => setFormData({ ...formData, buyingPrice: parseFloat(e.target.value) })}
                          className="pl-7 bg-white border-gray-300"
                          step="0.01"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Tax %</label>
                      <Input
                        type="number"
                        value={formData.tax || 10}
                        onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) })}
                        className="bg-white border-gray-300"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Tiered Pricing */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-medium text-gray-900 mb-3">Tiered Pricing</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Retail Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
                        <Input
                          type="number"
                          value={formData.prices?.retail || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            prices: { ...formData.prices, retail: parseFloat(e.target.value) }
                          })}
                          className="pl-7 bg-white border-gray-300"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Wholesale Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
                        <Input
                          type="number"
                          value={formData.prices?.wholesale || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            prices: { ...formData.prices, wholesale: parseFloat(e.target.value) }
                          })}
                          className="pl-7 bg-white border-gray-300"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Corporate Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
                        <Input
                          type="number"
                          value={formData.prices?.corporate || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            prices: { ...formData.prices, corporate: parseFloat(e.target.value) }
                          })}
                          className="pl-7 bg-white border-gray-300"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Loyal Customer Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">KSh </span>
                        <Input
                          type="number"
                          value={formData.prices?.loyal || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            prices: { ...formData.prices, loyal: parseFloat(e.target.value) }
                          })}
                          className="pl-7 bg-white border-gray-300"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-medium text-gray-900 mb-3">Stock Management</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Current Stock</label>
                      <Input
                        type="number"
                        value={formData.stock || 0}
                        onChange={(e) => setFormData({ ...formData, stock: parseFloat(e.target.value) })}
                        className="bg-white border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Reorder Level</label>
                      <Input
                        type="number"
                        value={formData.reorderLevel || 0}
                        onChange={(e) => setFormData({ ...formData, reorderLevel: parseFloat(e.target.value) })}
                        className="bg-white border-gray-300"
                      />
                    </div>
                  </div>
                </div>

                {/* Product Image */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-medium text-gray-900 mb-3">Product Image</p>
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4 items-start">
                    <div className="h-28 w-28 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                      {formData.image ? (
                        <ImageWithFallback
                          src={formData.image}
                          alt={formData.name ? `${formData.name} preview` : 'Product preview'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-gray-500 text-center px-2">No image selected</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="bg-white border-gray-300"
                        onChange={(e) => handleImageSelected(e.target.files?.[0])}
                      />
                      {formData.image && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFormData({ ...formData, image: '' })}
                        >
                          Remove Image
                        </Button>
                      )}
                      {imageError && <p className="text-sm text-red-600">{imageError}</p>}
                    </div>
                  </div>
                </div>

                {/* Profit Margin Display */}
                {formData.buyingPrice && formData.prices?.retail && (
                  <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">Profit Margin (Retail)</p>
                    <p className="text-2xl font-bold text-green-600">
                      {calculateProfitMargin(formData.buyingPrice, formData.prices.retail).toFixed(1)}%
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setIsAddDialogOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                    {isSubmitting ? 'Saving Product...' : editingProduct ? 'Update Product' : 'Add Product'}
                  </Button>
                </div>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
              </form>
            </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Variation</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Buy Price</TableHead>
                  <TableHead>Retail Price</TableHead>
                  <TableHead>Margin %</TableHead>
                  <TableHead>Stock</TableHead>
                  {!readOnly && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <ImageWithFallback
                        src={product.image}
                        alt={product.name}
                        className="h-12 w-12 rounded-md object-cover border border-gray-200 bg-gray-50"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{product.sku}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-gray-900">{product.name}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.brand || '-'}</TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-900">{product.variation || '-'}</div>
                      {product.parentProduct && <div className="text-xs text-gray-500">Generic: {product.parentProduct}</div>}
                      {product.packSize && <div className="text-xs text-gray-500">Pack: {product.packSize}</div>}
                      {product.modelNumber && <div className="text-xs text-gray-500">Model: {product.modelNumber}</div>}
                    </TableCell>
                    <TableCell className="text-center">{product.uom.toUpperCase()}</TableCell>
                    <TableCell>KSh {product.buyingPrice.toFixed(2)}</TableCell>
                    <TableCell>KSh {product.prices.retail.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={`${
                        product.profitMargin > 50 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {product.profitMargin.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.stock < product.reorderLevel ? 'destructive' : 'secondary'}>
                        {product.stock}
                      </Badge>
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDialog(product)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(product.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

