import uuid

import pandas as pd


def create_product_file(path='my_products.xlsx'):
    products = []

    for i in range(1, 4):
        products.append({
            'name': f'Product {i}',
            'sku': '',
            'barcode': f'BAR-{uuid.uuid4().hex[:10].upper()}',
            'category': 'Electronics',
            'supplier': 'Demo Supplier',
            'cost_price': 10000 * i,
            'retail_price': 20000 * i,
            'wholesale_price': 18000 * i,
            'stock_quantity': 100,
            'reorder_level': 10,
            'unit': 'piece',
            'tax_rate': 16,
            'description': f'Description for product {i}',
        })

    pd.DataFrame(products).to_excel(path, index=False)
    return products


if __name__ == '__main__':
    products = create_product_file()
    print("=" * 50)
    print("FILE CREATED")
    print("=" * 50)
    print(f"Products: {len(products)}")
    print("\nBarcodes generated:")
    for product in products:
        print(f"  {product['name']}: {product['barcode']}")
