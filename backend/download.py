# download_template_fixed.py
import requests

# Your login credentials
username = "Nelly"
password = "Kerubo@20"

print("=" * 50)
print("STEP 1: Getting authentication token...")
print("=" * 50)

# Get token
response = requests.post('http://127.0.0.1:8000/api/token/', 
    json={'username': username, 'password': password})

if response.status_code != 200:
    print(f"❌ Login failed! Status: {response.status_code}")
    exit()

token = response.json()['access']
print(f"✅ Token obtained successfully!")

print("\n" + "=" * 50)
print("STEP 2: Trying different URLs...")
print("=" * 50)

# List of possible URLs to try
urls_to_try = [
    'http://127.0.0.1:8000/api/products/download-template/',
    'http://127.0.0.1:8000/api/products/template/download/',
    'http://127.0.0.1:8000/api/products/import-template/',
    'http://127.0.0.1:8000/api/products/export/template/',
    'http://127.0.0.1:8000/api/products/bulk/template/',
]

headers = {'Authorization': f'Bearer {token}'}

for url in urls_to_try:
    print(f"\nTrying: {url}")
    response = requests.get(url, headers=headers)
    print(f"  Status: {response.status_code}")
    
    if response.status_code == 200:
        print(f"  ✅ WORKING! Downloading...")
        with open('product_template.xlsx', 'wb') as f:
            f.write(response.content)
        print(f"  ✅ File saved: product_template.xlsx")
        break
    else:
        print(f"  ❌ Failed")

print("\n" + "=" * 50)
print("COMPLETE!")
print("=" * 50)