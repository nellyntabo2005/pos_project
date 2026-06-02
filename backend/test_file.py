# create_proper_file.py
import pandas as pd
import uuid

# Create 3 products with UNIQUE barcodes
products = []

for i in range(1, 4):
    products.append({
        'name': f'Product {i}',
        'sku': '',
        'barcode': f'BAR-{uuid.uuid4().hex[:10].upper()}',  # ← UNIQUE barcode
        'category': 'Electronics',
        'supplier': 'Demo Supplier',
        'cost_price': 10000 * i,
        'retail_price': 20000 * i,
        'wholesale_price': 18000 * i,
        'stock_quantity': 100,
        'reorder_level': 10,
        'unit': 'piece',
        'tax_rate': 16,
        'description': f'Description for product {i}'
    })

df = pd.DataFrame(products)
df.to_excel('my_products.xlsx', index=False)

print("=" * 50)
print("✅ FILE CREATED")
print("=" * 50)
print(f"Products: {len(products)}")
print("\nBarcodes generated:")
for p in products:
    print(f"  {p['name']}: {p['barcode']}")