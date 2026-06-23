# export.py
import requests

# Login
print("Logging in...")
r = requests.post('http://127.0.0.1:8000/api/token/', 
    json={'username': 'Nelly', 'password': 'Kerubo@20'})

if r.status_code != 200:
    print(f"❌ Login failed: {r.status_code}")
    exit()

token = r.json()['access']
print("✅ Logged in")

# Export products
print("Exporting products...")
headers = {'Authorization': f'Bearer {token}'}
r = requests.get('http://127.0.0.1:8000/api/products/export/', headers=headers)

if r.status_code == 200:
    with open('products_export.xlsx', 'wb') as f:
        f.write(r.content)
    print(f"✅ Exported {len(r.content)} bytes to products_export.xlsx")
    print("📁 File saved: products_export.xlsx")
else:
    print(f"❌ Export failed: {r.status_code}")