# complete_import.py
import requests
import pandas as pd
import uuid

# ============================================
# STEP 1: Create Excel file with unique barcodes
# ============================================
print("=" * 50)
print("STEP 1: Creating Excel file")
print("=" * 50)

products = []
for i in range(1, 4):
    products.append({
        'name': f'Test Product {i}',
        'sku': '',
        'barcode': f'BAR-{uuid.uuid4().hex[:10].upper()}',
        'category': 'Electronics',
        'supplier': 'Demo Supplier',
        'cost_price': 5000 * i,
        'retail_price': 10000 * i,
        'wholesale_price': 8000 * i,
        'stock_quantity': 100,
        'reorder_level': 10,
        'unit': 'piece',
        'tax_rate': 16,
        'description': f'Description for product {i}'
    })

df = pd.DataFrame(products)
df.to_excel('import_file.xlsx', index=False)
print(f"✅ Created import_file.xlsx with {len(products)} products")

# ============================================
# STEP 2: Login to get token
# ============================================
print("\n" + "=" * 50)
print("STEP 2: Getting authentication token")
print("=" * 50)

response = requests.post('http://127.0.0.1:8000/api/token/', 
    json={'username': 'Nelly', 'password': 'Kerubo@20'})

if response.status_code != 200:
    print(f"❌ Login failed: {response.status_code}")
    print(response.text)
    exit()

token = response.json()['access']
print("✅ Token obtained")

# ============================================
# STEP 3: Upload and import
# ============================================
print("\n" + "=" * 50)
print("STEP 3: Importing products")
print("=" * 50)

headers = {'Authorization': f'Bearer {token}'}

with open('import_file.xlsx', 'rb') as f:
    response = requests.post(
        'http://127.0.0.1:8000/api/products/bulk-import/',
        headers=headers,
        files={'file': f}
    )

print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

if response.status_code == 200:
    data = response.json()
    if data.get('created', 0) > 0:
        print(f"\n✅ SUCCESS! Created {data['created']} products")
    elif data.get('errors'):
        print(f"\n⚠️ Errors occurred: {data['errors']}")
    else:
        print(f"\n⚠️ No products created. Response: {data}")
else:
    print(f"\n❌ Import failed: {response.text}")