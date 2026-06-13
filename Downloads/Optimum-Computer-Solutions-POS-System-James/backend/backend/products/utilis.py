# products/utils.py
import barcode
from barcode.writer import ImageWriter
from io import BytesIO
from django.core.files import File
import random
import string

def generate_barcode_ean13(product_id):
    """
    Generate EAN-13 barcode for product
    """
    # Create a 12-digit number (EAN-13 uses 12 digits + checksum)
    base = str(product_id).zfill(12)
    
    # Calculate checksum
    def calculate_checksum(code):
        total = 0
        for i, digit in enumerate(code):
            if i % 2 == 0:
                total += int(digit) * 1
            else:
                total += int(digit) * 3
        checksum = (10 - (total % 10)) % 10
        return str(checksum)
    
    full_code = base + calculate_checksum(base)
    
    # Generate barcode image
    buffer = BytesIO()
    ean = barcode.get('ean13', full_code, writer=ImageWriter())
    ean.write(buffer)
    
    return buffer, full_code


def generate_sku(category_code='GEN'):
    """
    Generate unique SKU for product
    Format: CAT-XXXXXX (e.g., ELEC-000123)
    """
    from .models import Product
    
    last_product = Product.objects.order_by('-id').first()
    if last_product and last_product.sku:
        try:
            last_num = int(last_product.sku.split('-')[-1])
            new_num = last_num + 1
        except (IndexError, ValueError):
            new_num = 1
    else:
        new_num = 1
    
    return f"{category_code}-{new_num:06d}"