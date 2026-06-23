import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from 'recharts';
import {
  AlertTriangle,
  Bell,
  Boxes,
  CheckCircle2,
  DollarSign,
  FileText,
  Download,
  Edit,
  Eye,
  History,
  ImagePlus,
  Info,
  Layers3,
  Package,
  PackageCheck,
  PackageMinus,
  Plus,
  Grid3X3,
  List,
  Loader2,
  MoreVertical,
  Minus,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Upload,
  Users,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { formatCurrency } from '../utils/helpers';
import type { StockMovement, SupplierOrderInvoice } from '../../types/supplierOrder';
import type { POSProduct } from './POSPageEnhanced';
import type { Product } from './ProductsPageEnhanced';
import type { BackendSupplier, ProductExcelImportResult } from '../../services/api';

interface InventoryPageProps {
  products: POSProduct[];
  suppliers: BackendSupplier[];
  supplierInvoices: SupplierOrderInvoice[];
  stockMovements: StockMovement[];
  openAddItemSignal?: number;
  onStockAdjustment: (productId: string, type: 'in' | 'out', quantity: number, reason: string) => void;
  onAddItem: (product: Product) => Promise<void> | void;
  onBulkImportItems: (file: File) => Promise<ProductExcelImportResult>;
  onDownloadImportTemplate: () => Promise<void>;
  onDownloadAvailableItems: () => Promise<void>;
  onReorderOutOfStock: (productIds: string[]) => void;
  onCreateReorderPurchaseOrders: (items: Array<{ productId: string; quantity: number }>) => void;
  pendingGrnRequest?: SupplierOrderInvoice | Omit<SupplierOrderInvoice, 'id'> | null;
  onCloseGrn: () => void;
  onReceivedAndVerified: (invoice: SupplierOrderInvoice | Omit<SupplierOrderInvoice, 'id'>) => Promise<void> | void;
}

type MovementKind = 'Stock In' | 'Stock Out' | 'Sale' | 'Return' | 'Transfer' | 'Adjustment' | 'Damaged Goods';

type InventoryStatus = 'In Stock' | 'Low Stock' | 'Out Of Stock' | 'Overstocked';

type InventoryRow = {
  id: string;
  image: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  supplierId?: number;
  supplierName: string;
  current: number;
  reserved: number;
  available: number;
  buyingPrice: number;
  selling: number;
  profitMargin: number;
  inventoryValue: number;
  reorderLevel: number;
  status: InventoryStatus;
  lastUpdated: string;
  brand: string;
  parentProduct: string;
  variation: string;
  packSize: string;
  uom: string;
};

type InventoryNotification = {
  id: string;
  title: string;
  message: string;
  tone: 'green' | 'yellow' | 'red' | 'blue';
  time: string;
};

type AddItemFieldErrors = Partial<Record<'sku' | 'barcode' | 'name' | 'category' | 'brand' | 'expiryDate' | 'json', string>>;

type InventoryVariantSeed = {
  family: string;
  brand: string;
  category: string;
  itemType: string;
  size: string;
  color?: string;
  packSize?: string;
  variation?: string;
  uom: string;
  reorderLevel: number;
};

type DrawerVariantStockMap = Record<string, string>;
type DrawerVariantValueMap = Record<string, string>;

const unitOptions = ['pcs', 'kg', 'g', 'liter', 'ml', 'meter', 'dozen', 'box', 'pack', 'carton', 'tin', 'bag', 'pair'];
const quantifiableUnitLabels: Record<string, { singular: string; plural: string }> = {
  kg: { singular: 'kg', plural: 'kg' },
  g: { singular: 'g', plural: 'g' },
  l: { singular: 'liter', plural: 'liters' },
  liter: { singular: 'liter', plural: 'liters' },
  litre: { singular: 'litre', plural: 'litres' },
  ml: { singular: 'ml', plural: 'ml' },
  meter: { singular: 'meter', plural: 'meters' },
  metre: { singular: 'metre', plural: 'metres' }
};
const movementTypes: MovementKind[] = ['Stock In', 'Stock Out', 'Sale', 'Return', 'Transfer', 'Adjustment', 'Damaged Goods'];
const chartColors = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#475569'];
const chartAxisColor = '#64748B';
const chartGridColor = '#E2E8F0';
const chartTooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  boxShadow: '0 18px 45px -24px rgb(15 23 42 / 0.45)',
  color: '#0F172A'
};
const inventoryDraftKey = 'pos-inventory-item-draft-v3';
const inventoryLayoutKey = 'pos-inventory-layout-v1';

