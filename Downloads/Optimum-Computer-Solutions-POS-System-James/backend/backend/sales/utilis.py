# sales/utils.py
from decimal import Decimal
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
import io

def generate_pdf_receipt(sale):
    """
    Generate PDF receipt for a sale
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(80*mm, A4[1]), topMargin=5*mm, bottomMargin=5*mm)
    
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=12,
        alignment=1,  # Center
        spaceAfter=10
    )
    
    story.append(Paragraph("YOUR STORE NAME", title_style))
    story.append(Paragraph("Your Address Line 1", styles['Normal']))
    story.append(Paragraph("Tel: 0712345678", styles['Normal']))
    story.append(Spacer(1, 5*mm))
    
    # Sale details
    story.append(Paragraph(f"Invoice: {sale.sale_id}", styles['Normal']))
    story.append(Paragraph(f"Date: {sale.sale_date.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Paragraph(f"Cashier: {sale.cashier.get_full_name() or sale.cashier.username}", styles['Normal']))
    story.append(Paragraph(f"Customer: {sale.customer.name if sale.customer else 'Walk-in Customer'}", styles['Normal']))
    story.append(Spacer(1, 5*mm))
    
    # Items table
    data = [['Item', 'Qty', 'Price', 'Total']]
    for item in sale.items.all():
        data.append([
            item.product_name[:20],
            str(item.quantity),
            f"{item.unit_price:.2f}",
            f"{item.total:.2f}"
        ])
    
    table = Table(data, colWidths=[40*mm, 10*mm, 15*mm, 15*mm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
    ]))
    
    story.append(table)
    story.append(Spacer(1, 5*mm))
    
    # Totals
    story.append(Paragraph(f"Subtotal: KES {sale.subtotal:.2f}", styles['Normal']))
    if sale.discount_amount > 0:
        story.append(Paragraph(f"Discount: KES {sale.discount_amount:.2f}", styles['Normal']))
    if sale.tax_amount > 0:
        story.append(Paragraph(f"Tax (16%): KES {sale.tax_amount:.2f}", styles['Normal']))
    story.append(Paragraph(f"TOTAL: KES {sale.total:.2f}", styles['Heading4']))
    story.append(Paragraph(f"Amount Paid: KES {sale.amount_paid:.2f}", styles['Normal']))
    if sale.change_due > 0:
        story.append(Paragraph(f"Change Due: KES {sale.change_due:.2f}", styles['Normal']))
    
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("THANK YOU FOR SHOPPING WITH US!", styles['Normal']))
    
    doc.build(story)
    buffer.seek(0)
    
    return buffer