const seededInventoryCatalog: Array<{ family: string; aliases: string[]; variants: InventoryVariantSeed[] }> = [
  {
    family: 'Milk',
    aliases: ['maziwa', 'dairy milk'],
    variants: [
      { family: 'Milk', brand: 'Brookside', category: 'Dairy', itemType: 'Fresh whole milk', size: '500ml', uom: 'pcs', reorderLevel: 24 },
      { family: 'Milk', brand: 'Brookside', category: 'Dairy', itemType: 'Fresh whole milk', size: '1L', uom: 'pcs', reorderLevel: 18 },
      { family: 'Milk', brand: 'Brookside', category: 'Dairy', itemType: 'Low fat milk', size: '500ml', uom: 'pcs', reorderLevel: 18 },
      { family: 'Milk', brand: 'Brookside', category: 'Dairy', itemType: 'Long life UHT milk', size: '500ml', uom: 'pcs', reorderLevel: 24 },
      { family: 'Milk', brand: 'Brookside', category: 'Dairy', itemType: 'Long life UHT milk', size: '1L', uom: 'pcs', reorderLevel: 18 },
      { family: 'Milk', brand: 'Tuzo', category: 'Dairy', itemType: 'Fresh whole milk', size: '500ml', uom: 'pcs', reorderLevel: 24 },
      { family: 'Milk', brand: 'Tuzo', category: 'Dairy', itemType: 'Mala fermented milk', size: '500ml', uom: 'pcs', reorderLevel: 16 },
      { family: 'Milk', brand: 'Ilara', category: 'Dairy', itemType: 'Yoghurt vanilla', size: '250ml', uom: 'pcs', reorderLevel: 20 },
      { family: 'Milk', brand: 'Ilara', category: 'Dairy', itemType: 'Yoghurt strawberry', size: '250ml', uom: 'pcs', reorderLevel: 20 },
      { family: 'Milk', brand: 'Daima', category: 'Dairy', itemType: 'Fresh whole milk', size: '500ml', packSize: '12 pcs crate', uom: 'pcs', reorderLevel: 24 }
    ]
  },
  {
    family: 'Bread',
    aliases: ['loaf'],
    variants: [
      { family: 'Bread', brand: 'Broadways', category: 'Bakery', itemType: 'White bread', size: '400g', uom: 'pcs', reorderLevel: 15 },
      { family: 'Bread', brand: 'Broadways', category: 'Bakery', itemType: 'Brown bread', size: '400g', uom: 'pcs', reorderLevel: 15 },
      { family: 'Bread', brand: 'Festive', category: 'Bakery', itemType: 'White bread', size: '600g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Bread', brand: 'Supaloaf', category: 'Bakery', itemType: 'Brown bread', size: '600g', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Cakes',
    aliases: ['cake', 'birthday cake'],
    variants: [
      { family: 'Cakes', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Vanilla sponge cake', size: '500g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Cakes', brand: 'Cake City', category: 'Bakery', itemType: 'Chocolate cake', size: '1kg', uom: 'pcs', reorderLevel: 4 },
      { family: 'Cakes', brand: 'Artcaffe', category: 'Bakery', itemType: 'Black forest cake slice', size: 'slice', uom: 'pcs', reorderLevel: 10 },
      { family: 'Cakes', brand: 'Java House', category: 'Bakery', itemType: 'Carrot cake slice', size: 'slice', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Pastries',
    aliases: ['pastry', 'croissant', 'danish'],
    variants: [
      { family: 'Pastries', brand: 'Artcaffe', category: 'Bakery', itemType: 'Butter croissant', size: 'piece', uom: 'pcs', reorderLevel: 12 },
      { family: 'Pastries', brand: 'Java House', category: 'Bakery', itemType: 'Chocolate croissant', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Pastries', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Apple danish', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Pastries', brand: 'Broadways', category: 'Bakery', itemType: 'Sausage roll', size: 'piece', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Buns & Rolls',
    aliases: ['buns', 'rolls', 'burger buns'],
    variants: [
      { family: 'Buns & Rolls', brand: 'Broadways', category: 'Bakery', itemType: 'Burger buns', size: '6 pack', uom: 'pack', reorderLevel: 10 },
      { family: 'Buns & Rolls', brand: 'Festive', category: 'Bakery', itemType: 'Hot dog rolls', size: '6 pack', uom: 'pack', reorderLevel: 10 },
      { family: 'Buns & Rolls', brand: 'Supaloaf', category: 'Bakery', itemType: 'Sweet buns', size: '4 pack', uom: 'pack', reorderLevel: 12 },
      { family: 'Buns & Rolls', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Dinner rolls', size: '8 pack', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Muffins',
    aliases: ['muffin', 'cupcake'],
    variants: [
      { family: 'Muffins', brand: 'Java House', category: 'Bakery', itemType: 'Blueberry muffin', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Muffins', brand: 'Artcaffe', category: 'Bakery', itemType: 'Chocolate chip muffin', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Muffins', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Vanilla cupcake', size: 'piece', uom: 'pcs', reorderLevel: 12 },
      { family: 'Muffins', brand: 'Cake City', category: 'Bakery', itemType: 'Red velvet cupcake', size: 'piece', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Donuts',
    aliases: ['doughnut', 'mandazi'],
    variants: [
      { family: 'Donuts', brand: 'Krispy Kreme', category: 'Bakery', itemType: 'Glazed donut', size: 'piece', uom: 'pcs', reorderLevel: 12 },
      { family: 'Donuts', brand: 'Java House', category: 'Bakery', itemType: 'Chocolate donut', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Donuts', brand: 'Local Bakery', category: 'Bakery', itemType: 'Mandazi', size: 'piece', uom: 'pcs', reorderLevel: 20 },
      { family: 'Donuts', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Sugar donut', size: 'piece', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Flatbreads',
    aliases: ['chapati', 'naan', 'wraps'],
    variants: [
      { family: 'Flatbreads', brand: 'Local Bakery', category: 'Bakery', itemType: 'Chapati', size: '10 pack', uom: 'pack', reorderLevel: 10 },
      { family: 'Flatbreads', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Tortilla wraps', size: '8 pack', uom: 'pack', reorderLevel: 8 },
      { family: 'Flatbreads', brand: 'Zesta', category: 'Bakery', itemType: 'Naan bread', size: '4 pack', uom: 'pack', reorderLevel: 6 },
      { family: 'Flatbreads', brand: 'Local Bakery', category: 'Bakery', itemType: 'Pita bread', size: '6 pack', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Cookies',
    aliases: ['bakery cookies', 'fresh cookies'],
    variants: [
      { family: 'Cookies', brand: 'Artcaffe', category: 'Bakery', itemType: 'Chocolate chip cookies', size: '6 pack', uom: 'pack', reorderLevel: 8 },
      { family: 'Cookies', brand: 'Java House', category: 'Bakery', itemType: 'Oatmeal cookies', size: '6 pack', uom: 'pack', reorderLevel: 8 },
      { family: 'Cookies', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Butter cookies', size: '250g', uom: 'pack', reorderLevel: 8 },
      { family: 'Cookies', brand: 'Cake City', category: 'Bakery', itemType: 'Shortbread cookies', size: '250g', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Pies & Tarts',
    aliases: ['pies', 'tarts', 'quiche'],
    variants: [
      { family: 'Pies & Tarts', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Apple pie', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Pies & Tarts', brand: 'Cake City', category: 'Bakery', itemType: 'Lemon tart', size: 'piece', uom: 'pcs', reorderLevel: 6 },
      { family: 'Pies & Tarts', brand: 'Artcaffe', category: 'Bakery', itemType: 'Chicken pie', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Pies & Tarts', brand: 'Java House', category: 'Bakery', itemType: 'Vegetable quiche', size: 'piece', uom: 'pcs', reorderLevel: 6 }
    ]
  },
  {
    family: 'Scones',
    aliases: ['scone', 'tea scones'],
    variants: [
      { family: 'Scones', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Plain scone', size: 'piece', uom: 'pcs', reorderLevel: 12 },
      { family: 'Scones', brand: 'Artcaffe', category: 'Bakery', itemType: 'Raisin scone', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Scones', brand: 'Java House', category: 'Bakery', itemType: 'Cheese scone', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Scones', brand: 'Local Bakery', category: 'Bakery', itemType: 'Wholemeal scone', size: 'piece', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Bagels',
    aliases: ['bagel'],
    variants: [
      { family: 'Bagels', brand: 'Artcaffe', category: 'Bakery', itemType: 'Plain bagel', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Bagels', brand: 'Java House', category: 'Bakery', itemType: 'Sesame bagel', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Bagels', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Cinnamon raisin bagel', size: 'piece', uom: 'pcs', reorderLevel: 6 },
      { family: 'Bagels', brand: 'Local Bakery', category: 'Bakery', itemType: 'Whole wheat bagel', size: 'piece', uom: 'pcs', reorderLevel: 6 }
    ]
  },
  {
    family: 'Sweet Breads',
    aliases: ['banana bread', 'fruit loaf'],
    variants: [
      { family: 'Sweet Breads', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Banana bread', size: '500g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Sweet Breads', brand: 'Cake City', category: 'Bakery', itemType: 'Fruit loaf', size: '500g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Sweet Breads', brand: 'Java House', category: 'Bakery', itemType: 'Cinnamon loaf', size: '500g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Sweet Breads', brand: 'Artcaffe', category: 'Bakery', itemType: 'Brioche loaf', size: '500g', uom: 'pcs', reorderLevel: 6 }
    ]
  },
  {
    family: 'Rusks & Toasts',
    aliases: ['rusk', 'toast', 'melba toast'],
    variants: [
      { family: 'Rusks & Toasts', brand: 'Broadways', category: 'Bakery', itemType: 'Milk rusks', size: '250g', uom: 'pack', reorderLevel: 8 },
      { family: 'Rusks & Toasts', brand: 'Festive', category: 'Bakery', itemType: 'Tea rusks', size: '250g', uom: 'pack', reorderLevel: 8 },
      { family: 'Rusks & Toasts', brand: 'Supaloaf', category: 'Bakery', itemType: 'Garlic toast', size: '200g', uom: 'pack', reorderLevel: 6 },
      { family: 'Rusks & Toasts', brand: 'Local Bakery', category: 'Bakery', itemType: 'Melba toast', size: '200g', uom: 'pack', reorderLevel: 6 }
    ]
  },
  {
    family: 'Specialty Breads',
    aliases: ['sourdough', 'ciabatta', 'baguette'],
    variants: [
      { family: 'Specialty Breads', brand: 'Artcaffe', category: 'Bakery', itemType: 'Sourdough loaf', size: '700g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Specialty Breads', brand: 'Java House', category: 'Bakery', itemType: 'Baguette', size: 'piece', uom: 'pcs', reorderLevel: 8 },
      { family: 'Specialty Breads', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Ciabatta loaf', size: '500g', uom: 'pcs', reorderLevel: 6 },
      { family: 'Specialty Breads', brand: 'Local Bakery', category: 'Bakery', itemType: 'Multigrain loaf', size: '600g', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Savory Bakes',
    aliases: ['samosa', 'meat pie', 'savory pastry'],
    variants: [
      { family: 'Savory Bakes', brand: 'Local Bakery', category: 'Bakery', itemType: 'Beef samosa', size: 'piece', uom: 'pcs', reorderLevel: 20 },
      { family: 'Savory Bakes', brand: 'Blueberry Bakery', category: 'Bakery', itemType: 'Chicken samosa', size: 'piece', uom: 'pcs', reorderLevel: 16 },
      { family: 'Savory Bakes', brand: 'Artcaffe', category: 'Bakery', itemType: 'Spinach feta pastry', size: 'piece', uom: 'pcs', reorderLevel: 10 },
      { family: 'Savory Bakes', brand: 'Java House', category: 'Bakery', itemType: 'Mini meat pie', size: 'piece', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Sugar',
    aliases: ['sukari'],
    variants: [
      { family: 'Sugar', brand: 'Mumias', category: 'Food', itemType: 'White sugar', size: '1kg', uom: 'pcs', reorderLevel: 20 },
      { family: 'Sugar', brand: 'Mumias', category: 'Food', itemType: 'White sugar', size: '2kg', uom: 'pcs', reorderLevel: 12 },
      { family: 'Sugar', brand: 'Kabras', category: 'Food', itemType: 'White sugar', size: '1kg', uom: 'pcs', reorderLevel: 20 },
      { family: 'Sugar', brand: 'Kabras', category: 'Food', itemType: 'Brown sugar', size: '1kg', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Cooking Oil',
    aliases: ['oil', 'vegetable oil', 'cooking olil', 'elianto', 'elinto'],
    variants: [
      { family: 'Cooking Oil', brand: 'Elianto', category: 'Food', itemType: 'Sunflower oil', size: '500ml', uom: 'pcs', reorderLevel: 16 },
      { family: 'Cooking Oil', brand: 'Elianto', category: 'Food', itemType: 'Sunflower oil', size: '1L', uom: 'pcs', reorderLevel: 12 },
      { family: 'Cooking Oil', brand: 'Golden Fry', category: 'Food', itemType: 'Vegetable oil', size: '1L', uom: 'pcs', reorderLevel: 12 },
      { family: 'Cooking Oil', brand: 'Fresh Fri', category: 'Food', itemType: 'Vegetable oil', size: '2L', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Rice',
    aliases: ['mchele'],
    variants: [
      { family: 'Rice', brand: 'Pishori', category: 'Food', itemType: 'Aromatic rice', size: '1kg', uom: 'pcs', reorderLevel: 18 },
      { family: 'Rice', brand: 'Pishori', category: 'Food', itemType: 'Aromatic rice', size: '2kg', uom: 'pcs', reorderLevel: 12 },
      { family: 'Rice', brand: 'Daawat', category: 'Food', itemType: 'Basmati rice', size: '1kg', uom: 'pcs', reorderLevel: 10 },
      { family: 'Rice', brand: 'Cil', category: 'Food', itemType: 'Long grain rice', size: '5kg', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Flour',
    aliases: ['unga', 'wheat flour', 'maize flour'],
    variants: [
      { family: 'Flour', brand: 'Jogoo', category: 'Food', itemType: 'Maize flour', size: '2kg', uom: 'pcs', reorderLevel: 20 },
      { family: 'Flour', brand: 'Soko', category: 'Food', itemType: 'Maize flour', size: '2kg', uom: 'pcs', reorderLevel: 20 },
      { family: 'Flour', brand: 'EXE', category: 'Food', itemType: 'Wheat flour', size: '2kg', uom: 'pcs', reorderLevel: 16 },
      { family: 'Flour', brand: 'Pembe', category: 'Food', itemType: 'Atta flour', size: '2kg', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Water',
    aliases: ['bottled water'],
    variants: [
      { family: 'Water', brand: 'Dasani', category: 'Beverages', itemType: 'Still water', size: '500ml', packSize: '24 pcs carton', uom: 'pcs', reorderLevel: 30 },
      { family: 'Water', brand: 'Dasani', category: 'Beverages', itemType: 'Still water', size: '1L', packSize: '12 pcs carton', uom: 'pcs', reorderLevel: 24 },
      { family: 'Water', brand: 'Keringet', category: 'Beverages', itemType: 'Still water', size: '500ml', packSize: '24 pcs carton', uom: 'pcs', reorderLevel: 24 },
      { family: 'Water', brand: 'Aquamist', category: 'Beverages', itemType: 'Still water', size: '1.5L', packSize: '12 pcs carton', uom: 'pcs', reorderLevel: 18 }
    ]
  },
  {
    family: 'Soda',
    aliases: ['soft drink', 'carbonated drink'],
    variants: [
      { family: 'Soda', brand: 'Coca-Cola', category: 'Beverages', itemType: 'Cola', size: '500ml', packSize: '12 pcs crate', uom: 'pcs', reorderLevel: 24 },
      { family: 'Soda', brand: 'Fanta', category: 'Beverages', itemType: 'Orange soda', size: '500ml', packSize: '12 pcs crate', uom: 'pcs', reorderLevel: 18 },
      { family: 'Soda', brand: 'Sprite', category: 'Beverages', itemType: 'Lemon-lime soda', size: '500ml', packSize: '12 pcs crate', uom: 'pcs', reorderLevel: 18 },
      { family: 'Soda', brand: 'Pepsi', category: 'Beverages', itemType: 'Cola', size: '500ml', packSize: '12 pcs crate', uom: 'pcs', reorderLevel: 18 }
    ]
  },
  {
    family: 'Tea',
    aliases: ['majani', 'tea leaves'],
    variants: [
      { family: 'Tea', brand: 'Ketepa', category: 'Beverages', itemType: 'Tea leaves', size: '250g', uom: 'pcs', reorderLevel: 14 },
      { family: 'Tea', brand: 'Ketepa', category: 'Beverages', itemType: 'Tea bags', size: '100 bags', uom: 'box', reorderLevel: 10 },
      { family: 'Tea', brand: 'Kericho Gold', category: 'Beverages', itemType: 'Tea leaves', size: '250g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Tea', brand: 'Fahari Ya Kenya', category: 'Beverages', itemType: 'Tea leaves', size: '500g', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Soap',
    aliases: ['bar soap', 'bathing soap'],
    variants: [
      { family: 'Soap', brand: 'Menengai', category: 'Household', itemType: 'Laundry bar soap', size: '800g', uom: 'pcs', reorderLevel: 18 },
      { family: 'Soap', brand: 'Sunlight', category: 'Household', itemType: 'Laundry bar soap', size: '700g', uom: 'pcs', reorderLevel: 16 },
      { family: 'Soap', brand: 'Geisha', category: 'Personal Care', itemType: 'Bathing soap', size: '125g', uom: 'pcs', reorderLevel: 20 },
      { family: 'Soap', brand: 'Dettol', category: 'Personal Care', itemType: 'Antibacterial soap', size: '125g', uom: 'pcs', reorderLevel: 14 }
    ]
  },
  {
    family: 'Detergent',
    aliases: ['washing powder'],
    variants: [
      { family: 'Detergent', brand: 'Omo', category: 'Household', itemType: 'Washing powder', size: '500g', uom: 'pcs', reorderLevel: 18 },
      { family: 'Detergent', brand: 'Omo', category: 'Household', itemType: 'Washing powder', size: '1kg', uom: 'pcs', reorderLevel: 12 },
      { family: 'Detergent', brand: 'Ariel', category: 'Household', itemType: 'Washing powder', size: '500g', uom: 'pcs', reorderLevel: 14 },
      { family: 'Detergent', brand: 'Sunlight', category: 'Household', itemType: 'Dishwashing liquid', size: '750ml', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Toothpaste',
    aliases: ['dental care'],
    variants: [
      { family: 'Toothpaste', brand: 'Colgate', category: 'Personal Care', itemType: 'Regular toothpaste', size: '100ml', uom: 'pcs', reorderLevel: 20 },
      { family: 'Toothpaste', brand: 'Colgate', category: 'Personal Care', itemType: 'Herbal toothpaste', size: '100ml', uom: 'pcs', reorderLevel: 12 },
      { family: 'Toothpaste', brand: 'Closeup', category: 'Personal Care', itemType: 'Red hot gel', size: '125ml', uom: 'pcs', reorderLevel: 12 },
      { family: 'Toothpaste', brand: 'Aquafresh', category: 'Personal Care', itemType: 'Triple protection', size: '100ml', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Coffee',
    aliases: ['kahawa', 'instant coffee'],
    variants: [
      { family: 'Coffee', brand: 'Nescafe', category: 'Beverages', itemType: 'Instant coffee', size: '50g', uom: 'pcs', reorderLevel: 10 },
      { family: 'Coffee', brand: 'Dormans', category: 'Beverages', itemType: 'Ground coffee', size: '250g', uom: 'pcs', reorderLevel: 8 },
      { family: 'Coffee', brand: 'Java House', category: 'Beverages', itemType: 'House blend coffee', size: '250g', uom: 'pcs', reorderLevel: 8 },
      { family: 'Coffee', brand: 'Kericho Gold', category: 'Beverages', itemType: 'Kenyan coffee', size: '250g', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Juice',
    aliases: ['fruit juice', 'squash'],
    variants: [
      { family: 'Juice', brand: 'Del Monte', category: 'Beverages', itemType: 'Pineapple juice', size: '1L', uom: 'pcs', reorderLevel: 12 },
      { family: 'Juice', brand: 'Minute Maid', category: 'Beverages', itemType: 'Mango juice', size: '400ml', uom: 'pcs', reorderLevel: 18 },
      { family: 'Juice', brand: 'Afia', category: 'Beverages', itemType: 'Mixed fruit juice', size: '1L', uom: 'pcs', reorderLevel: 12 },
      { family: 'Juice', brand: 'Quencher', category: 'Beverages', itemType: 'Apple juice', size: '1L', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Biscuits',
    aliases: ['cookies', 'crackers'],
    variants: [
      { family: 'Biscuits', brand: 'Britania', category: 'Snacks', itemType: 'Digestive biscuits', size: '250g', uom: 'pcs', reorderLevel: 18 },
      { family: 'Biscuits', brand: 'Manji', category: 'Snacks', itemType: 'Shortcake biscuits', size: '200g', uom: 'pcs', reorderLevel: 16 },
      { family: 'Biscuits', brand: 'Oreo', category: 'Snacks', itemType: 'Chocolate sandwich cookies', size: '154g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Biscuits', brand: 'Tiffany', category: 'Snacks', itemType: 'Cream biscuits', size: '100g', uom: 'pcs', reorderLevel: 18 }
    ]
  },
  {
    family: 'Chips',
    aliases: ['crisps', 'potato chips'],
    variants: [
      { family: 'Chips', brand: 'Krackles', category: 'Snacks', itemType: 'Potato crisps salted', size: '40g', uom: 'pcs', reorderLevel: 24 },
      { family: 'Chips', brand: 'Tropical Heat', category: 'Snacks', itemType: 'Potato crisps chilli lemon', size: '40g', uom: 'pcs', reorderLevel: 24 },
      { family: 'Chips', brand: 'Pringles', category: 'Snacks', itemType: 'Original crisps', size: '165g', uom: 'pcs', reorderLevel: 8 },
      { family: 'Chips', brand: 'Blue Band', category: 'Snacks', itemType: 'Corn snacks', size: '50g', uom: 'pcs', reorderLevel: 18 }
    ]
  },
  {
    family: 'Chocolate',
    aliases: ['candy', 'sweets'],
    variants: [
      { family: 'Chocolate', brand: 'Cadbury', category: 'Confectionery', itemType: 'Dairy milk chocolate', size: '80g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Chocolate', brand: 'Mars', category: 'Confectionery', itemType: 'Chocolate bar', size: '51g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Chocolate', brand: 'Snickers', category: 'Confectionery', itemType: 'Peanut chocolate bar', size: '50g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Chocolate', brand: 'Kinder Joy', category: 'Confectionery', itemType: 'Chocolate egg', size: '20g', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Fresh Vegetables',
    aliases: ['mboga', 'vegetables'],
    variants: [
      { family: 'Fresh Vegetables', brand: 'Local Farm', category: 'Produce', itemType: 'Tomatoes', size: '1kg', uom: 'kg', reorderLevel: 15 },
      { family: 'Fresh Vegetables', brand: 'Local Farm', category: 'Produce', itemType: 'Onions', size: '1kg', uom: 'kg', reorderLevel: 15 },
      { family: 'Fresh Vegetables', brand: 'Local Farm', category: 'Produce', itemType: 'Sukuma wiki', size: 'bundle', uom: 'pcs', reorderLevel: 20 },
      { family: 'Fresh Vegetables', brand: 'Local Farm', category: 'Produce', itemType: 'Cabbage', size: 'head', uom: 'pcs', reorderLevel: 12 }
    ]
  },
  {
    family: 'Fresh Fruits',
    aliases: ['matunda', 'fruit'],
    variants: [
      { family: 'Fresh Fruits', brand: 'Local Farm', category: 'Produce', itemType: 'Bananas', size: '1kg', uom: 'kg', reorderLevel: 20 },
      { family: 'Fresh Fruits', brand: 'Local Farm', category: 'Produce', itemType: 'Oranges', size: '1kg', uom: 'kg', reorderLevel: 15 },
      { family: 'Fresh Fruits', brand: 'Local Farm', category: 'Produce', itemType: 'Apples', size: '1kg', uom: 'kg', reorderLevel: 12 },
      { family: 'Fresh Fruits', brand: 'Local Farm', category: 'Produce', itemType: 'Avocado', size: 'piece', uom: 'pcs', reorderLevel: 20 }
    ]
  },
  {
    family: 'Meat',
    aliases: ['nyama', 'butchery'],
    variants: [
      { family: 'Meat', brand: 'Farm Fresh', category: 'Butchery', itemType: 'Beef steak', size: '1kg', uom: 'kg', reorderLevel: 8 },
      { family: 'Meat', brand: 'Farm Fresh', category: 'Butchery', itemType: 'Goat meat', size: '1kg', uom: 'kg', reorderLevel: 6 },
      { family: 'Meat', brand: 'Blue Nile', category: 'Butchery', itemType: 'Chicken broiler', size: '1kg', uom: 'kg', reorderLevel: 8 },
      { family: 'Meat', brand: 'Farmer Choice', category: 'Butchery', itemType: 'Sausages', size: '500g', uom: 'pack', reorderLevel: 10 }
    ]
  },
  {
    family: 'Frozen Foods',
    aliases: ['frozen', 'freezer'],
    variants: [
      { family: 'Frozen Foods', brand: 'Blue Band', category: 'Frozen Foods', itemType: 'Frozen chips', size: '1kg', uom: 'pack', reorderLevel: 10 },
      { family: 'Frozen Foods', brand: 'Kenchic', category: 'Frozen Foods', itemType: 'Chicken nuggets', size: '500g', uom: 'pack', reorderLevel: 8 },
      { family: 'Frozen Foods', brand: 'Farmer Choice', category: 'Frozen Foods', itemType: 'Burger patties', size: '500g', uom: 'pack', reorderLevel: 8 },
      { family: 'Frozen Foods', brand: 'Ocean Catch', category: 'Frozen Foods', itemType: 'Fish fillets', size: '1kg', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Cereals',
    aliases: ['grains', 'breakfast cereal'],
    variants: [
      { family: 'Cereals', brand: 'Weetabix', category: 'Breakfast', itemType: 'Wheat cereal', size: '450g', uom: 'box', reorderLevel: 8 },
      { family: 'Cereals', brand: 'Kelloggs', category: 'Breakfast', itemType: 'Corn flakes', size: '500g', uom: 'box', reorderLevel: 8 },
      { family: 'Cereals', brand: 'Nestle', category: 'Breakfast', itemType: 'Milo cereal', size: '330g', uom: 'box', reorderLevel: 8 },
      { family: 'Cereals', brand: 'Proctor & Allan', category: 'Breakfast', itemType: 'Porridge oats', size: '500g', uom: 'pcs', reorderLevel: 10 }
    ]
  },
  {
    family: 'Spices',
    aliases: ['seasoning', 'masala'],
    variants: [
      { family: 'Spices', brand: 'Tropical Heat', category: 'Food', itemType: 'Pilau masala', size: '100g', uom: 'pcs', reorderLevel: 12 },
      { family: 'Spices', brand: 'Royco', category: 'Food', itemType: 'Mchuzi mix', size: '200g', uom: 'pcs', reorderLevel: 20 },
      { family: 'Spices', brand: "Nature's Own", category: 'Food', itemType: 'Black pepper', size: '50g', uom: 'pcs', reorderLevel: 10 },
      { family: 'Spices', brand: 'Blue Band', category: 'Food', itemType: 'Table salt', size: '1kg', uom: 'pcs', reorderLevel: 16 }
    ]
  },
  {
    family: 'Baby Diapers',
    aliases: ['diapers', 'nappies'],
    variants: [
      { family: 'Baby Diapers', brand: 'Pampers', category: 'Baby Care', itemType: 'Baby dry diapers', size: 'Size 3', uom: 'pack', reorderLevel: 8 },
      { family: 'Baby Diapers', brand: 'Huggies', category: 'Baby Care', itemType: 'Dry comfort diapers', size: 'Size 4', uom: 'pack', reorderLevel: 8 },
      { family: 'Baby Diapers', brand: 'Molfix', category: 'Baby Care', itemType: 'Baby diapers', size: 'Size 5', uom: 'pack', reorderLevel: 8 },
      { family: 'Baby Diapers', brand: 'Softcare', category: 'Baby Care', itemType: 'Baby diapers', size: 'Size 2', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Baby Food',
    aliases: ['infant food', 'formula'],
    variants: [
      { family: 'Baby Food', brand: 'Nestle Cerelac', category: 'Baby Care', itemType: 'Wheat baby cereal', size: '400g', uom: 'pcs', reorderLevel: 8 },
      { family: 'Baby Food', brand: 'Nan', category: 'Baby Care', itemType: 'Infant formula', size: '400g', uom: 'tin', reorderLevel: 8 },
      { family: 'Baby Food', brand: 'SMA', category: 'Baby Care', itemType: 'Infant milk', size: '400g', uom: 'tin', reorderLevel: 6 },
      { family: 'Baby Food', brand: 'Cow & Gate', category: 'Baby Care', itemType: 'Follow-on milk', size: '400g', uom: 'tin', reorderLevel: 6 }
    ]
  },
  {
    family: 'Hair Care',
    aliases: ['shampoo', 'conditioner'],
    variants: [
      { family: 'Hair Care', brand: 'Nice & Lovely', category: 'Beauty & Cosmetics', itemType: 'Hair shampoo', size: '250ml', uom: 'pcs', reorderLevel: 10 },
      { family: 'Hair Care', brand: 'Sofnfree', category: 'Beauty & Cosmetics', itemType: 'Hair food', size: '125g', uom: 'pcs', reorderLevel: 10 },
      { family: 'Hair Care', brand: 'Dark and Lovely', category: 'Beauty & Cosmetics', itemType: 'Relaxer kit', size: 'regular', uom: 'pcs', reorderLevel: 8 },
      { family: 'Hair Care', brand: 'Cantu', category: 'Beauty & Cosmetics', itemType: 'Leave-in conditioner', size: '340g', uom: 'pcs', reorderLevel: 6 }
    ]
  },
  {
    family: 'Skin Care',
    aliases: ['lotion', 'cream'],
    variants: [
      { family: 'Skin Care', brand: 'Nivea', category: 'Beauty & Cosmetics', itemType: 'Body lotion', size: '400ml', uom: 'pcs', reorderLevel: 10 },
      { family: 'Skin Care', brand: 'Vaseline', category: 'Beauty & Cosmetics', itemType: 'Petroleum jelly', size: '250ml', uom: 'pcs', reorderLevel: 12 },
      { family: 'Skin Care', brand: 'Garnier', category: 'Beauty & Cosmetics', itemType: 'Face wash', size: '100ml', uom: 'pcs', reorderLevel: 6 },
      { family: 'Skin Care', brand: 'Neutrogena', category: 'Beauty & Cosmetics', itemType: 'Moisturizer', size: '50ml', uom: 'pcs', reorderLevel: 6 }
    ]
  },
  {
    family: 'Stationery',
    aliases: ['school supplies', 'office supplies'],
    variants: [
      { family: 'Stationery', brand: 'Bic', category: 'Stationery', itemType: 'Ballpoint pens', size: 'box of 50', uom: 'box', reorderLevel: 5 },
      { family: 'Stationery', brand: 'Kasuku', category: 'Stationery', itemType: 'Exercise books', size: '200 pages', uom: 'pcs', reorderLevel: 30 },
      { family: 'Stationery', brand: 'Pelikan', category: 'Stationery', itemType: 'Pencils', size: 'box of 12', uom: 'box', reorderLevel: 8 },
      { family: 'Stationery', brand: 'Faber-Castell', category: 'Stationery', itemType: 'Colored pencils', size: '12 colors', uom: 'pack', reorderLevel: 8 }
    ]
  },
  {
    family: 'Paper Products',
    aliases: ['paper', 'printing paper'],
    variants: [
      { family: 'Paper Products', brand: 'Double A', category: 'Stationery', itemType: 'A4 copy paper', size: 'ream', uom: 'pack', reorderLevel: 10 },
      { family: 'Paper Products', brand: 'Mondial', category: 'Stationery', itemType: 'A4 copy paper', size: 'ream', uom: 'pack', reorderLevel: 10 },
      { family: 'Paper Products', brand: 'Velvex', category: 'Household', itemType: 'Paper towels', size: '2 rolls', uom: 'pack', reorderLevel: 12 },
      { family: 'Paper Products', brand: 'Rosy', category: 'Household', itemType: 'Toilet tissue', size: '10 rolls', uom: 'pack', reorderLevel: 16 }
    ]
  },
  {
    family: 'Mobile Phones',
    aliases: ['phones', 'smartphones'],
    variants: [
      { family: 'Mobile Phones', brand: 'Samsung', category: 'Electronics', itemType: 'Android smartphone', size: '128GB', uom: 'pcs', reorderLevel: 3 },
      { family: 'Mobile Phones', brand: 'Apple', category: 'Electronics', itemType: 'iPhone', size: '128GB', uom: 'pcs', reorderLevel: 2 },
      { family: 'Mobile Phones', brand: 'Tecno', category: 'Electronics', itemType: 'Android smartphone', size: '64GB', uom: 'pcs', reorderLevel: 5 },
      { family: 'Mobile Phones', brand: 'Infinix', category: 'Electronics', itemType: 'Android smartphone', size: '128GB', uom: 'pcs', reorderLevel: 5 }
    ]
  },
  {
    family: 'Laptops',
    aliases: ['laptop', 'laptops', 'computers', 'desktop computers', 'notebook', 'notebooks'],
    variants: [
      { family: 'Laptops', brand: 'HP', category: 'Electronics', itemType: 'Laptop computer', size: 'Core i5 8GB', uom: 'pcs', reorderLevel: 2 },
      { family: 'Laptops', brand: 'Dell', category: 'Electronics', itemType: 'Laptop computer', size: 'Core i7 16GB', uom: 'pcs', reorderLevel: 2 },
      { family: 'Laptops', brand: 'Lenovo', category: 'Electronics', itemType: 'Business laptop', size: 'Core i5 8GB', uom: 'pcs', reorderLevel: 2 },
      { family: 'Laptops', brand: 'Asus', category: 'Electronics', itemType: 'Notebook laptop', size: 'Core i3 4GB', uom: 'pcs', reorderLevel: 2 }
    ]
  },
  {
    family: 'Computer Accessories',
    aliases: ['keyboard', 'mouse', 'accessories'],
    variants: [
      { family: 'Computer Accessories', brand: 'Logitech', category: 'Electronics', itemType: 'Wireless mouse', size: 'standard', uom: 'pcs', reorderLevel: 8 },
      { family: 'Computer Accessories', brand: 'HP', category: 'Electronics', itemType: 'USB keyboard', size: 'standard', uom: 'pcs', reorderLevel: 8 },
      { family: 'Computer Accessories', brand: 'Sandisk', category: 'Electronics', itemType: 'USB flash drive', size: '64GB', uom: 'pcs', reorderLevel: 12 },
      { family: 'Computer Accessories', brand: 'Seagate', category: 'Electronics', itemType: 'External hard drive', size: '1TB', uom: 'pcs', reorderLevel: 4 }
    ]
  },
  {
    family: 'Televisions',
    aliases: ['tv', 'smart tv'],
    variants: [
      { family: 'Televisions', brand: 'Samsung', category: 'Appliances', itemType: 'Smart LED TV', size: '43 inch', uom: 'pcs', reorderLevel: 2 },
      { family: 'Televisions', brand: 'LG', category: 'Appliances', itemType: 'Smart LED TV', size: '55 inch', uom: 'pcs', reorderLevel: 2 },
      { family: 'Televisions', brand: 'Sony', category: 'Appliances', itemType: 'Android TV', size: '50 inch', uom: 'pcs', reorderLevel: 2 },
      { family: 'Televisions', brand: 'Hisense', category: 'Appliances', itemType: 'Smart TV', size: '43 inch', uom: 'pcs', reorderLevel: 2 }
    ]
  },
  {
    family: 'Kitchen Appliances',
    aliases: ['kitchen electronics', 'small appliances'],
    variants: [
      { family: 'Kitchen Appliances', brand: 'Ramtons', category: 'Appliances', itemType: 'Microwave oven', size: '20L', uom: 'pcs', reorderLevel: 3 },
      { family: 'Kitchen Appliances', brand: 'Von', category: 'Appliances', itemType: 'Blender', size: '1.5L', uom: 'pcs', reorderLevel: 4 },
      { family: 'Kitchen Appliances', brand: 'Bruhm', category: 'Appliances', itemType: 'Electric kettle', size: '1.7L', uom: 'pcs', reorderLevel: 5 },
      { family: 'Kitchen Appliances', brand: 'Philips', category: 'Appliances', itemType: 'Air fryer', size: '4L', uom: 'pcs', reorderLevel: 3 }
    ]
  },
  {
    family: 'Cleaning Liquids',
    aliases: ['cleaners', 'disinfectant'],
    variants: [
      { family: 'Cleaning Liquids', brand: 'Jik', category: 'Household', itemType: 'Bleach', size: '750ml', uom: 'pcs', reorderLevel: 12 },
      { family: 'Cleaning Liquids', brand: 'Harpic', category: 'Household', itemType: 'Toilet cleaner', size: '500ml', uom: 'pcs', reorderLevel: 12 },
      { family: 'Cleaning Liquids', brand: 'Dettol', category: 'Household', itemType: 'Disinfectant', size: '500ml', uom: 'pcs', reorderLevel: 10 },
      { family: 'Cleaning Liquids', brand: 'Mr Muscle', category: 'Household', itemType: 'Surface cleaner', size: '500ml', uom: 'pcs', reorderLevel: 8 }
    ]
  },
  {
    family: 'Paint',
    aliases: ['wall paint', 'decor paint'],
    variants: [
      { family: 'Paint', brand: 'Crown', category: 'Hardware', itemType: 'Emulsion paint', size: '4L', uom: 'pcs', reorderLevel: 4 },
      { family: 'Paint', brand: 'Basco', category: 'Hardware', itemType: 'Gloss paint', size: '1L', uom: 'pcs', reorderLevel: 6 },
      { family: 'Paint', brand: 'Sadolin', category: 'Hardware', itemType: 'Weather guard paint', size: '4L', uom: 'pcs', reorderLevel: 4 },
      { family: 'Paint', brand: 'Duracoat', category: 'Hardware', itemType: 'Silk vinyl paint', size: '4L', uom: 'pcs', reorderLevel: 4 }
    ]
  },
  {
    family: 'Tools',
    aliases: ['hand tools', 'hardware tools'],
    variants: [
      { family: 'Tools', brand: 'Stanley', category: 'Hardware', itemType: 'Hammer', size: '16oz', uom: 'pcs', reorderLevel: 5 },
      { family: 'Tools', brand: 'Bosch', category: 'Hardware', itemType: 'Drill machine', size: '650W', uom: 'pcs', reorderLevel: 2 },
      { family: 'Tools', brand: 'Total', category: 'Hardware', itemType: 'Screwdriver set', size: '6 pcs', uom: 'pack', reorderLevel: 4 },
      { family: 'Tools', brand: 'Ingco', category: 'Hardware', itemType: 'Spanner set', size: '12 pcs', uom: 'pack', reorderLevel: 4 }
    ]
  },
  {
    family: 'Car Care',
    aliases: ['automotive', 'vehicle care'],
    variants: [
      { family: 'Car Care', brand: 'Shell', category: 'Automotive', itemType: 'Engine oil', size: '4L', uom: 'pcs', reorderLevel: 6 },
      { family: 'Car Care', brand: 'TotalEnergies', category: 'Automotive', itemType: 'Engine oil', size: '4L', uom: 'pcs', reorderLevel: 6 },
      { family: 'Car Care', brand: 'Castrol', category: 'Automotive', itemType: 'Brake fluid', size: '500ml', uom: 'pcs', reorderLevel: 6 },
      { family: 'Car Care', brand: 'Turtle Wax', category: 'Automotive', itemType: 'Car polish', size: '500ml', uom: 'pcs', reorderLevel: 4 }
    ]
  },
  {
    family: 'Pet Food',
    aliases: ['dog food', 'cat food'],
    variants: [
      { family: 'Pet Food', brand: 'Pedigree', category: 'Pet Supplies', itemType: 'Dog food', size: '1kg', uom: 'pack', reorderLevel: 6 },
      { family: 'Pet Food', brand: 'Whiskas', category: 'Pet Supplies', itemType: 'Cat food', size: '1kg', uom: 'pack', reorderLevel: 6 },
      { family: 'Pet Food', brand: 'Drools', category: 'Pet Supplies', itemType: 'Puppy food', size: '3kg', uom: 'pack', reorderLevel: 4 },
      { family: 'Pet Food', brand: 'Reflex', category: 'Pet Supplies', itemType: 'Kitten food', size: '1.5kg', uom: 'pack', reorderLevel: 4 }
    ]
  },
  {
    family: 'Fertilizer',
    aliases: ['farm inputs', 'plant food'],
    variants: [
      { family: 'Fertilizer', brand: 'MEA', category: 'Agriculture', itemType: 'DAP fertilizer', size: '50kg', uom: 'bag', reorderLevel: 4 },
      { family: 'Fertilizer', brand: 'Yara', category: 'Agriculture', itemType: 'NPK fertilizer', size: '50kg', uom: 'bag', reorderLevel: 4 },
      { family: 'Fertilizer', brand: 'Osho', category: 'Agriculture', itemType: 'Foliar feed', size: '1L', uom: 'pcs', reorderLevel: 6 },
      { family: 'Fertilizer', brand: 'Elgon Kenya', category: 'Agriculture', itemType: 'CAN fertilizer', size: '50kg', uom: 'bag', reorderLevel: 4 }
    ]
  },
  {
    family: 'Clothing',
    aliases: ['apparel', 'wear'],
    variants: [
      { family: 'Clothing', brand: 'LC Waikiki', category: 'Apparel', itemType: 'T-shirt', size: 'Medium', uom: 'pcs', reorderLevel: 8 },
      { family: 'Clothing', brand: 'Mr Price', category: 'Apparel', itemType: 'Jeans', size: '32', uom: 'pcs', reorderLevel: 6 },
      { family: 'Clothing', brand: 'Nike', category: 'Apparel', itemType: 'Sports jersey', size: 'Large', uom: 'pcs', reorderLevel: 4 },
      { family: 'Clothing', brand: 'Adidas', category: 'Apparel', itemType: 'Track pants', size: 'Large', uom: 'pcs', reorderLevel: 4 }
    ]
  },
  {
    family: 'Footwear',
    aliases: ['shoes', 'sandals'],
    variants: [
      { family: 'Footwear', brand: 'Bata', category: 'Footwear', itemType: 'School shoes', size: 'Size 6', uom: 'pair', reorderLevel: 6 },
      { family: 'Footwear', brand: 'Nike', category: 'Footwear', itemType: 'Running shoes', size: 'Size 8', uom: 'pair', reorderLevel: 4 },
      { family: 'Footwear', brand: 'Adidas', category: 'Footwear', itemType: 'Sneakers', size: 'Size 9', uom: 'pair', reorderLevel: 4 },
      { family: 'Footwear', brand: 'Safari Boots', category: 'Footwear', itemType: 'Leather boots', size: 'Size 7', uom: 'pair', reorderLevel: 4 }
    ]
  },
  {
    family: 'Furniture',
    aliases: ['chairs', 'tables'],
    variants: [
      { family: 'Furniture', brand: 'Victoria Courts', category: 'Furniture', itemType: 'Office chair', size: 'standard', uom: 'pcs', reorderLevel: 2 },
      { family: 'Furniture', brand: 'Odds & Ends', category: 'Furniture', itemType: 'Coffee table', size: 'medium', uom: 'pcs', reorderLevel: 2 },
      { family: 'Furniture', brand: 'Furniture Palace', category: 'Furniture', itemType: 'Sofa set', size: '5 seater', uom: 'pcs', reorderLevel: 1 },
      { family: 'Furniture', brand: 'Dignity Furniture', category: 'Furniture', itemType: 'Wardrobe', size: '3 door', uom: 'pcs', reorderLevel: 1 }
    ]
  }
];

const blankAddItemForm = {
  name: '',
  sku: '',
  barcode: '',
  category: '',
  brand: '',
  parentProduct: '',
  itemType: '',
  size: '',
  weight: '',
  color: '',
  packSize: '',
  notes: '',
  description: '',
  tags: '',
  supplierId: '',
  supplierSku: '',
  leadTime: '',
  warehouse: '',
  uom: '',
  buyingPrice: '',
  retailPrice: '',
  wholesalePrice: '',
  corporatePrice: '',
  loyalPrice: '',
  stock: '',
  drawerVariantStocks: {} as DrawerVariantStockMap,
  drawerVariantRetailPrices: {} as DrawerVariantValueMap,
  drawerVariantCostPrices: {} as DrawerVariantValueMap,
  drawerVariantWholesalePrices: {} as DrawerVariantValueMap,
  reorderLevel: '',
  maximumStock: '',
  tax: '',
  productStatus: 'active',
  publishToPos: true,
  trackExpiry: false,
  expiryDate: '',
  quantityLevels: [] as Array<{
    quantity: string;
    label: string;
    retailPrice: string;
    wholesalePrice: string;
    corporatePrice: string;
    loyalPrice: string;
  }>,
  warrantyPeriod: '',
  productType: '',
  imageUrl: '',
  images: [] as string[]
};

const getReorderLevel = (product: POSProduct) => {
  if (product.category === 'Beverages') return 20;
  if (product.category === 'Bakery' || product.category === 'Food') return 12;
  return 10;
};

const normalizeSeedSearch = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeUnit = (unit: string) => unit.trim().toLowerCase();

const isQuantifiableUnit = (unit: string) => Boolean(quantifiableUnitLabels[normalizeUnit(unit)]);

const formatQuantityLevel = (quantity: number, unit: string) => {
  const unitLabel = quantifiableUnitLabels[normalizeUnit(unit)];
  if (!unitLabel) return `${quantity} ${unit}`;
  return `${quantity} ${quantity === 1 ? unitLabel.singular : unitLabel.plural}`;
};

const calculateTaxInclusivePrice = (price: string, previousTax: string, nextTax: string) => {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return price;

  const previousMultiplier = 1 + ((Number(previousTax) || 0) / 100);
  const nextMultiplier = 1 + ((Number(nextTax) || 0) / 100);
  return ((amount / previousMultiplier) * nextMultiplier).toFixed(2);
};

const applyTaxToPriceFields = <T extends {
  retailPrice: string;
  wholesalePrice: string;
  corporatePrice: string;
  loyalPrice: string;
}>(priceFields: T, previousTax: string, nextTax: string): T => ({
  ...priceFields,
  retailPrice: calculateTaxInclusivePrice(priceFields.retailPrice, previousTax, nextTax),
  wholesalePrice: calculateTaxInclusivePrice(priceFields.wholesalePrice, previousTax, nextTax),
  corporatePrice: calculateTaxInclusivePrice(priceFields.corporatePrice, previousTax, nextTax),
  loyalPrice: calculateTaxInclusivePrice(priceFields.loyalPrice, previousTax, nextTax)
});

const createQuantityLevel = (quantity: number, unit: string, prices: {
  retailPrice: string;
  wholesalePrice: string;
  corporatePrice: string;
  loyalPrice: string;
}) => {
  const label = formatQuantityLevel(quantity, unit);
  const priceFor = (value: string) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? (amount * quantity).toFixed(2) : '';
  };

  return {
    quantity: String(quantity),
    label,
    retailPrice: priceFor(prices.retailPrice),
    wholesalePrice: priceFor(prices.wholesalePrice || prices.retailPrice),
    corporatePrice: priceFor(prices.corporatePrice || prices.wholesalePrice || prices.retailPrice),
    loyalPrice: priceFor(prices.loyalPrice || prices.retailPrice)
  };
};

const createSeedSku = (seed: InventoryVariantSeed) => (
  [seed.family, seed.brand, seed.itemType, seed.size, seed.packSize]
    .filter(Boolean)
    .join('-')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
);

const getSeedVariantKey = (seed: InventoryVariantSeed) => (
  [seed.family, seed.brand, seed.itemType, seed.size, seed.color || '', seed.packSize || '', seed.variation || '']
    .join('|')
);

const getSeededVariants = (category?: string, family?: string) => seededInventoryCatalog
  .flatMap(catalog => catalog.variants)
  .filter(seed => (!category || seed.category === category) && (!family || seed.family === family));

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
const uniqueInOrder = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const buildSeedCategoryMap = () => seededInventoryCatalog.reduce((categoryMap, catalog) => {
  catalog.variants.forEach(seed => {
    const subcategories = categoryMap.get(seed.category) || new Set<string>();
    subcategories.add(catalog.family);
    categoryMap.set(seed.category, subcategories);
  });
  return categoryMap;
}, new Map<string, Set<string>>());

const scoreCatalogForText = (catalog: typeof seededInventoryCatalog[number], text: string) => {
  const normalizedText = normalizeSeedSearch(text);
  if (normalizedText.length < 2) return 0;

  const searchableValues = [
    catalog.family,
    ...catalog.aliases,
    ...catalog.variants.flatMap(seed => [
      seed.category,
      seed.brand,
      seed.itemType,
      seed.size,
      seed.color || '',
      seed.packSize || '',
      seed.variation || ''
    ])
  ];

  return searchableValues.reduce((score, value) => {
    const normalizedValue = normalizeSeedSearch(value);
    if (!normalizedValue) return score;
    if (normalizedText === normalizedValue) return Math.max(score, 120);
    if (normalizedText.includes(normalizedValue)) return Math.max(score, normalizedValue === normalizeSeedSearch(catalog.family) ? 100 : 70);
    if (normalizedValue.includes(normalizedText)) return Math.max(score, normalizedValue === normalizeSeedSearch(catalog.family) ? 95 : 60);

    const textTokens = normalizedText.split(' ').filter(token => token.length > 2);
    const valueTokens = normalizedValue.split(' ').filter(token => token.length > 2);
    const overlap = textTokens.filter(token => valueTokens.some(valueToken => valueToken === token || valueToken.includes(token) || token.includes(valueToken))).length;
    return overlap > 0 ? Math.max(score, 25 + overlap * 10) : score;
  }, 0);
};

const getMatchingSeedCatalogs = (text: string, limit = 14) => seededInventoryCatalog
  .map(catalog => ({ catalog, score: scoreCatalogForText(catalog, text) }))
  .filter(match => match.score > 0)
  .sort((left, right) => right.score - left.score || left.catalog.family.localeCompare(right.catalog.family))
  .slice(0, limit)
  .map(match => match.catalog);

function SearchableSeedSelect({
  value,
  options,
  placeholder,
  onChange
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchValue.trim().toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-gray-200 bg-gray-100 px-3 text-left text-sm text-gray-900"
        onClick={() => setIsOpen(previous => !previous)}
      >
        <span className={value ? 'truncate' : 'truncate text-gray-500'}>{value || placeholder}</span>
        <Search className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-gray-200 bg-white p-2 shadow-xl">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search..."
              className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-2 text-sm text-gray-500">No matches found</p>
            ) : filteredOptions.map(option => (
              <button
                key={option}
                type="button"
                className={`w-full rounded px-2 py-2 text-left text-sm hover:bg-blue-50 ${option === value ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-gray-700'}`}
                onClick={() => {
                  onChange(option);
                  setSearchValue('');
                  setIsOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const buildInventoryItemName = (item: typeof blankAddItemForm) => {
  if (item.name.trim()) return item.name.trim();
  return [item.brand, item.parentProduct, item.itemType, item.size, item.color, item.packSize]
    .map(value => value.trim())
    .filter(Boolean)
    .join(' ');
};

const removeBrandFromText = (text: string, brand?: string) => {
  if (!brand) return text.trim();
  return text
    .replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '')
    .replace(/\s+/g, ' ')
    .trim();
};

const catalogMatchesText = (catalog: typeof seededInventoryCatalog[number], text: string) => {
  const normalizedText = normalizeSeedSearch(text);
  if (!normalizedText) return false;
  const family = normalizeSeedSearch(catalog.family);
  return normalizedText === family
    || normalizedText.includes(family)
    || catalog.aliases.some(alias => {
      const normalizedAlias = normalizeSeedSearch(alias);
      return normalizedText === normalizedAlias || normalizedText.includes(normalizedAlias);
    });
};

const resolvePosFamilyFromForm = (item: typeof blankAddItemForm, itemName: string) => {
  const searchable = [
    item.parentProduct,
    removeBrandFromText(itemName, item.brand),
    item.itemType,
    item.category
  ].join(' ');
  const matchingCatalog = seededInventoryCatalog.find(catalog => catalogMatchesText(catalog, searchable));

  if (matchingCatalog) return matchingCatalog.family;
  if (item.parentProduct.trim()) return removeBrandFromText(item.parentProduct, item.brand) || item.parentProduct.trim();
  return removeBrandFromText(itemName, item.brand) || itemName;
};

const buildPosVariationLabel = (item: typeof blankAddItemForm) => (
  [item.itemType, item.color, item.notes]
    .map(value => value.trim())
    .filter(Boolean)
    .join(' / ') || 'Standard'
);

const buildPosPackSizeLabel = (item: typeof blankAddItemForm) => (
  [item.size, item.weight, item.packSize]
    .map(value => value.trim())
    .filter(Boolean)
    .join(' / ') || item.uom || 'Each'
);

const createGeneratedCode = (parts: string[]) => {
  const prefix = parts.join('-').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'ITEM';
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
};

const getAddItemFieldErrors = (message: string): AddItemFieldErrors => {
  const normalized = message.toLowerCase();
  const errors: AddItemFieldErrors = {};

  if (normalized.includes('barcode')) {
    errors.barcode = message;
  }
  if (normalized.includes('sku')) {
    errors.sku = message;
  }
  if (normalized.includes('name')) {
    errors.name = message;
  }
  if (normalized.includes('category')) {
    errors.category = message;
  }
  if (normalized.includes('brand')) {
    errors.brand = message;
  }
  if (normalized.includes('expiry')) {
    errors.expiryDate = message;
  }
  if (normalized.includes('json') || normalized.includes('parse') || normalized.includes('syntax') || normalized.includes('unexpected token')) {
    errors.json = message;
  }

  if ((normalized.includes('already exists') || normalized.includes('unique')) && !errors.barcode && !errors.sku) {
    errors.barcode = message;
    errors.sku = message;
  }

  return errors;
};

const readImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const isToday = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText === new Date().toISOString().slice(0, 10);
  return date.toDateString() === new Date().toDateString();
};

const statusClassName = (status: InventoryStatus) => {
  if (status === 'In Stock') return 'bg-green-500/15 text-green-700 border-green-200';
  if (status === 'Low Stock') return 'bg-yellow-500/20 text-yellow-800 border-yellow-200';
  if (status === 'Out Of Stock') return 'bg-red-500/15 text-red-700 border-red-200';
  return 'bg-blue-500/15 text-blue-700 border-blue-200';
};

const movementLabel = (movement: StockMovement): MovementKind => {
  const reason = movement.reason.toLowerCase();
  if (reason.includes('sale')) return 'Sale';
  if (reason.includes('return')) return 'Return';
  if (reason.includes('transfer')) return 'Transfer';
  if (reason.includes('damage')) return 'Damaged Goods';
  if (reason.includes('adjust')) return 'Adjustment';
  return movement.type === 'in' ? 'Stock In' : 'Stock Out';
};

export function InventoryPage({
  products,
  suppliers,
  supplierInvoices,
  stockMovements,
  openAddItemSignal = 0,
  onStockAdjustment,
  onAddItem,
  onBulkImportItems,
  onDownloadImportTemplate,
  onDownloadAvailableItems,
  onReorderOutOfStock,
  onCreateReorderPurchaseOrders,
  pendingGrnRequest,
  onCloseGrn,
  onReceivedAndVerified
}: InventoryPageProps) {
  const [movementFilter, setMovementFilter] = useState('all');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<InventoryNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out' | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ productId: '', quantity: '1', reason: '' });
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [addItemForm, setAddItemForm] = useState<typeof blankAddItemForm>(() => {
    try {
      const draft = window.localStorage.getItem(inventoryDraftKey);
      return draft ? { ...blankAddItemForm, ...JSON.parse(draft) } : blankAddItemForm;
    } catch {
      return blankAddItemForm;
    }
  });
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [addItemFieldErrors, setAddItemFieldErrors] = useState<AddItemFieldErrors>({});
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImportMessage, setBulkImportMessage] = useState('');
  const [bulkImportErrors, setBulkImportErrors] = useState<ProductExcelImportResult['errors']>([]);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);
  const [isExportDownloading, setIsExportDownloading] = useState(false);
  const [selectedReorderItems, setSelectedReorderItems] = useState<string[]>([]);
  const [reorderQuantities, setReorderQuantities] = useState<Record<string, string>>({});
  const [grnReceivedQuantities, setGrnReceivedQuantities] = useState<Record<string, string>>({});
  const [grnRejectedQuantities, setGrnRejectedQuantities] = useState<Record<string, string>>({});
  const [grnRejectionReasons, setGrnRejectionReasons] = useState<Record<string, string>>({});
  const [grnDetails, setGrnDetails] = useState({
    goodsReceivingNote: '',
    deliveryNote: '',
    receivingLocation: 'Main Store',
    receivingNotes: ''
  });
  const [isPostingGrn, setIsPostingGrn] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tableView, setTableView] = useState<'table' | 'grid'>(() => {
    try {
      const savedLayout = window.localStorage.getItem(inventoryLayoutKey);
      return savedLayout === 'grid' || savedLayout === 'table' ? savedLayout : 'table';
    } catch {
      return 'table';
    }
  });
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);

  const activeSuppliers = suppliers.filter(supplier => supplier.is_active !== false);
  const seedCategoryMap = useMemo(() => buildSeedCategoryMap(), []);
  const addItemSeedSearchText = [
    addItemForm.name,
    addItemForm.parentProduct,
    addItemForm.itemType,
    addItemForm.brand,
    addItemForm.category
  ].join(' ');
  const matchingSeedCatalogs = useMemo(
    () => getMatchingSeedCatalogs(addItemSeedSearchText),
    [addItemSeedSearchText]
  );
  const seededCategoryOptions = useMemo(
    () => uniqueInOrder([
      ...matchingSeedCatalogs.flatMap(catalog => catalog.variants.map(seed => seed.category)),
      ...uniqueSorted(Array.from(seedCategoryMap.keys()))
    ]),
    [matchingSeedCatalogs, seedCategoryMap]
  );
  const seededSubcategoryOptions = useMemo(
    () => {
      const matchingFamilies = matchingSeedCatalogs
        .filter(catalog => !addItemForm.category || catalog.variants.some(seed => seed.category === addItemForm.category))
        .map(catalog => catalog.family);
      const categoryFamilies = addItemForm.category
        ? uniqueSorted(Array.from(seedCategoryMap.get(addItemForm.category) || []))
        : uniqueSorted(seededInventoryCatalog.map(catalog => catalog.family));
      return uniqueInOrder([...matchingFamilies, ...categoryFamilies]);
    },
    [addItemForm.category, matchingSeedCatalogs, seedCategoryMap]
  );
  const seededBrandOptions = useMemo(
    () => {
      const matchingBrands = matchingSeedCatalogs
        .flatMap(catalog => catalog.variants)
        .filter(seed => (!addItemForm.category || seed.category === addItemForm.category) && (!addItemForm.parentProduct || seed.family === addItemForm.parentProduct))
        .map(seed => seed.brand);
      return uniqueInOrder([
        ...matchingBrands,
        ...uniqueSorted(getSeededVariants(addItemForm.category, addItemForm.parentProduct).map(seed => seed.brand))
      ]);
    },
    [addItemForm.category, addItemForm.parentProduct, matchingSeedCatalogs]
  );
  const hasQuantityLevels = isQuantifiableUnit(addItemForm.uom);
  const updateAddItemField = <K extends keyof typeof blankAddItemForm>(field: K, value: (typeof blankAddItemForm)[K]) => {
    setAddItemForm(previous => ({ ...previous, [field]: value }));
    if (field in addItemFieldErrors) {
      setAddItemFieldErrors(previous => {
        const next = { ...previous };
        delete next[field as keyof AddItemFieldErrors];
        return next;
      });
    }
  };

  const updateAddItemName = (name: string) => {
    const [bestCatalog] = getMatchingSeedCatalogs(name);
    const firstVariant = bestCatalog?.variants[0];
    setAddItemForm(previous => ({
      ...previous,
      name,
      category: previous.category || firstVariant?.category || '',
      parentProduct: previous.parentProduct || bestCatalog?.family || '',
      brand: previous.brand || firstVariant?.brand || '',
      itemType: previous.itemType || firstVariant?.itemType || '',
      size: previous.size || firstVariant?.size || '',
      packSize: previous.packSize || firstVariant?.packSize || '',
      uom: firstVariant && !previous.uom ? firstVariant.uom : previous.uom,
      reorderLevel: previous.reorderLevel || (firstVariant ? String(firstVariant.reorderLevel) : '')
    }));
    if (addItemFieldErrors.name) {
      setAddItemFieldErrors(previous => {
        const next = { ...previous };
        delete next.name;
        return next;
      });
    }
  };
  const addItemInputClass = (field?: keyof AddItemFieldErrors, className = '') => {
    const hasError = field ? Boolean(addItemFieldErrors[field]) : false;
    return `${className} bg-gray-100 ${hasError ? 'border-red-500 text-red-700 focus-visible:ring-red-500' : 'border-gray-200'}`.trim();
  };
  const updateAddItemUnit = (uom: string) => {
    setAddItemForm(previous => ({
      ...previous,
      uom,
      quantityLevels: isQuantifiableUnit(uom)
        ? Array.from({ length: 5 }, (_, index) => createQuantityLevel(index + 1, uom, {
            retailPrice: previous.retailPrice,
            wholesalePrice: previous.wholesalePrice,
            corporatePrice: previous.corporatePrice,
            loyalPrice: previous.loyalPrice
          }))
        : []
    }));
  };

  const updateAddItemTax = (tax: string) => {
    setAddItemForm(previous => {
      const nextPriceFields = applyTaxToPriceFields({
        retailPrice: previous.retailPrice,
        wholesalePrice: previous.wholesalePrice,
        corporatePrice: previous.corporatePrice,
        loyalPrice: previous.loyalPrice
      }, previous.tax, tax);

      return {
        ...previous,
        ...nextPriceFields,
        tax,
        quantityLevels: previous.quantityLevels.map(level =>
          applyTaxToPriceFields(level, previous.tax, tax)
        )
      };
    });
  };

  const updateQuantityLevel = (
    index: number,
    field: 'retailPrice' | 'wholesalePrice' | 'corporatePrice' | 'loyalPrice',
    value: string
  ) => {
    setAddItemForm(previous => ({
      ...previous,
      quantityLevels: previous.quantityLevels.map((level, levelIndex) =>
        levelIndex === index ? { ...level, [field]: value } : level
      )
    }));
  };

  const regenerateQuantityLevels = () => {
    setAddItemForm(previous => ({
      ...previous,
      quantityLevels: Array.from({ length: 5 }, (_, index) => createQuantityLevel(index + 1, previous.uom, {
        retailPrice: previous.retailPrice,
        wholesalePrice: previous.wholesalePrice,
        corporatePrice: previous.corporatePrice,
        loyalPrice: previous.loyalPrice
      }))
    }));
  };

  const addQuantityLevel = () => {
    setAddItemForm(previous => {
      const nextQuantity = previous.quantityLevels.reduce((maximum, level) => {
        return Math.max(maximum, Number(level.quantity) || 0);
      }, 0) + 1;

      return {
        ...previous,
        quantityLevels: [
          ...previous.quantityLevels,
          createQuantityLevel(nextQuantity, previous.uom, {
            retailPrice: previous.retailPrice,
            wholesalePrice: previous.wholesalePrice,
            corporatePrice: previous.corporatePrice,
            loyalPrice: previous.loyalPrice
          })
        ]
      };
    });
  };

  const removeQuantityLevel = (index: number) => {
    setAddItemForm(previous => ({
      ...previous,
      quantityLevels: previous.quantityLevels.filter((_, levelIndex) => levelIndex !== index)
    }));
  };

  const pushNotification = (title: string, message: string, tone: InventoryNotification['tone'] = 'blue') => {
    const notification = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      message,
      tone,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotifications(previous => [notification, ...previous].slice(0, 12));
  };

  useEffect(() => {
    if (openAddItemSignal > 0) {
      setIsAddItemOpen(true);
    }
  }, [openAddItemSignal]);

  useEffect(() => {
    const hasDraft = JSON.stringify(addItemForm) !== JSON.stringify(blankAddItemForm);
    if (hasDraft) {
      window.localStorage.setItem(inventoryDraftKey, JSON.stringify(addItemForm));
    }

    const warnUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!isAddItemOpen || !hasDraft) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnUnsavedChanges);
    return () => window.removeEventListener('beforeunload', warnUnsavedChanges);
  }, [addItemForm, isAddItemOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(inventoryLayoutKey, tableView);
    } catch {
      // Ignore local storage errors.
    }
  }, [tableView]);

  useEffect(() => {
    if (!pendingGrnRequest?.orderItems?.length) {
      setGrnReceivedQuantities({});
      setIsPostingGrn(false);
      setGrnDetails({
        goodsReceivingNote: '',
        deliveryNote: '',
        receivingLocation: 'Main Store',
        receivingNotes: ''
      });
      return;
    }

    setGrnReceivedQuantities(pendingGrnRequest.orderItems.reduce<Record<string, string>>((quantities, item) => {
      const pendingQuantity = item.pendingQuantity ?? Math.max(0, item.requestedQuantity - item.deliveredQuantity);
      quantities[item.productId] = String(pendingQuantity || 0);
      return quantities;
    }, {}));
    setGrnRejectedQuantities({});
    setGrnRejectionReasons({});
    setGrnDetails({
      goodsReceivingNote: pendingGrnRequest.goodsReceivingNote || '',
      deliveryNote: pendingGrnRequest.deliveryNote || '',
      receivingLocation: pendingGrnRequest.receivingLocation || 'Main Store',
      receivingNotes: pendingGrnRequest.receivingNotes || ''
    });
  }, [pendingGrnRequest?.date, pendingGrnRequest?.supplierId, pendingGrnRequest?.goodsReceivingNote, pendingGrnRequest?.deliveryNote, pendingGrnRequest?.orderItems?.map(item => `${item.productId}:${item.requestedQuantity}:${item.deliveredQuantity}:${item.pendingQuantity}`).join('|')]);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pos-inventory-live') : null;
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'inventory-notification') {
        pushNotification(event.data.title, event.data.message, event.data.tone);
      }
    };
    channel?.addEventListener('message', messageHandler);
    return () => {
      channel?.removeEventListener('message', messageHandler);
      channel?.close();
    };
  }, []);

  const inventory = useMemo<InventoryRow[]>(() => products.map(product => {
    const supplierFromProduct = suppliers.find(supplier => supplier.id === product.supplierId);
    const supplierFromInvoices = supplierInvoices.find(invoice => invoice.productId === product.id);
    const supplierName = product.supplierName || supplierFromProduct?.name || supplierFromInvoices?.supplierName || 'No supplier linked';
    const reorderLevel = product.reorderLevel || getReorderLevel(product);
    const reserved = supplierInvoices
      .reduce((sum, invoice) => {
        const linePending = invoice.orderItems
          ?.filter(item => item.productId === product.id)
          .reduce((itemSum, item) => itemSum + item.pendingQuantity, 0);
        if (typeof linePending === 'number' && linePending > 0) return sum + linePending;
        return invoice.productId === product.id ? sum + (invoice.quantityPending || 0) : sum;
      }, 0);
    const buyingPrice = product.costPrice || product.prices.wholesale || product.prices.retail * 0.7 || 0;
    const profitMargin = buyingPrice > 0 ? ((product.prices.retail - buyingPrice) / buyingPrice) * 100 : 0;
    const available = Math.max(product.stock - reserved, 0);
    const status: InventoryStatus = product.stock === 0
      ? 'Out Of Stock'
      : product.stock >= reorderLevel * 4
        ? 'Overstocked'
        : product.stock <= reorderLevel
          ? 'Low Stock'
          : 'In Stock';

    return {
      id: product.id,
      image: product.image,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || product.sku,
      category: product.category,
      supplierId: product.supplierId || supplierFromProduct?.id || supplierFromInvoices?.supplierId,
      supplierName,
      current: product.stock,
      reserved,
      available,
      buyingPrice,
      selling: product.prices.retail,
      profitMargin,
      inventoryValue: product.stock * buyingPrice,
      reorderLevel,
      status,
      lastUpdated: stockMovements.find(movement => movement.item === product.name)?.date || 'Today',
      brand: product.brand || '',
      parentProduct: product.parentProduct || '',
      variation: product.variation || '',
      packSize: product.packSize || '',
      uom: product.uom
    };
  }), [products, suppliers, supplierInvoices, stockMovements]);

  const needsReorder = (item: InventoryRow) => item.current <= item.reorderLevel;
  const canCreateReorder = (item: InventoryRow) => needsReorder(item) && item.reserved <= 0;
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock' && needsReorder(item));
  const outOfStockItems = inventory.filter(item => item.status === 'Out Of Stock' && needsReorder(item));
  const reorderSuggestionItems = inventory.filter(needsReorder);
  const reorderableSuggestionItems = reorderSuggestionItems.filter(canCreateReorder);
  const todayMovements = stockMovements.filter(movement => isToday(movement.date));
  const todaySalesImpact = todayMovements
    .filter(movement => movementLabel(movement) === 'Sale')
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
  const pendingReorders = supplierInvoices.filter(invoice => (invoice.quantityPending || invoice.orderItems?.some(item => item.pendingQuantity > 0))).length;
  const totalInventoryValue = inventory.reduce((sum, item) => sum + item.inventoryValue, 0);

  useEffect(() => {
    lowStockItems.slice(0, 4).forEach(item => {
      pushNotification(
        item.status === 'Out Of Stock' ? 'Out of stock warning' : 'Low stock warning',
        `${item.name} has ${item.current} ${item.uom} remaining. Reorder level is ${item.reorderLevel}.`,
        item.status === 'Out Of Stock' ? 'red' : 'yellow'
      );
    });
  }, [products.length, lowStockItems.length, outOfStockItems.length]);

  useEffect(() => {
    const suggestionIds = reorderSuggestionItems.map(item => item.id);
    const reorderableIds = reorderableSuggestionItems.map(item => item.id);
    setSelectedReorderItems(previousSelected => {
      const retained = previousSelected.filter(productId => reorderableIds.includes(productId));
      const added = reorderableIds.filter(productId => !retained.includes(productId));
      return [...retained, ...added];
    });
    setReorderQuantities(previousQuantities => {
      const nextQuantities = { ...previousQuantities };
      reorderSuggestionItems.forEach(item => {
        if (!nextQuantities[item.id]) {
          nextQuantities[item.id] = String(Math.max(1, item.reorderLevel * 2 - item.current - item.reserved));
        }
      });
      Object.keys(nextQuantities).forEach(productId => {
        if (!suggestionIds.includes(productId)) {
          delete nextQuantities[productId];
        }
      });
      return nextQuantities;
    });
  }, [reorderSuggestionItems.map(item => `${item.id}:${item.current}:${item.reorderLevel}:${item.reserved}`).join('|')]);

  const categories = ['all', ...Array.from(new Set(inventory.map(item => item.category).filter(Boolean)))];
  const supplierFilterOptions = ['all', ...Array.from(new Set(inventory.map(item => item.supplierName).filter(Boolean)))];
  const statusFilterOptions: Array<'all' | InventoryStatus> = ['all', 'In Stock', 'Low Stock', 'Out Of Stock', 'Overstocked'];
  const filteredInventory = useMemo(() => {
    const search = inventorySearch.trim().toLowerCase();
    return inventory.filter(item => {
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.sku.toLowerCase().includes(search)
        || item.barcode.toLowerCase().includes(search)
        || item.supplierName.toLowerCase().includes(search);
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesSupplier = supplierFilter === 'all' || item.supplierName === supplierFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesCategory && matchesSupplier && matchesStatus;
    });
  }, [inventory, inventorySearch, categoryFilter, supplierFilter, statusFilter]);
  const trendData = useMemo(() => {
    const baseValue = totalInventoryValue || 1;
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      day,
      value: Math.round(baseValue * (0.82 + index * 0.035)),
      stock: Math.max(0, inventory.reduce((sum, item) => sum + item.current, 0) - (6 - index) * 4)
    }));
  }, [inventory, totalInventoryValue]);

  const movementChartData = movementTypes.map(type => ({
    type,
    quantity: stockMovements
      .filter(movement => movementLabel(movement) === type)
      .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0)
  }));

  const categoryChartData = categories
    .filter(category => category !== 'all')
    .map(category => ({
      name: category,
      value: inventory.filter(item => item.category === category).length
    }));

  const categoryTables = useMemo(() => categories
    .filter(category => category !== 'all')
    .map(category => {
      const items = inventory.filter(item => item.category === category);
      const subcategories = Array.from(new Set(items.map(item => item.parentProduct || item.brand || 'Unclassified')));
      return {
        category,
        itemCount: items.length,
        stock: items.reduce((sum, item) => sum + item.current, 0),
        value: items.reduce((sum, item) => sum + item.inventoryValue, 0),
        subcategories: subcategories.map(subcategory => {
          const subcategoryItems = items.filter(item => (item.parentProduct || item.brand || 'Unclassified') === subcategory);
          return {
            name: subcategory,
            itemCount: subcategoryItems.length,
            stock: subcategoryItems.reduce((sum, item) => sum + item.current, 0),
            value: subcategoryItems.reduce((sum, item) => sum + item.inventoryValue, 0),
            lowStock: subcategoryItems.filter(item => item.status === 'Low Stock' || item.status === 'Out Of Stock').length
          };
        })
      };
    }), [categories.join('|'), inventory]);

  const recentActivity = [
    ...stockMovements.slice(0, 8).map(movement => ({
      id: movement.id,
      title: movementLabel(movement),
      message: `${movement.item}: ${movement.quantity > 0 ? '+' : ''}${movement.quantity}. ${movement.reason}`,
      time: movement.date,
      tone: movement.type === 'in' ? 'green' : 'red'
    })),
    ...supplierInvoices.slice(0, 4).map(invoice => ({
      id: invoice.id,
      title: invoice.status === 'delivered' ? 'Goods received' : 'Pending reorder',
      message: `${invoice.supplierName} - ${invoice.productName || `${invoice.items} item(s)`}`,
      time: invoice.date,
      tone: invoice.status === 'delivered' ? 'green' : 'yellow'
    }))
  ].slice(0, 10);

  const selectedProduct = selectedProductId ? inventory.find(item => item.id === selectedProductId) : null;
  const actionProduct = actionProductId ? inventory.find(item => item.id === actionProductId) : null;

  const openStockAdjustment = (productId: string, type: 'in' | 'out', reason: string) => {
    setAdjustmentType(type);
    setAdjustmentForm({ productId, quantity: '1', reason });
    setActionProductId(null);
  };

  const openProductHistory = (productId: string) => {
    setSelectedProductId(productId);
    setActionProductId(null);
  };

  const startProductReorder = (productId: string) => {
    const item = inventory.find(row => row.id === productId);
    if (item && !canCreateReorder(item)) return;
    onReorderOutOfStock([productId]);
    setActionProductId(null);
  };

  const handleBulkInventoryActions = () => {
    const reorderableSelectedIds = selectedInventoryIds.filter(productId => {
      const item = inventory.find(row => row.id === productId);
      return item ? canCreateReorder(item) : false;
    });
    if (selectedInventoryIds.length === 0) return;
    if (selectedInventoryIds.length === 1) {
      setActionProductId(selectedInventoryIds[0]);
      return;
    }
    if (reorderableSelectedIds.length === 0) {
      toast.warning('No reorderable items selected', {
        description: 'Selected low-stock items already have pending purchase orders.'
      });
      return;
    }
    onReorderOutOfStock(reorderableSelectedIds);
    toast.success('Bulk reorder started', {
      description: `${reorderableSelectedIds.length} selected item${reorderableSelectedIds.length === 1 ? '' : 's'} sent to procurement.`
    });
  };

  const handlePrintLabels = () => {
    if (selectedInventoryIds.length === 0) return;
    const selectedItems = inventory.filter(item => selectedInventoryIds.includes(item.id));
    const labelWindow = window.open('', '_blank', 'width=900,height=700');
    if (!labelWindow) {
      toast.error('Unable to open labels', { description: 'Allow pop-ups for this site and try again.' });
      return;
    }

    labelWindow.document.write(`
      <html>
        <head>
          <title>Product Labels</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            .labels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .label { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; min-height: 100px; }
            .name { font-weight: 700; margin-bottom: 8px; }
            .sku { font-family: monospace; font-size: 12px; color: #4b5563; }
            .price { margin-top: 8px; font-weight: 700; color: #047857; }
          </style>
        </head>
        <body>
          <div class="labels">
            ${selectedItems.map(item => `
              <div class="label">
                <div class="name">${item.name}</div>
                <div class="sku">${item.sku}</div>
                <div>${item.category}</div>
                <div class="price">${formatCurrency(item.selling)}</div>
              </div>
            `).join('')}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    labelWindow.document.close();
  };
  const visibleInventoryIds = filteredInventory.map(item => item.id);
  const allVisibleSelected = visibleInventoryIds.length > 0 && visibleInventoryIds.every(id => selectedInventoryIds.includes(id));
  const toggleVisibleInventorySelection = () => {
    setSelectedInventoryIds(previous => {
      if (allVisibleSelected) {
        return previous.filter(id => !visibleInventoryIds.includes(id));
      }
      return Array.from(new Set([...previous, ...visibleInventoryIds]));
    });
  };
  const toggleInventorySelection = (productId: string) => {
    setSelectedInventoryIds(previous => previous.includes(productId)
      ? previous.filter(id => id !== productId)
      : [...previous, productId]
    );
  };
  const seedSearch = normalizeSeedSearch(addItemForm.parentProduct);
  const selectedSeedCatalog = (seedSearch.length >= 2
    ? seededInventoryCatalog.find(catalog => {
        const family = normalizeSeedSearch(catalog.family);
        return family.includes(seedSearch)
          || seedSearch.includes(family)
          || catalog.aliases.some(alias => {
            const normalizedAlias = normalizeSeedSearch(alias);
            return normalizedAlias.includes(seedSearch) || seedSearch.includes(normalizedAlias);
          });
      })
    : undefined) || matchingSeedCatalogs[0];

  const handleSeedCategoryChange = (category: string) => {
    const firstSubcategory = seededSubcategoryOptions.find(family =>
      seededInventoryCatalog.find(catalog => catalog.family === family)?.variants.some(seed => seed.category === category)
    ) || uniqueSorted(Array.from(seedCategoryMap.get(category) || []))[0] || '';
    const matchingVariants = getSeededVariants(category, firstSubcategory);
    const firstVariant = matchingVariants[0];

    setAddItemForm(previous => ({
      ...previous,
      category,
      parentProduct: firstSubcategory,
      brand: firstVariant?.brand || '',
      itemType: '',
      size: '',
      packSize: '',
      uom: firstVariant?.uom || previous.uom,
      reorderLevel: previous.reorderLevel || (firstVariant ? String(firstVariant.reorderLevel) : '')
    }));
  };

  const handleSeedSubcategoryChange = (parentProduct: string) => {
    const matchingVariants = getSeededVariants(addItemForm.category, parentProduct);
    const firstVariant = matchingVariants[0];

    setAddItemForm(previous => ({
      ...previous,
      parentProduct,
      brand: firstVariant?.brand || '',
      itemType: '',
      size: '',
      packSize: '',
      uom: firstVariant?.uom || previous.uom,
      reorderLevel: previous.reorderLevel || (firstVariant ? String(firstVariant.reorderLevel) : '')
    }));
  };

  const openAdjustmentDialog = (type: 'in' | 'out', productId = products[0]?.id || '') => {
    setFormError('');
    setAdjustmentType(type);
    setAdjustmentForm({
      productId,
      quantity: '1',
      reason: type === 'in' ? 'Stock received' : 'Stock removed'
    });
  };

  const handleStockAdjustment = () => {
    setFormError('');
    const quantity = Number(adjustmentForm.quantity);
    if (!adjustmentType || !adjustmentForm.productId || quantity <= 0) {
      setFormError('Select an item and enter a quantity greater than zero.');
      return;
    }

    onStockAdjustment(adjustmentForm.productId, adjustmentType, quantity, adjustmentForm.reason || (adjustmentType === 'in' ? 'Stock in' : 'Stock out'));
    const product = inventory.find(item => item.id === adjustmentForm.productId);
    const title = adjustmentType === 'in' ? 'Stock increased' : 'Stock reduced';
    pushNotification(title, `${product?.name || 'Inventory item'} ${adjustmentType === 'in' ? 'increased' : 'reduced'} by ${quantity}.`, adjustmentType === 'in' ? 'green' : 'yellow');
    toast.success(title);
    setAdjustmentType(null);
  };

  const handleDownloadTemplate = async () => {
    setFormError('');
    setIsTemplateDownloading(true);
    try {
      await onDownloadImportTemplate();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Product template could not be downloaded.');
    } finally {
      setIsTemplateDownloading(false);
    }
  };

  const handleDownloadAvailableItems = async () => {
    setFormError('');
    setIsExportDownloading(true);
    try {
      await onDownloadAvailableItems();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Available items could not be downloaded.');
    } finally {
      setIsExportDownloading(false);
    }
  };

  const handleBulkImport = async () => {
    setBulkImportMessage('');
    setBulkImportErrors([]);

    if (!bulkImportFile) {
      setFormError('Choose an Excel file to import.');
      return;
    }

    setFormError('');
    setIsBulkImporting(true);
    try {
      const result = await onBulkImportItems(bulkImportFile);
      setBulkImportMessage(`Imported ${result.created} new item${result.created === 1 ? '' : 's'} and updated ${result.updated} item${result.updated === 1 ? '' : 's'}.`);
      setBulkImportErrors(result.errors || []);
      setBulkImportFile(null);
      pushNotification('Product added', 'Inventory import completed and the grid updated.', 'green');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Products could not be imported.');
    } finally {
      setIsBulkImporting(false);
    }
  };

  const toggleReorderItem = (productId: string) => {
    const item = reorderSuggestionItems.find(row => row.id === productId);
    if (item && !canCreateReorder(item)) return;
    setSelectedReorderItems(previousSelected =>
      previousSelected.includes(productId)
        ? previousSelected.filter(selectedId => selectedId !== productId)
        : [...previousSelected, productId]
    );
  };

  const submitReorderSuggestions = () => {
    const selectedItems = selectedReorderItems
      .filter(productId => {
        const item = reorderSuggestionItems.find(row => row.id === productId);
        return item ? canCreateReorder(item) : false;
      })
      .map(productId => ({
        productId,
        quantity: Number(reorderQuantities[productId] || 0)
      }))
      .filter(item => item.quantity > 0);

    if (selectedItems.length === 0) {
      toast.warning('Select at least one reorder item', {
        description: 'Choose low-stock items and enter the quantity needed.'
      });
      return;
    }

    if (selectedItems.length === 1) {
      onReorderOutOfStock([selectedItems[0].productId]);
      return;
    }

    onCreateReorderPurchaseOrders(selectedItems);
  };

  const validateAddItem = () => {
    if (!buildInventoryItemName(addItemForm) || !addItemForm.category || !addItemForm.brand) {
      setFormError('Enter product name or seeded identity, brand, and category.');
      return false;
    }
    const hasBulkVariantStock = selectedSeedCatalog?.variants.some(seed => {
      const key = getSeedVariantKey(seed);
      return (addItemForm.drawerVariantStocks[key] || '').trim() !== '';
    });
    const bulkVariantMissingPrice = selectedSeedCatalog?.variants.some(seed => {
      const key = getSeedVariantKey(seed);
      const stockText = addItemForm.drawerVariantStocks[key] || '';
      if (!stockText.trim()) return false;
      const retailText = addItemForm.drawerVariantRetailPrices[key] || addItemForm.retailPrice;
      return !retailText || Number(retailText) <= 0;
    });
    const bulkVariantMissingCost = selectedSeedCatalog?.variants.some(seed => {
      const key = getSeedVariantKey(seed);
      const stockText = addItemForm.drawerVariantStocks[key] || '';
      if (!stockText.trim()) return false;
      const costText = addItemForm.drawerVariantCostPrices[key] || addItemForm.buyingPrice;
      return !costText || Number(costText) < 0;
    });
    if (!hasBulkVariantStock && (!addItemForm.buyingPrice || !addItemForm.retailPrice)) {
      setFormError('Enter buying price and retail price.');
      return false;
    }
    if (hasBulkVariantStock && bulkVariantMissingPrice) {
      setFormError('Enter a retail price for each stocked variant, or enter one main retail price and apply it to all.');
      return false;
    }
    if (hasBulkVariantStock && bulkVariantMissingCost) {
      setFormError('Enter a cost price for each stocked variant, or enter one main cost price and apply it to all.');
      return false;
    }
    if (activeSuppliers.length > 0 && !addItemForm.supplierId) {
      setFormError('Select the supplier company for this item.');
      return false;
    }
    if (addItemForm.trackExpiry && !addItemForm.expiryDate) {
      const message = 'Enter the expiry date for this item.';
      setFormError(message);
      setAddItemFieldErrors({ expiryDate: message });
      return false;
    }
    if (addItemForm.trackExpiry && addItemForm.expiryDate < new Date().toISOString().slice(0, 10)) {
      const message = 'Expiry date cannot be in the past.';
      setFormError(message);
      setAddItemFieldErrors({ expiryDate: message });
      return false;
    }
    if (isQuantifiableUnit(addItemForm.uom) && addItemForm.quantityLevels.some(level => !level.retailPrice || Number(level.retailPrice) <= 0)) {
      setFormError('Enter the retail price for each POS quantity level.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleImagesSelected = async (files?: FileList | File[]) => {
    setImageError('');
    if (!files) return;
    const selectedFiles = Array.from(files).slice(0, 4);
    const invalidFile = selectedFiles.find(file => !file.type.startsWith('image/'));
    if (invalidFile) {
      setImageError('Choose image files only.');
      return;
    }
    const largeFile = selectedFiles.find(file => file.size > 1.5 * 1024 * 1024);
    if (largeFile) {
      setImageError('Each image must be under 1.5 MB.');
      return;
    }
    const images = await Promise.all(selectedFiles.map(readImageAsDataUrl));
    setAddItemForm(previous => ({ ...previous, images: [...previous.images, ...images].slice(0, 4) }));
  };

  const applySeededVariant = (seed: InventoryVariantSeed) => {
    setAddItemForm(previousForm => ({
      ...previousForm,
      name: '',
      sku: previousForm.sku || createSeedSku(seed),
      barcode: '',
      category: seed.category,
      brand: seed.brand,
      parentProduct: seed.family,
      itemType: seed.itemType,
      size: seed.size,
      color: seed.color || '',
      packSize: seed.packSize || '',
      notes: seed.variation || previousForm.notes,
      uom: seed.uom,
      reorderLevel: previousForm.reorderLevel || String(seed.reorderLevel)
    }));
  };

  const updateDrawerVariantStock = (seed: InventoryVariantSeed, stock: string) => {
    setAddItemForm(previousForm => ({
      ...previousForm,
      drawerVariantStocks: {
        ...previousForm.drawerVariantStocks,
        [getSeedVariantKey(seed)]: stock
      }
    }));
  };

  const updateDrawerVariantValue = (
    field: 'drawerVariantRetailPrices' | 'drawerVariantCostPrices' | 'drawerVariantWholesalePrices',
    seed: InventoryVariantSeed,
    value: string
  ) => {
    setAddItemForm(previousForm => ({
      ...previousForm,
      [field]: {
        ...previousForm[field],
        [getSeedVariantKey(seed)]: value
      }
    }));
  };

  const fillDrawerVariantPrices = () => {
    if (!selectedSeedCatalog) return;
    setAddItemForm(previousForm => {
      const retailPrices = { ...previousForm.drawerVariantRetailPrices };
      const costPrices = { ...previousForm.drawerVariantCostPrices };
      const wholesalePrices = { ...previousForm.drawerVariantWholesalePrices };
      selectedSeedCatalog.variants.forEach(seed => {
        const key = getSeedVariantKey(seed);
        if (previousForm.retailPrice) retailPrices[key] = previousForm.retailPrice;
        if (previousForm.buyingPrice) costPrices[key] = previousForm.buyingPrice;
        if (previousForm.wholesalePrice) wholesalePrices[key] = previousForm.wholesalePrice;
      });
      return {
        ...previousForm,
        drawerVariantRetailPrices: retailPrices,
        drawerVariantCostPrices: costPrices,
        drawerVariantWholesalePrices: wholesalePrices
      };
    });
  };

  const buildProductFromForm = (
    overrides: Partial<Product> & {
      name?: string;
      sku?: string;
      barcode?: string;
      brand?: string;
      parentProduct?: string;
      variation?: string;
      packSize?: string;
      uom?: string;
      stock?: number;
      retailPrice?: number;
      wholesalePrice?: number;
      buyingPrice?: number;
      reorderLevel?: number;
    } = {}
  ): Product => {
    const itemName = overrides.name || buildInventoryItemName(addItemForm);
    const parentProduct = overrides.parentProduct || resolvePosFamilyFromForm(addItemForm, itemName);
    const sku = overrides.sku || addItemForm.sku || createGeneratedCode([overrides.brand || addItemForm.brand, overrides.parentProduct || addItemForm.parentProduct || itemName]);
    const barcode = overrides.barcode === undefined
      ? addItemForm.barcode.trim() || undefined
      : overrides.barcode;
    const selectedSupplier = suppliers.find(supplier => String(supplier.id) === addItemForm.supplierId);
    const retailPrice = overrides.retailPrice ?? (Number(addItemForm.retailPrice) || 0);
    const wholesalePrice = overrides.wholesalePrice ?? (Number(addItemForm.wholesalePrice) || retailPrice);
    const corporatePrice = Number(addItemForm.corporatePrice) || wholesalePrice || retailPrice;
    const loyalPrice = Number(addItemForm.loyalPrice) || retailPrice;
    const buyingPrice = overrides.buyingPrice ?? (Number(addItemForm.buyingPrice) || 0);
    const uom = overrides.uom || addItemForm.uom;
    const quantityLevels = isQuantifiableUnit(uom)
      ? addItemForm.quantityLevels.map(level => ({
          quantity: Number(level.quantity),
          label: level.label,
          prices: {
            retail: Number(level.retailPrice) || 0,
            wholesale: Number(level.wholesalePrice) || Number(level.retailPrice) || 0,
            corporate: Number(level.corporatePrice) || Number(level.wholesalePrice) || Number(level.retailPrice) || 0,
            loyal: Number(level.loyalPrice) || Number(level.retailPrice) || 0
          }
        }))
      : [];

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: itemName,
      sku,
      barcode,
      category: addItemForm.category,
      brand: overrides.brand || addItemForm.brand,
      parentProduct,
      variation: overrides.variation || buildPosVariationLabel(addItemForm),
      packSize: overrides.packSize || buildPosPackSizeLabel(addItemForm),
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name,
      supplierSku: addItemForm.supplierSku.trim(),
      buyingPrice,
      prices: {
        retail: retailPrice,
        wholesale: wholesalePrice,
        corporate: corporatePrice,
        loyal: loyalPrice
      },
      profitMargin: buyingPrice > 0 ? ((retailPrice - buyingPrice) / buyingPrice) * 100 : 0,
      uom,
      stock: overrides.stock ?? (Number(addItemForm.stock) || 0),
      reorderLevel: overrides.reorderLevel ?? (Number(addItemForm.reorderLevel) || 0),
      maximumStock: Number(addItemForm.maximumStock) || undefined,
      expiryDate: addItemForm.trackExpiry ? addItemForm.expiryDate : undefined,
      quantityLevels,
      image: addItemForm.imageUrl.trim() || addItemForm.images[0] || '',
      tax: Number(addItemForm.tax) || 0
    };
  };

  const resetAddItemForm = () => {
    setAddItemForm(blankAddItemForm);
    setFormError('');
    setAddItemFieldErrors({});
    setImageError('');
    window.localStorage.removeItem(inventoryDraftKey);
  };

  const handleAddItem = async () => {
    if (!validateAddItem()) return;

    const stockedDrawerVariants = selectedSeedCatalog?.variants
      .map(seed => {
        const key = getSeedVariantKey(seed);
        const stockText = addItemForm.drawerVariantStocks[getSeedVariantKey(seed)] || '';
        const retailText = addItemForm.drawerVariantRetailPrices[key] || addItemForm.retailPrice;
        const costText = addItemForm.drawerVariantCostPrices[key] || addItemForm.buyingPrice;
        const wholesaleText = addItemForm.drawerVariantWholesalePrices[key] || addItemForm.wholesalePrice || retailText;
        return {
          seed,
          stockText,
          stock: Number(stockText),
          retailPrice: Number(retailText),
          buyingPrice: Number(costText),
          wholesalePrice: Number(wholesaleText)
        };
      })
      .filter(item => item.stockText.trim() !== '' && Number.isFinite(item.stock) && item.stock >= 0) || [];

    try {
      if (stockedDrawerVariants.length > 0) {
        for (const { seed, stock, retailPrice, buyingPrice, wholesalePrice } of stockedDrawerVariants) {
          await onAddItem(buildProductFromForm({
            name: [seed.brand, seed.family, seed.itemType, seed.size, seed.color, seed.packSize].filter(Boolean).join(' '),
            sku: createSeedSku(seed),
            barcode: undefined,
            brand: seed.brand,
            parentProduct: seed.family,
            variation: [seed.itemType, seed.color, seed.variation].filter(Boolean).join(' / ') || 'Standard',
            packSize: [seed.size, seed.packSize].filter(Boolean).join(' / ') || seed.uom,
            uom: seed.uom,
            stock,
            retailPrice,
            buyingPrice,
            wholesalePrice,
            reorderLevel: Number(addItemForm.reorderLevel) || seed.reorderLevel
          }));
        }
      } else {
        await onAddItem(buildProductFromForm());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inventory item could not be added.';
      setFormError(message);
      setAddItemFieldErrors(getAddItemFieldErrors(message));
      return;
    }

    const addedCount = stockedDrawerVariants.length || 1;
    const addedLabel = addedCount === 1 ? buildInventoryItemName(addItemForm) : `${addedCount} drawer variants`;
    pushNotification('Product added', `${addedLabel} added to inventory.`, 'green');
    toast.success(addedCount === 1 ? 'Inventory item added' : 'Inventory variants added');
    resetAddItemForm();
    setIsAddItemOpen(false);
  };

  const renderAddItemForm = () => (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">Basic Information</p>
        <Input placeholder="Product name" value={addItemForm.name} onChange={(event) => updateAddItemName(event.target.value)} className={addItemInputClass('name')} />
        <div className="flex gap-2">
          <Input placeholder="SKU" value={addItemForm.sku} onChange={(event) => updateAddItemField('sku', event.target.value)} className={addItemInputClass('sku')} />
          <Button type="button" variant="outline" onClick={() => setAddItemForm({ ...addItemForm, sku: createGeneratedCode([addItemForm.brand, addItemForm.parentProduct || addItemForm.name]) })}>
            Auto
          </Button>
        </div>
        {addItemFieldErrors.sku && <p className="text-xs font-medium text-red-600">{addItemFieldErrors.sku}</p>}
        <div className="flex gap-2">
          <Input placeholder="Barcode" value={addItemForm.barcode} onChange={(event) => updateAddItemField('barcode', event.target.value)} className={addItemInputClass('barcode')} />
          <Button type="button" variant="outline" onClick={() => setAddItemForm({ ...addItemForm, barcode: createGeneratedCode(['BAR', addItemForm.brand, addItemForm.name]) })}>
            Generate
          </Button>
        </div>
        {addItemFieldErrors.barcode && <p className="text-xs font-medium text-red-600">{addItemFieldErrors.barcode}</p>}
        <Input placeholder="Brand *" value={addItemForm.brand} onChange={(event) => updateAddItemField('brand', event.target.value)} className={addItemInputClass('brand')} />
        <Input placeholder="Category *" value={addItemForm.category} onChange={(event) => updateAddItemField('category', event.target.value)} className={addItemInputClass('category')} />
        {addItemFieldErrors.json && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{addItemFieldErrors.json}</p>}
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-5">
        <p className="text-sm font-semibold text-gray-900">Product Details</p>
        <Input placeholder="Product family / POS group (e.g. Milk, Sugar, Shirts)" value={addItemForm.parentProduct} onChange={(event) => setAddItemForm({ ...addItemForm, parentProduct: event.target.value })} className="bg-gray-100 border-gray-200" />
        <div className="flex flex-wrap gap-2">
          {uniqueInOrder([...matchingSeedCatalogs.map(catalog => catalog.family), ...seededInventoryCatalog.map(catalog => catalog.family)]).map(family => {
            const catalog = seededInventoryCatalog.find(seedCatalog => seedCatalog.family === family);
            if (!catalog) return null;
            return (
            <Button
              key={catalog.family}
              type="button"
              variant={normalizeSeedSearch(addItemForm.parentProduct) === normalizeSeedSearch(catalog.family) ? 'default' : 'outline'}
              size="sm"
              className={normalizeSeedSearch(addItemForm.parentProduct) === normalizeSeedSearch(catalog.family) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}
              onClick={() => setAddItemForm(previous => ({ ...previous, parentProduct: catalog.family }))}
            >
              {catalog.family}
            </Button>
            );
          })}
        </div>
        {selectedSeedCatalog && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Related {selectedSeedCatalog.family} subitems</p>
                <p className="text-xs text-gray-500">Select a related item to fill brand, variant, size, unit, reorder level, SKU, and barcode.</p>
              </div>
              <Badge variant="outline">{selectedSeedCatalog.variants.length} options</Badge>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {selectedSeedCatalog.variants.map(seed => (
                <div
                  key={`${seed.brand}-${seed.itemType}-${seed.size}-${seed.packSize || ''}`}
                  className="grid gap-3 rounded-md border border-gray-200 bg-white p-3 transition hover:border-blue-300 hover:bg-blue-50 sm:grid-cols-[minmax(0,1fr)_120px]"
                >
                  <button type="button" onClick={() => applySeededVariant(seed)} className="min-w-0 text-left">
                    <div className="text-sm font-medium text-gray-900">{seed.brand} {seed.itemType}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>{seed.size}</span>
                      {seed.packSize && <span>{seed.packSize}</span>}
                      <span>{seed.category}</span>
                    </div>
                  </button>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Stock</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={addItemForm.drawerVariantStocks[getSeedVariantKey(seed)] || ''}
                      onChange={(event) => updateDrawerVariantStock(seed, event.target.value)}
                      className="mt-1 bg-gray-100 border-gray-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <Input placeholder="Type / flavor / graphic (POS variant button)" value={addItemForm.itemType} onChange={(event) => setAddItemForm({ ...addItemForm, itemType: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input placeholder="Size (POS pack/size button, e.g. 500ml)" value={addItemForm.size} onChange={(event) => setAddItemForm({ ...addItemForm, size: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input placeholder="Weight" value={addItemForm.weight} onChange={(event) => setAddItemForm({ ...addItemForm, weight: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Select value={addItemForm.uom} onValueChange={updateAddItemUnit}>
          <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Unit" /></SelectTrigger>
          <SelectContent>{unitOptions.map(unit => <SelectItem key={unit} value={unit}>{unit.toUpperCase()}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Color (POS variant button)" value={addItemForm.color} onChange={(event) => setAddItemForm({ ...addItemForm, color: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input placeholder="Pack / count (POS pack/size button)" value={addItemForm.packSize} onChange={(event) => setAddItemForm({ ...addItemForm, packSize: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input placeholder="Notes" value={addItemForm.notes} onChange={(event) => setAddItemForm({ ...addItemForm, notes: event.target.value })} className="bg-gray-100 border-gray-200" />
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-5">
        <p className="text-sm font-semibold text-gray-900">Pricing</p>
        <Input type="number" placeholder="Buying price *" value={addItemForm.buyingPrice} onChange={(event) => setAddItemForm({ ...addItemForm, buyingPrice: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Retail price *" value={addItemForm.retailPrice} onChange={(event) => setAddItemForm({ ...addItemForm, retailPrice: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Wholesale price" value={addItemForm.wholesalePrice} onChange={(event) => setAddItemForm({ ...addItemForm, wholesalePrice: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Corporate price" value={addItemForm.corporatePrice} onChange={(event) => setAddItemForm({ ...addItemForm, corporatePrice: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Loyalty price" value={addItemForm.loyalPrice} onChange={(event) => setAddItemForm({ ...addItemForm, loyalPrice: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Tax %" value={addItemForm.tax} onChange={(event) => updateAddItemTax(event.target.value)} className="bg-gray-100 border-gray-200" />
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-5">
        <p className="text-sm font-semibold text-gray-900">Inventory</p>
        <Input type="number" placeholder="Opening stock" value={addItemForm.stock} onChange={(event) => setAddItemForm({ ...addItemForm, stock: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input type="number" placeholder="Reorder level" value={addItemForm.reorderLevel} onChange={(event) => setAddItemForm({ ...addItemForm, reorderLevel: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Input placeholder="Warehouse" value={addItemForm.warehouse} onChange={(event) => setAddItemForm({ ...addItemForm, warehouse: event.target.value })} className="bg-gray-100 border-gray-200" />
        <Select value={addItemForm.supplierId} onValueChange={(supplierId) => setAddItemForm({ ...addItemForm, supplierId })}>
          <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Supplier / company" /></SelectTrigger>
          <SelectContent>
            {activeSuppliers.map(supplier => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-5">
        <p className="text-sm font-semibold text-gray-900">Images</p>
        <div
          className="flex min-h-36 flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleImagesSelected(event.dataTransfer.files);
          }}
        >
          <ImagePlus className="mb-2 h-7 w-7 text-gray-500" />
          <p className="text-sm font-medium text-gray-900">Drag product images here</p>
          <p className="text-xs text-gray-500">Upload up to 4 images. The first image becomes the product image.</p>
          <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload className="h-4 w-4" />
            Browse
            <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleImagesSelected(event.target.files || undefined)} />
          </label>
        </div>
        {addItemForm.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {addItemForm.images.map((image, index) => (
              <div key={image.slice(0, 24)} className="relative rounded-md border border-gray-200 bg-white p-2">
                <img src={image} alt={`Product preview ${index + 1}`} className="h-24 w-full rounded object-cover" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute right-2 top-2 h-7 w-7 p-0"
                  onClick={() => setAddItemForm(previous => ({ ...previous, images: previous.images.filter((_, imageIndex) => imageIndex !== index) }))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderStructuredAddProductForm = () => {
    const previewImage = addItemForm.imageUrl.trim() || addItemForm.images[0] || '';
    const retailPrice = Number(addItemForm.retailPrice) || 0;
    const buyingPrice = Number(addItemForm.buyingPrice) || 0;
    const profitMargin = buyingPrice > 0 && retailPrice > 0 ? ((retailPrice - buyingPrice) / buyingPrice) * 100 : null;
    const posProductGroup = addItemForm.parentProduct || buildInventoryItemName(addItemForm) || 'Product group';
    const posVariation = buildPosVariationLabel(addItemForm);
    const posPackSize = buildPosPackSizeLabel(addItemForm);

    return (
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-blue-50 p-2"><Package className="h-4 w-4 text-blue-600" /></span>
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Product Name <span className="text-red-500">*</span></label>
                <Input placeholder="Enter product name" value={addItemForm.name} onChange={(event) => updateAddItemName(event.target.value)} className={addItemInputClass('name')} />
                {matchingSeedCatalogs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {matchingSeedCatalogs.slice(0, 6).map(catalog => (
                      <Button
                        key={catalog.family}
                        type="button"
                        variant={addItemForm.parentProduct === catalog.family ? 'default' : 'outline'}
                        size="sm"
                        className={addItemForm.parentProduct === catalog.family ? 'h-7 bg-blue-600 px-2 text-xs hover:bg-blue-700' : 'h-7 bg-white px-2 text-xs'}
                        onClick={() => handleSeedSubcategoryChange(catalog.family)}
                      >
                        {catalog.family}
                      </Button>
                    ))}
                  </div>
                )}
                {addItemFieldErrors.name && <p className="text-xs font-medium text-red-600">{addItemFieldErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">SKU / Barcode <span className="text-red-500">*</span></label>
                <div className="flex">
                  <Input placeholder="Enter SKU or scan barcode" value={addItemForm.sku} onChange={(event) => updateAddItemField('sku', event.target.value)} className={addItemInputClass(addItemFieldErrors.barcode ? 'barcode' : 'sku', 'rounded-r-none')} />
                  <Button type="button" variant="outline" className="rounded-l-none border-l-0 px-3" onClick={() => setAddItemForm({ ...addItemForm, sku: createGeneratedCode([addItemForm.brand, addItemForm.parentProduct || addItemForm.name]) })}>
                    <ScanLine className="h-4 w-4" />
                  </Button>
                </div>
                {(addItemFieldErrors.sku || addItemFieldErrors.barcode) && (
                  <p className="text-xs font-medium text-red-600">{addItemFieldErrors.sku || addItemFieldErrors.barcode}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Category <span className="text-red-500">*</span></label>
                <SearchableSeedSelect
                  value={addItemForm.category}
                  options={seededCategoryOptions}
                  placeholder="Select category"
                  onChange={handleSeedCategoryChange}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-gray-700">Product Family / POS Group</label>
                  <span className="text-xs text-gray-500">{seededSubcategoryOptions.length} listed</span>
                </div>
                <SearchableSeedSelect
                  value={addItemForm.parentProduct}
                  options={seededSubcategoryOptions}
                  placeholder="Select product family"
                  onChange={handleSeedSubcategoryChange}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Brand <span className="text-red-500">*</span></label>
                <SearchableSeedSelect
                  value={addItemForm.brand}
                  options={seededBrandOptions}
                  placeholder="Select brand"
                  onChange={(brand) => setAddItemForm({ ...addItemForm, brand })}
                />
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50/70 p-3 lg:col-span-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">POS drawer preview</p>
                    <p className="mt-1 text-xs text-gray-600">POS groups by Product Family, then filters by Brand, Type / Color / Flavor, and Pack / Size.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-4 lg:min-w-[620px]">
                    <div className="rounded border border-blue-100 bg-white px-3 py-2">
                      <span className="block text-gray-500">Grid Card</span>
                      <strong className="block truncate text-gray-900">{posProductGroup}</strong>
                    </div>
                    <div className="rounded border border-blue-100 bg-white px-3 py-2">
                      <span className="block text-gray-500">Brand</span>
                      <strong className="block truncate text-gray-900">{addItemForm.brand || 'Brand'}</strong>
                    </div>
                    <div className="rounded border border-blue-100 bg-white px-3 py-2">
                      <span className="block text-gray-500">Type / Color</span>
                      <strong className="block truncate text-gray-900">{posVariation}</strong>
                    </div>
                    <div className="rounded border border-blue-100 bg-white px-3 py-2">
                      <span className="block text-gray-500">Pack / Size</span>
                      <strong className="block truncate text-gray-900">{posPackSize}</strong>
                    </div>
                  </div>
                </div>
              </div>
              {selectedSeedCatalog && (
                <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 lg:col-span-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Bulk variants by quantity</p>
                      <p className="text-xs text-gray-500">Add stock and prices for each brand, pack, or size under {selectedSeedCatalog.family}.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={fillDrawerVariantPrices}>
                        Apply main prices
                      </Button>
                      <Badge variant="outline">{selectedSeedCatalog.variants.length} options</Badge>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto pr-1">
                    <div className="min-w-[760px] space-y-2">
                      <div className="grid grid-cols-[minmax(180px,1fr)_90px_110px_110px_110px] gap-2 px-2 text-xs font-semibold uppercase text-gray-500">
                        <span>Variant</span>
                        <span>Stock</span>
                        <span>Cost</span>
                        <span>Retail</span>
                        <span>Wholesale</span>
                      </div>
                    {selectedSeedCatalog.variants.map(seed => (
                      <div key={getSeedVariantKey(seed)} className="grid grid-cols-[minmax(180px,1fr)_90px_110px_110px_110px] gap-2 rounded-md border border-gray-200 bg-white p-2">
                        <button type="button" onClick={() => applySeededVariant(seed)} className="min-w-0 text-left">
                          <p className="truncate text-sm font-medium text-gray-900">{seed.brand} {seed.itemType}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{[seed.size, seed.color, seed.packSize, seed.variation].filter(Boolean).join(' / ') || seed.uom}</p>
                        </button>
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={addItemForm.drawerVariantStocks[getSeedVariantKey(seed)] || ''}
                          onChange={(event) => updateDrawerVariantStock(seed, event.target.value)}
                          className="bg-gray-100 border-gray-200"
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder={addItemForm.buyingPrice || '0.00'}
                          value={addItemForm.drawerVariantCostPrices[getSeedVariantKey(seed)] || ''}
                          onChange={(event) => updateDrawerVariantValue('drawerVariantCostPrices', seed, event.target.value)}
                          className="bg-gray-100 border-gray-200"
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder={addItemForm.retailPrice || '0.00'}
                          value={addItemForm.drawerVariantRetailPrices[getSeedVariantKey(seed)] || ''}
                          onChange={(event) => updateDrawerVariantValue('drawerVariantRetailPrices', seed, event.target.value)}
                          className="bg-gray-100 border-gray-200"
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder={addItemForm.wholesalePrice || addItemForm.retailPrice || '0.00'}
                          value={addItemForm.drawerVariantWholesalePrices[getSeedVariantKey(seed)] || ''}
                          onChange={(event) => updateDrawerVariantValue('drawerVariantWholesalePrices', seed, event.target.value)}
                          className="bg-gray-100 border-gray-200"
                        />
                      </div>
                    ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Unit <span className="text-red-500">*</span></label>
                <Select value={addItemForm.uom} onValueChange={updateAddItemUnit}>
                  <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>{unitOptions.map(unit => <SelectItem key={unit} value={unit}>{unit.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {hasQuantityLevels && (
                <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50/60 p-3 md:col-span-2 xl:col-span-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">POS quantity levels</p>
                      <p className="text-xs text-gray-500">Set the selling price for each selectable quantity shown in POS.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={regenerateQuantityLevels}>
                        Generate from prices
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={addQuantityLevel}>
                        Add level
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {addItemForm.quantityLevels.map((level, index) => (
                      <div key={`${level.quantity}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-white p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Quantity</label>
                          <Input readOnly value={level.label} className="mt-1 bg-gray-100 border-gray-200" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Retail</label>
                          <Input type="number" value={level.retailPrice} onChange={(event) => updateQuantityLevel(index, 'retailPrice', event.target.value)} className="mt-1 bg-gray-100 border-gray-200" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Wholesale</label>
                          <Input type="number" value={level.wholesalePrice} onChange={(event) => updateQuantityLevel(index, 'wholesalePrice', event.target.value)} className="mt-1 bg-gray-100 border-gray-200" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Corporate</label>
                          <Input type="number" value={level.corporatePrice} onChange={(event) => updateQuantityLevel(index, 'corporatePrice', event.target.value)} className="mt-1 bg-gray-100 border-gray-200" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Loyalty</label>
                          <Input type="number" value={level.loyalPrice} onChange={(event) => updateQuantityLevel(index, 'loyalPrice', event.target.value)} className="mt-1 bg-gray-100 border-gray-200" />
                        </div>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" size="sm" onClick={() => removeQuantityLevel(index)} disabled={addItemForm.quantityLevels.length <= 1}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-green-50 p-2"><DollarSign className="h-4 w-4 text-green-600" /></span>
                Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Cost Price <span className="text-red-500">*</span></label><Input type="number" placeholder="0.00" value={addItemForm.buyingPrice} onChange={(event) => setAddItemForm({ ...addItemForm, buyingPrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Retail Price <span className="text-red-500">*</span></label><Input type="number" placeholder="0.00" value={addItemForm.retailPrice} onChange={(event) => setAddItemForm({ ...addItemForm, retailPrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Wholesale Price</label><Input type="number" placeholder="0.00" value={addItemForm.wholesalePrice} onChange={(event) => setAddItemForm({ ...addItemForm, wholesalePrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Corporate Price</label><Input type="number" placeholder="0.00" value={addItemForm.corporatePrice} onChange={(event) => setAddItemForm({ ...addItemForm, corporatePrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Loyalty Price</label><Input type="number" placeholder="0.00" value={addItemForm.loyalPrice} onChange={(event) => setAddItemForm({ ...addItemForm, loyalPrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Tax %</label>
                <Select value={addItemForm.tax} onValueChange={updateAddItemTax}>
                  <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Select tax" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="8">8%</SelectItem>
                    <SelectItem value="16">16%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Profit Margin</label><Input readOnly placeholder="Auto" value={profitMargin === null ? '' : profitMargin.toFixed(2)} className="bg-gray-100 border-gray-200" /></div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-purple-50 p-2"><Boxes className="h-4 w-4 text-purple-600" /></span>
                Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Opening Stock <span className="text-red-500">*</span></label><Input type="number" placeholder="0" value={addItemForm.stock} onChange={(event) => setAddItemForm({ ...addItemForm, stock: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Reorder Level</label><Input type="number" placeholder="0" value={addItemForm.reorderLevel} onChange={(event) => setAddItemForm({ ...addItemForm, reorderLevel: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Maximum Stock</label><Input type="number" placeholder="0" value={addItemForm.maximumStock} onChange={(event) => setAddItemForm({ ...addItemForm, maximumStock: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Location / Shelf</label><Input placeholder="Enter location" value={addItemForm.warehouse} onChange={(event) => setAddItemForm({ ...addItemForm, warehouse: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-blue-50 p-2"><FileText className="h-4 w-4 text-blue-600" /></span>
                Product Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Tags</label>
                <Input placeholder="Enter tags (e.g. new, promo)" value={addItemForm.tags} onChange={(event) => setAddItemForm({ ...addItemForm, tags: event.target.value })} className="bg-gray-100 border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Product Type</label>
                <Input placeholder="Select product type" value={addItemForm.productType} onChange={(event) => setAddItemForm({ ...addItemForm, productType: event.target.value })} className="bg-gray-100 border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea placeholder="Enter product description" value={addItemForm.description} onChange={(event) => setAddItemForm({ ...addItemForm, description: event.target.value })} className="min-h-24 w-full rounded-md border border-gray-200 bg-gray-100 p-3 text-sm outline-none focus:border-blue-400" maxLength={255} />
                <p className="text-right text-xs text-gray-500">{addItemForm.description.length} / 255</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Ingredients / Details</label>
                <textarea placeholder="Enter ingredients or additional details" value={addItemForm.notes} onChange={(event) => setAddItemForm({ ...addItemForm, notes: event.target.value })} className="min-h-24 w-full rounded-md border border-gray-200 bg-gray-100 p-3 text-sm outline-none focus:border-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-orange-50 p-2"><ImagePlus className="h-4 w-4 text-orange-600" /></span>
                Product Image
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Paste image URL (https://...)" value={addItemForm.imageUrl} onChange={(event) => setAddItemForm({ ...addItemForm, imageUrl: event.target.value })} className="bg-gray-100 border-gray-200" />
              <div
                className="flex min-h-44 flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleImagesSelected(event.dataTransfer.files);
                }}
              >
                <Upload className="mb-2 h-8 w-8 text-gray-500" />
                <p className="text-sm font-medium text-gray-900">Upload Product Image</p>
                <p className="text-xs text-gray-500">JPG, PNG or WEBP. Max size 2MB.</p>
                <label className="mt-4 inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-blue-700 hover:bg-gray-50">
                  Choose File
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleImagesSelected(event.target.files || undefined)} />
                </label>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Image Preview</p>
                <div className="flex h-28 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                  {previewImage ? <img src={previewImage} alt="Product preview" className="h-full w-full rounded-md object-cover" /> : <ImagePlus className="h-9 w-9 text-gray-400" />}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-purple-50 p-2"><Users className="h-4 w-4 text-purple-600" /></span>
                Supplier Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Supplier <span className="text-red-500">*</span></label>
                <Select value={addItemForm.supplierId} onValueChange={(supplierId) => setAddItemForm({ ...addItemForm, supplierId })}>
                  <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{activeSuppliers.map(supplier => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Supplier SKU</label><Input placeholder="Enter supplier SKU" value={addItemForm.supplierSku} onChange={(event) => setAddItemForm({ ...addItemForm, supplierSku: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Supplier Cost</label><Input type="number" placeholder="0.00" value={addItemForm.buyingPrice} onChange={(event) => setAddItemForm({ ...addItemForm, buyingPrice: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Lead Time (Days)</label><Input type="number" placeholder="Enter lead time" value={addItemForm.leadTime} onChange={(event) => setAddItemForm({ ...addItemForm, leadTime: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-base text-gray-900">
                <span className="rounded-md bg-blue-50 p-2"><Info className="h-4 w-4 text-blue-600" /></span>
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Warranty Period</label><Input type="number" placeholder="Months" value={addItemForm.warrantyPeriod} onChange={(event) => setAddItemForm({ ...addItemForm, warrantyPeriod: event.target.value })} className="bg-gray-100 border-gray-200" /></div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Product Status</label>
                  <Select value={addItemForm.productStatus} onValueChange={(productStatus) => setAddItemForm({ ...addItemForm, productStatus })}>
                    <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <input type="checkbox" checked={addItemForm.trackExpiry} onChange={(event) => setAddItemForm({ ...addItemForm, trackExpiry: event.target.checked, expiryDate: event.target.checked ? addItemForm.expiryDate : '' })} />
                <span><span className="block text-sm font-medium text-gray-900">Track Expiry Date</span><span className="block text-xs text-gray-500">Enable if this product has an expiry date.</span></span>
              </label>
              {addItemForm.trackExpiry && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Expiry Date <span className="text-red-500">*</span></label>
                  <Input
                    type="date"
                    value={addItemForm.expiryDate}
                    onChange={(event) => updateAddItemField('expiryDate', event.target.value)}
                    className={addItemInputClass('expiryDate')}
                  />
                  {addItemFieldErrors.expiryDate && <p className="text-xs font-medium text-red-600">{addItemFieldErrors.expiryDate}</p>}
                </div>
              )}
              <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <input type="checkbox" checked={addItemForm.publishToPos} onChange={(event) => setAddItemForm({ ...addItemForm, publishToPos: event.target.checked })} />
                <span><span className="block text-sm font-medium text-gray-900">Publish to POS</span><span className="block text-xs text-gray-500">Available for sale in POS.</span></span>
              </label>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900">Inventory Command Center</h1>
            <Badge className="bg-green-500/15 text-green-700">Live</Badge>
          </div>
          <p className="mt-1 text-gray-500">Real-time stock control, valuation, movement tracking, reorders, and supplier-linked inventory.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setIsAddItemOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
          <Button
            variant="outline"
            disabled={outOfStockItems.filter(canCreateReorder).length === 0}
            onClick={() => onReorderOutOfStock(outOfStockItems.filter(canCreateReorder).map(item => item.id))}
          >
            <PackageMinus className="mr-2 h-4 w-4" />
            Reorder All Out of Stock ({outOfStockItems.filter(canCreateReorder).length})
          </Button>
          <Button variant="outline" onClick={() => setIsNotificationsOpen(true)}>
            <Bell className="mr-2 h-4 w-4" />
            Alerts ({notifications.length})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {[
          { label: 'Total Products', value: inventory.length, icon: Package, tone: 'blue' },
          { label: 'Inventory Value', value: formatCurrency(totalInventoryValue), icon: Boxes, tone: 'green' },
          { label: 'In Stock', value: inventory.filter(item => item.status === 'In Stock').length, icon: CheckCircle2, tone: 'green' },
          { label: 'Low Stock', value: lowStockItems.length, icon: AlertTriangle, tone: 'yellow' },
          { label: 'Out of Stock', value: outOfStockItems.length, icon: PackageMinus, tone: 'red' },
          { label: "Today's Movements", value: todayMovements.length, icon: History, tone: 'blue' },
          { label: "Today's Sales Impact", value: todaySalesImpact, icon: PackageCheck, tone: 'purple' },
          { label: 'Pending Reorders', value: pendingReorders, icon: ShoppingBag, tone: 'orange' }
        ].map(card => (
          <Card key={card.label} className="bg-white border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-gray-500">{card.label}</p>
                  <p className="mt-1 truncate text-2xl font-semibold text-gray-900">{card.value}</p>
                </div>
                <div className="rounded-md bg-gray-100 p-2">
                  <card.icon className="h-5 w-5 text-gray-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
                placeholder="Search product, SKU, barcode, or supplier..."
                className="bg-gray-100 border-gray-200 pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categories.map(category => <SelectItem key={category} value={category}>{category === 'all' ? 'All Categories' : category}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Supplier" /></SelectTrigger>
              <SelectContent>
                {supplierFilterOptions.map(supplier => <SelectItem key={supplier} value={supplier}>{supplier === 'all' ? 'All Suppliers' : supplier}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Stock status" /></SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map(status => <SelectItem key={status} value={status}>{status === 'all' ? 'All Statuses' : status}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setIsMoreFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                More Filters
              </Button>
              <div className="flex rounded-md border border-gray-200 bg-gray-100 p-1">
                <Button type="button" variant={tableView === 'grid' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1 px-2" onClick={() => setTableView('grid')} title="Grid view" aria-label="Grid view">
                  <Grid3X3 className="h-4 w-4" />
                  <span className="hidden text-xs xl:inline">Grid</span>
                </Button>
                <Button type="button" variant={tableView === 'table' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1 px-2" onClick={() => setTableView('table')} title="Table view" aria-label="Table view">
                  <List className="h-4 w-4" />
                  <span className="hidden text-xs xl:inline">Table</span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start bg-white border-gray-200">
          <TabsTrigger value="stock" className="data-[state=active]:bg-blue-600">Stock List</TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-blue-600">Trends</TabsTrigger>
          <TabsTrigger value="reorder" className="data-[state=active]:bg-blue-600">Reorder & Activity</TabsTrigger>
          <TabsTrigger value="records" className="data-[state=active]:bg-blue-600">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-gray-900">Inventory Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="inventoryValueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.26} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="inventoryStockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} stroke={chartAxisColor} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} stroke={chartAxisColor} width={72} tickFormatter={(value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)}K` : String(value)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => name === 'Inventory value' ? formatCurrency(Number(value)) : Number(value).toFixed(0)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={3} fill="url(#inventoryValueGradient)" name="Inventory value" dot={{ r: 3, fill: '#2563EB', stroke: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#DBEAFE', strokeWidth: 4 }} />
                <Area type="monotone" dataKey="stock" stroke="#059669" strokeWidth={3} fill="url(#inventoryStockGradient)" name="Stock units" dot={{ r: 3, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#D1FAE5', strokeWidth: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-gray-900">Stock Movement</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movementChartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 6" stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="type" tick={{ fontSize: 10 }} interval={0} angle={-28} textAnchor="end" height={66} tickLine={false} axisLine={false} stroke={chartAxisColor} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} stroke={chartAxisColor} width={38} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="quantity" name="Units moved" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={38}>
                  {movementChartData.map((entry, index) => <Cell key={entry.type} fill={chartColors[index % chartColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-gray-900">Category Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryChartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={3} stroke="#ffffff" strokeWidth={3}>
                  {categoryChartData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="reorder" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
            <Button variant={isTemplateDownloading ? 'default' : 'outline'} size="sm" onClick={handleDownloadTemplate} disabled={isTemplateDownloading} className={isTemplateDownloading ? 'bg-blue-600 text-white' : ''}>
              {isTemplateDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {isTemplateDownloading ? 'Downloading' : 'Template'}
            </Button>
            <Button variant={isExportDownloading ? 'default' : 'outline'} size="sm" onClick={handleDownloadAvailableItems} disabled={isExportDownloading} className={isExportDownloading ? 'bg-blue-600 text-white' : ''}>
              {isExportDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {isExportDownloading ? 'Downloading' : 'Available Items'}
            </Button>
          </div>
          <Card className={outOfStockItems.length > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className={outOfStockItems.length > 0 ? 'rounded-md bg-red-100 p-2' : 'rounded-md bg-gray-100 p-2'}>
                    <ShoppingBag className={outOfStockItems.length > 0 ? 'h-5 w-5 text-red-700' : 'h-5 w-5 text-gray-600'} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Bulk reorder out-of-stock items</p>
                    <p className="text-sm text-gray-600">
                      {outOfStockItems.length > 0
                        ? `${outOfStockItems.length} item${outOfStockItems.length === 1 ? '' : 's'} need supplier reorder requests.`
                        : 'No products are currently out of stock.'}
                    </p>
                  </div>
                </div>
                <Button
                  className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                  disabled={outOfStockItems.filter(canCreateReorder).length === 0}
                  onClick={() => onReorderOutOfStock(outOfStockItems.filter(canCreateReorder).map(item => item.id))}
                >
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Reorder All ({outOfStockItems.filter(canCreateReorder).length})
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-gray-900"><AlertTriangle className="h-4 w-4 text-yellow-600" /> Low Stock Widget</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {outOfStockItems.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-900">Out of stock batch</p>
                      <p className="text-xs text-red-700">{outOfStockItems.length} item{outOfStockItems.length === 1 ? '' : 's'} can be reordered together.</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                      disabled={outOfStockItems.every(item => !canCreateReorder(item))}
                      onClick={() => onReorderOutOfStock(outOfStockItems.filter(canCreateReorder).map(item => item.id))}
                    >
                      Reorder All
                    </Button>
                  </div>
                </div>
              )}
              {lowStockItems.length === 0 ? <p className="text-sm text-gray-500">No low-stock alerts.</p> : lowStockItems.slice(0, 5).map(item => (
                <div key={item.id} className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-600">
                        {item.current} left, reorder at {item.reorderLevel}
                        {item.reserved > 0 ? ` | ${item.reserved} pending PO` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                      disabled={!canCreateReorder(item)}
                      onClick={() => onReorderOutOfStock([item.id])}
                    >
                      {item.reserved > 0 ? 'PO Pending' : 'Reorder'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-gray-900"><Layers3 className="h-4 w-4 text-blue-600" /> Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 ? <p className="text-sm text-gray-500">No inventory activity yet.</p> : recentActivity.map(activity => (
                <div key={activity.id} className="border-l-2 border-gray-200 pl-3">
                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-600">{activity.message}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{activity.time}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-200 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base text-gray-900">Product Stock</CardTitle>
              <p className="mt-1 text-sm text-gray-500">Showing {filteredInventory.length} of {inventory.length} products</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={selectedInventoryIds.length === 0} onClick={handleBulkInventoryActions}>Bulk Actions ({selectedInventoryIds.length})</Button>
              <Button variant={isExportDownloading ? 'default' : 'outline'} onClick={handleDownloadAvailableItems} disabled={isExportDownloading} className={isExportDownloading ? 'bg-blue-600 text-white' : ''}>
                {isExportDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExportDownloading ? 'Exporting' : 'Export'}
              </Button>
              <Button variant="outline" disabled={selectedInventoryIds.length === 0} onClick={handlePrintLabels}>Print Labels</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tableView === 'grid' ? (
            filteredInventory.length === 0 ? (
              <div className="flex h-32 items-center justify-center p-4 text-sm text-gray-500">No products match the selected filters.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredInventory.map(item => (
                  <div
                    key={item.id}
                    className="rounded-md border border-gray-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedInventoryIds.includes(item.id)}
                        onChange={() => toggleInventorySelection(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                      <ImageWithFallback src={item.image} alt={item.name} className="h-12 w-12 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <button type="button" className="block max-w-full truncate text-left font-semibold text-gray-900" onClick={() => setSelectedProductId(item.id)}>{item.name}</button>
                        <p className="truncate text-xs text-gray-500">{item.sku} | {item.supplierName}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge className={statusClassName(item.status)}>{item.status}</Badge>
                          <span className={item.current <= item.reorderLevel ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-green-700'}>{item.current} {item.uom}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <span>Cost {formatCurrency(item.buyingPrice)}</span>
                          <span className="text-right">Value {formatCurrency(item.inventoryValue)}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedProductId(item.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                          {item.current <= item.reorderLevel && (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                              disabled={!canCreateReorder(item)}
                              onClick={() => onReorderOutOfStock([item.id])}
                            >
                              <ShoppingBag className="mr-2 h-4 w-4" />
                              {item.reserved > 0 ? 'PO Pending' : 'Reorder'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleInventorySelection} />
                    </TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Selling</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-32 text-center text-gray-500">No products match the selected filters.</TableCell>
                    </TableRow>
                  ) : filteredInventory.map(item => (
                    <TableRow key={item.id} className="hover:bg-gray-50">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedInventoryIds.includes(item.id)}
                          onChange={() => toggleInventorySelection(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-600">{item.sku}</TableCell>
                      <TableCell>
                        <button type="button" className="flex items-center gap-3 text-left" onClick={() => setSelectedProductId(item.id)}>
                          <ImageWithFallback src={item.image} alt={item.name} className="h-9 w-9 rounded-md object-cover" />
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">{item.brand || item.uom}</p>
                          </div>
                        </button>
                      </TableCell>
                      <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                      <TableCell className="text-gray-700">{item.supplierName}</TableCell>
                      <TableCell className={`text-right font-semibold ${item.current <= item.reorderLevel ? 'text-red-600' : 'text-green-700'}`}>{item.current}</TableCell>
                      <TableCell><Badge className={statusClassName(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(item.buyingPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.selling)}</TableCell>
                      <TableCell className={item.profitMargin >= 0 ? 'text-right font-medium text-green-700' : 'text-right font-medium text-red-700'}>
                        {item.profitMargin.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">{formatCurrency(item.inventoryValue)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {item.current <= item.reorderLevel && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 bg-red-600 px-2 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                              disabled={!canCreateReorder(item)}
                              onClick={() => onReorderOutOfStock([item.id])}
                              title={item.reserved > 0 ? 'Purchase order already pending' : 'Reorder low stock'}
                            >
                              <ShoppingBag className="h-4 w-4" />
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0 text-orange-700" onClick={() => openStockAdjustment(item.id, 'in', 'Quick stock in')} title="Stock in">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0 text-blue-700" onClick={() => openProductHistory(item.id)} title="View history">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0 text-green-700" onClick={() => setActionProductId(item.id)} title="Edit product actions">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setActionProductId(item.id)} title="More actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="bg-white border-gray-200">
          <TabsTrigger value="history" className="data-[state=active]:bg-blue-600">Inventory History</TabsTrigger>
          <TabsTrigger value="timeline" className="data-[state=active]:bg-blue-600">Movement Timeline</TabsTrigger>
          <TabsTrigger value="reorders" className="data-[state=active]:bg-blue-600">Reorder Suggestions</TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:bg-blue-600">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-gray-900">Inventory Movement History</CardTitle>
                <Select value={movementFilter} onValueChange={setMovementFilter}>
                  <SelectTrigger className="w-full bg-gray-100 border-gray-200 md:w-48"><SelectValue placeholder="Movement type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All movements</SelectItem>
                    {movementTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Movement Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Previous Qty</TableHead>
                      <TableHead>New Qty</TableHead>
                      <TableHead>Difference</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements
                      .filter(movement => movementFilter === 'all' || movementLabel(movement) === movementFilter)
                      .map(movement => {
                        const row = inventory.find(item => item.name === movement.item);
                        const newQuantity = row?.current || 0;
                        const previousQuantity = movement.type === 'in' ? newQuantity - Math.abs(movement.quantity) : newQuantity + Math.abs(movement.quantity);
                        return (
                          <TableRow key={movement.id}>
                            <TableCell><Badge variant="outline">{movementLabel(movement)}</Badge></TableCell>
                            <TableCell className="font-medium">{movement.item}</TableCell>
                            <TableCell>{Math.max(previousQuantity, 0)}</TableCell>
                            <TableCell>{newQuantity}</TableCell>
                            <TableCell className={movement.quantity >= 0 ? 'text-green-700' : 'text-red-700'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</TableCell>
                            <TableCell>Current user</TableCell>
                            <TableCell>{movement.date}</TableCell>
                            <TableCell>{movement.reason}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card className="bg-white border-gray-200">
            <CardContent className="p-5">
              <div className="space-y-4">
                {recentActivity.map(activity => (
                  <div key={`timeline-${activity.id}`} className="flex gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-blue-600" />
                    <div className="border-b border-gray-100 pb-4">
                      <p className="font-medium text-gray-900">{activity.title}</p>
                      <p className="text-sm text-gray-600">{activity.message}</p>
                      <p className="mt-1 text-xs text-gray-400">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reorders">
          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-gray-900">Reorder Suggestions</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">Items appear here automatically when stock is at or below reorder level.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedReorderItems(reorderableSuggestionItems.map(item => item.id))}
                    disabled={reorderableSuggestionItems.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedReorderItems([])}
                    disabled={selectedReorderItems.length === 0}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    onClick={submitReorderSuggestions}
                    disabled={selectedReorderItems.filter(productId => reorderableSuggestionItems.some(item => item.id === productId)).length === 0}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Submit Purchase Order ({selectedReorderItems.filter(productId => reorderableSuggestionItems.some(item => item.id === productId)).length})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              {reorderSuggestionItems.length === 0 ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  No reorder suggestions right now. All stock is above reorder level.
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    Quantities default to enough stock to reach twice the reorder level. The linked supplier on each item is used automatically; if selected items belong to different suppliers, the system creates one requested purchase order per supplier.
                  </div>
                  <div className="space-y-3">
                    {reorderSuggestionItems.map(item => {
                      const isSelected = selectedReorderItems.includes(item.id);
                      const hasLinkedSupplier = Boolean(item.supplierId);
                      const isPendingPo = item.reserved > 0;

                      return (
                        <div key={item.id} className={`rounded-md border p-4 ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_1fr_170px_auto] lg:items-center">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!canCreateReorder(item)}
                                onChange={() => toggleReorderItem(item.id)}
                              />
                              {isPendingPo ? 'Pending PO' : 'Include'}
                            </label>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-gray-900">{item.name}</p>
                                <Badge className={statusClassName(item.status)}>{item.status}</Badge>
                                {!hasLinkedSupplier && <Badge className="bg-red-500/15 text-red-700">No supplier linked</Badge>}
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                Supplier: {item.supplierName} | Current: {item.current} {item.uom} | Reorder level: {item.reorderLevel}
                                {item.reserved > 0 ? ` | Pending PO: ${item.reserved} ${item.uom}` : ''}
                              </p>
                            </div>
                            <Input
                              type="number"
                              min="1"
                              value={reorderQuantities[item.id] || ''}
                              onChange={(event) => setReorderQuantities(previous => ({ ...previous, [item.id]: event.target.value }))}
                              className="bg-white border-gray-200"
                              placeholder="Qty needed"
                            />
                            <Button
                              type="button"
                              className="bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500"
                              disabled={!hasLinkedSupplier || !canCreateReorder(item)}
                              onClick={() => {
                                setSelectedReorderItems([item.id]);
                                onCreateReorderPurchaseOrders([{ productId: item.id, quantity: Number(reorderQuantities[item.id] || Math.max(1, item.reorderLevel * 2 - item.current)) }]);
                              }}
                            >
                              {isPendingPo ? 'PO Pending' : 'Create PO'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="categories">
          <div className="space-y-4">
            {categoryTables.length === 0 ? (
              <Card className="bg-white border-gray-200">
                <CardContent className="p-5 text-sm text-gray-500">No product categories have been configured yet.</CardContent>
              </Card>
            ) : categoryTables.map(categoryTable => (
              <Card key={categoryTable.category} className="bg-white border-gray-200">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <CardTitle className="text-gray-900">{categoryTable.category}</CardTitle>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                      <Badge variant="outline">{categoryTable.itemCount} items</Badge>
                      <Badge variant="outline">{categoryTable.stock} stock</Badge>
                      <Badge variant="outline">{formatCurrency(categoryTable.value)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subcategory</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Total Stock</TableHead>
                          <TableHead>Inventory Value</TableHead>
                          <TableHead>Low Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryTable.subcategories.map(subcategory => (
                          <TableRow key={`${categoryTable.category}-${subcategory.name}`}>
                            <TableCell className="font-medium text-gray-900">{subcategory.name}</TableCell>
                            <TableCell>{subcategory.itemCount}</TableCell>
                            <TableCell>{subcategory.stock}</TableCell>
                            <TableCell>{formatCurrency(subcategory.value)}</TableCell>
                            <TableCell>
                              <Badge className={subcategory.lowStock > 0 ? 'bg-yellow-500/20 text-yellow-800 border-yellow-200' : 'bg-green-500/15 text-green-700 border-green-200'}>
                                {subcategory.lowStock}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
        </TabsContent>
      </Tabs>

      <Dialog open={isMoreFiltersOpen} onOpenChange={setIsMoreFiltersOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader><DialogTitle>More Filters</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(category => <SelectItem key={category} value={category}>{category === 'all' ? 'All Categories' : category}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Supplier</label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {supplierFilterOptions.map(supplier => <SelectItem key={supplier} value={supplier}>{supplier === 'all' ? 'All Suppliers' : supplier}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Stock Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map(status => <SelectItem key={status} value={status}>{status === 'all' ? 'All Statuses' : status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Search</label>
              <Input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Product, SKU, or supplier" className="bg-gray-100 border-gray-200" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => setIsMoreFiltersOpen(false)}>Apply Filters</Button>
            <Button variant="outline" onClick={() => {
              setInventorySearch('');
              setCategoryFilter('all');
              setSupplierFilter('all');
              setStatusFilter('all');
            }}>Reset</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionProduct} onOpenChange={(open) => !open && setActionProductId(null)}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader><DialogTitle>Product Actions</DialogTitle></DialogHeader>
          {actionProduct && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-gray-200 p-3">
                <ImageWithFallback src={actionProduct.image} alt={actionProduct.name} className="h-12 w-12 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{actionProduct.name}</p>
                  <p className="text-sm text-gray-500">{actionProduct.current} {actionProduct.uom} in stock</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="justify-start" onClick={() => openStockAdjustment(actionProduct.id, 'in', 'Quick stock in')}>
                  <Plus className="mr-2 h-4 w-4 text-orange-700" />
                  Stock In
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => openStockAdjustment(actionProduct.id, 'out', 'Quick stock out')}>
                  <Minus className="mr-2 h-4 w-4 text-red-700" />
                  Stock Out
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => openProductHistory(actionProduct.id)}>
                  <Eye className="mr-2 h-4 w-4 text-blue-700" />
                  View History
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => startProductReorder(actionProduct.id)}>
                  <ShoppingBag className="mr-2 h-4 w-4 text-green-700" />
                  Reorder
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAddItemOpen} onOpenChange={(open) => {
        if (!open && JSON.stringify(addItemForm) !== JSON.stringify(blankAddItemForm) && !window.confirm('Discard unsaved inventory item draft?')) return;
        setIsAddItemOpen(open);
      }}>
        <DialogContent className="max-h-[94vh] !w-[calc(100vw-2rem)] !max-w-7xl overflow-y-auto overflow-x-hidden bg-white border-gray-200 p-0">
          <DialogHeader className="border-b border-gray-200 px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">Add New Product</DialogTitle>
                <p className="mt-1 text-sm text-gray-500">Add a new product to your inventory</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddItemOpen(false)}>Cancel</Button>
                <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={handleAddItem}>Save Product</Button>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 p-6">
            {renderStructuredAddProductForm()}
            {imageError && <p className="text-sm text-red-600">{imageError}</p>}
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" onClick={resetAddItemForm}><RotateCcw className="mr-2 h-4 w-4" />Clear Draft</Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddItemOpen(false)}>Cancel</Button>
                <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={handleAddItem}>Save Product</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustmentType} onOpenChange={(open) => !open && setAdjustmentType(null)}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle>{adjustmentType === 'in' ? 'Stock In' : 'Stock Out'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={adjustmentForm.productId} onValueChange={(productId) => setAdjustmentForm({ ...adjustmentForm, productId })}>
              <SelectTrigger className="bg-gray-100 border-gray-200"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{products.map(product => <SelectItem key={product.id} value={product.id}>{product.name} ({product.stock} {product.uom})</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min="1" value={adjustmentForm.quantity} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, quantity: event.target.value })} className="bg-gray-100 border-gray-200" />
            <Input value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })} className="bg-gray-100 border-gray-200" />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleStockAdjustment}>Save</Button>
              <Button variant="outline" onClick={() => setAdjustmentType(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader><DialogTitle>Import Items from Excel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Use the product import template, then upload the completed `.xlsx` file here.</div>
            <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="bg-gray-100 border-gray-200" onChange={(event) => {
              setBulkImportFile(event.target.files?.[0] || null);
              setBulkImportMessage('');
              setBulkImportErrors([]);
            }} />
            {bulkImportMessage && <p className="text-sm text-green-600">{bulkImportMessage}</p>}
            {bulkImportErrors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {bulkImportErrors.map(error => <p key={`${error.row}-${error.message}`}>Row {error.row}: {error.message}</p>)}
              </div>
            )}
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleBulkImport} disabled={isBulkImporting}>{isBulkImporting ? 'Importing...' : 'Import Items'}</Button>
              <Button variant="outline" onClick={() => setIsBulkImportOpen(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader><DialogTitle>Alert Center</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {notifications.length === 0 ? <p className="text-sm text-gray-500">No live inventory notifications yet.</p> : notifications.map(notification => (
              <div key={notification.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{notification.title}</p>
                    <p className="text-sm text-gray-600">{notification.message}</p>
                  </div>
                  <span className="text-xs text-gray-400">{notification.time}</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingGrnRequest)}
        onOpenChange={(open) => {
          if (!open) {
            onCloseGrn();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-gray-200 bg-white p-0">
          <DialogHeader className="border-b border-gray-100 px-6 py-4">
            <DialogTitle>Goods Receiving Note</DialogTitle>
          </DialogHeader>
          {pendingGrnRequest && (
            <div className="space-y-5 px-6 py-5">
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3">
                <p className="font-semibold text-green-900">GRN linked to purchase order</p>
                <p className="mt-1 break-words text-sm text-green-700">
                  Reference: {'id' in pendingGrnRequest ? pendingGrnRequest.id : pendingGrnRequest.goodsReceivingNote || 'PO Draft'} | {pendingGrnRequest.supplierName} | {pendingGrnRequest.date}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">GRN Reference</label>
                  <Input
                    placeholder="Auto-generated if blank"
                    value={grnDetails.goodsReceivingNote}
                    onChange={(event) => setGrnDetails(previous => ({ ...previous, goodsReceivingNote: event.target.value }))}
                    className="bg-white border-gray-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Delivery Note</label>
                  <Input
                    placeholder="Supplier delivery note"
                    value={grnDetails.deliveryNote}
                    onChange={(event) => setGrnDetails(previous => ({ ...previous, deliveryNote: event.target.value }))}
                    className="bg-white border-gray-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Receiving Location</label>
                  <Input
                    value={grnDetails.receivingLocation}
                    readOnly
                    className="bg-gray-100 border-gray-200 text-gray-600"
                  />
                  <p className="text-xs text-gray-500">Receiving location is controlled by the store/warehouse setup.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Receiving Notes</label>
                  <Input
                    placeholder="Condition, batch notes, verifier comments"
                    value={grnDetails.receivingNotes}
                    onChange={(event) => setGrnDetails(previous => ({ ...previous, receivingNotes: event.target.value }))}
                    className="bg-white border-gray-200"
                  />
                </div>
              </div>
              <div className="rounded-md border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
                  Items to receive
                </div>
                {(pendingGrnRequest.orderItems || []).map(item => (
                  <div key={item.productId} className="space-y-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="mt-1 break-words text-xs text-gray-500">{item.sku || item.productId} | Supplier SKU: {item.supplierSku || '-'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Requested</p>
                        <p className="font-semibold text-gray-900">{item.requestedQuantity}</p>
                      </div>
                      <div className="rounded-md bg-orange-50 px-3 py-2">
                        <p className="text-xs text-orange-700">Pending</p>
                        <p className="font-semibold text-orange-700">{item.pendingQuantity ?? Math.max(0, item.requestedQuantity - item.deliveredQuantity)}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Good condition</label>
                        <Input
                          type="number"
                          min="0"
                          max={item.pendingQuantity ?? Math.max(0, item.requestedQuantity - item.deliveredQuantity)}
                          value={grnReceivedQuantities[item.productId] || ''}
                          onChange={(event) => setGrnReceivedQuantities(previous => ({ ...previous, [item.productId]: event.target.value }))}
                          className="h-9 bg-white border-gray-200 text-right"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Rejected</label>
                        <Input
                          type="number"
                          min="0"
                          max={item.pendingQuantity ?? Math.max(0, item.requestedQuantity - item.deliveredQuantity)}
                          value={grnRejectedQuantities[item.productId] || ''}
                          onChange={(event) => setGrnRejectedQuantities(previous => ({ ...previous, [item.productId]: event.target.value }))}
                          className="h-9 bg-white border-gray-200 text-right"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Rejection reason</label>
                      <Input
                        placeholder="Bad condition, expired..."
                        value={grnRejectionReasons[item.productId] || ''}
                        onChange={(event) => setGrnRejectionReasons(previous => ({ ...previous, [item.productId]: event.target.value }))}
                        className="h-9 bg-white border-gray-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:w-36"
                  onClick={onCloseGrn}
                >
                  {isPostingGrn ? 'Close' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  className="bg-green-600 text-white hover:bg-green-700 sm:w-64"
                  disabled={isPostingGrn}
                  onClick={async () => {
                  if (isPostingGrn) return;
                  const verifiedItems = (pendingGrnRequest.orderItems || []).map(item => {
                    const alreadyDelivered = item.deliveredQuantity || 0;
                    const pendingQuantity = item.pendingQuantity ?? Math.max(0, item.requestedQuantity - alreadyDelivered);
                    const rejectedQuantity = Math.max(0, Math.min(pendingQuantity, Number(grnRejectedQuantities[item.productId] || 0) || 0));
                    const maximumAccepted = Math.max(0, pendingQuantity - rejectedQuantity);
                    const receivedQuantity = Math.max(0, Math.min(maximumAccepted, Number(grnReceivedQuantities[item.productId] || maximumAccepted) || 0));
                    const deliveredQuantity = alreadyDelivered + receivedQuantity;
                    return {
                      ...item,
                      receivedQuantity,
                      rejectedQuantity,
                      rejectionReason: grnRejectionReasons[item.productId]?.trim() || undefined,
                      deliveredQuantity,
                      pendingQuantity: Math.max(0, item.requestedQuantity - deliveredQuantity)
                    };
                  });
                  if (verifiedItems.length === 0) {
                    toast.error('No GRN items found', {
                      description: 'This purchase order has no line items available to receive.'
                    });
                    return;
                  }
                  if (!verifiedItems.some(item => (item.receivedQuantity || 0) > 0 || (item.rejectedQuantity || 0) > 0)) {
                    toast.error('Enter received quantity', {
                      description: 'At least one item must have an accepted or rejected quantity greater than zero.'
                    });
                    return;
                  }
                  setIsPostingGrn(true);
                  try {
                    const quantityPending = verifiedItems.reduce((sum, item) => sum + item.pendingQuantity, 0);
                    await onReceivedAndVerified({
                      ...pendingGrnRequest,
                      status: quantityPending > 0 ? 'pending' : 'delivered',
                      goodsReceivingNote: grnDetails.goodsReceivingNote.trim() || pendingGrnRequest.goodsReceivingNote || `GRN-${Date.now()}`,
                      deliveryNote: grnDetails.deliveryNote.trim() || pendingGrnRequest.deliveryNote,
                      receivingLocation: grnDetails.receivingLocation.trim() || 'Main Store',
                      receivingNotes: [
                        grnDetails.receivingNotes.trim(),
                        ...verifiedItems
                          .filter(item => (item.rejectedQuantity || 0) > 0)
                          .map(item => `${item.productName}: rejected ${item.rejectedQuantity}${item.rejectionReason ? ` (${item.rejectionReason})` : ''}`)
                      ].filter(Boolean).join(' | ') || undefined,
                      quantityDelivered: verifiedItems.reduce((sum, item) => sum + item.deliveredQuantity, 0),
                      quantityPending,
                      orderItems: verifiedItems
                    });
                    pushNotification(
                      'Stock received',
                      verifiedItems.filter(item => (item.receivedQuantity || 0) > 0).map(item => `${item.productName} +${item.receivedQuantity}`).join(', '),
                      'green'
                    );
                  } catch (error) {
                    toast.error('GRN could not be posted', {
                      description: error instanceof Error ? error.message : 'Receive and verify failed.'
                    });
                  } finally {
                    setIsPostingGrn(false);
                  }
                }}
                >
                  {isPostingGrn ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Posting GRN</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck className="h-4 w-4" />
                      <span>Receive and Verify</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProductId(null)}>
        <DialogContent className="bg-white border-gray-200 max-w-2xl">
          <DialogHeader><DialogTitle>Product History</DialogTitle></DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-gray-200 p-3">
                <ImageWithFallback src={selectedProduct.image} alt={selectedProduct.name} className="h-14 w-14 rounded-md object-cover" />
                <div>
                  <p className="font-semibold text-gray-900">{selectedProduct.name}</p>
                  <p className="text-sm text-gray-500">{selectedProduct.sku} - {selectedProduct.supplierName}</p>
                </div>
                <Badge className={statusClassName(selectedProduct.status)}>{selectedProduct.status}</Badge>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-3">
                {stockMovements.filter(movement => movement.item === selectedProduct.name).length === 0 ? (
                  <p className="text-sm text-gray-500">No movements recorded for this product yet.</p>
                ) : stockMovements.filter(movement => movement.item === selectedProduct.name).map(movement => (
                  <div key={movement.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{movementLabel(movement)}</p>
                      <span className={movement.quantity >= 0 ? 'text-green-700' : 'text-red-700'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</span>
                    </div>
                    <p className="text-sm text-gray-600">{movement.reason}</p>
                    <p className="mt-1 text-xs text-gray-400">{movement.date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
