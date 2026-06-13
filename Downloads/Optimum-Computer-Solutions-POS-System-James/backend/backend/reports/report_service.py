# reports/report_service.py
from django.db.models import Sum, Count, Avg, F, Q
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
import pandas as pd
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, inch
from reportlab.pdfgen import canvas
import matplotlib.pyplot as plt
import seaborn as sns
from django.http import HttpResponse

from sales.models import Sale, SaleItem, Payment
from products.models import Product, Category
from customers.models import Customer
from returns.models import Return
from users.models import User


class ReportService:
    """Service class for generating all reports"""
    
    @staticmethod
    def get_date_range(period, start_date=None, end_date=None):
        """Get date range based on period or custom dates"""
        now = timezone.now()
        
        if start_date and end_date:
            return start_date, end_date
        
        if period == 'today':
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == 'yesterday':
            start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == 'this_week':
            start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0)
            end = now
        elif period == 'last_week':
            start = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0)
            end = (now - timedelta(days=now.weekday() + 1)).replace(hour=0, minute=0, second=0)
        elif period == 'this_month':
            start = now.replace(day=1, hour=0, minute=0, second=0)
            end = now
        elif period == 'last_month':
            last_month = now.replace(day=1) - timedelta(days=1)
            start = last_month.replace(day=1, hour=0, minute=0, second=0)
            end = last_month.replace(hour=23, minute=59, second=59)
        elif period == 'this_year':
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0)
            end = now
        else:
            start = now - timedelta(days=30)
            end = now
        
        return start, end
    
    @staticmethod
    def generate_sales_report(start_date, end_date, group_by='day', include_details=True):
        """
        Generate comprehensive sales report
        
        Args:
            start_date: Start date for report
            end_date: End date for report
            group_by: day, week, month, category, product
            include_details: Include detailed breakdown
        
        Returns:
            Dictionary with report data
        """
        sales = Sale.objects.filter(
            sale_date__range=(start_date, end_date),
            status='completed'
        )
        
        # Summary statistics
        total_sales = sales.aggregate(
            total=Sum('total'),
            count=Count('id'),
            avg=Avg('total'),
            total_tax=Sum('tax_amount'),
            total_discount=Sum('discount_amount')
        )
        
        report = {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'days': (end_date - start_date).days
            },
            'summary': {
                'total_revenue': float(total_sales['total'] or 0),
                'transaction_count': total_sales['count'] or 0,
                'average_transaction': float(total_sales['avg'] or 0),
                'total_tax': float(total_sales['total_tax'] or 0),
                'total_discount': float(total_sales['total_discount'] or 0),
                'net_sales': float((total_sales['total'] or 0) - (total_sales['total_tax'] or 0))
            }
        }
        
        # Group by time period
        if group_by == 'day':
            report['breakdown'] = sales.extra(
                {'date': "DATE(sale_date)"}
            ).values('date').annotate(
                total=Sum('total'),
                count=Count('id'),
                average=Avg('total')
            ).order_by('date')
            
            # Convert to list of dicts with proper formatting
            report['breakdown'] = [
                {
                    'date': item['date'].isoformat() if item['date'] else None,
                    'total': float(item['total'] or 0),
                    'count': item['count'],
                    'average': float(item['average'] or 0)
                }
                for item in report['breakdown']
            ]
        
        elif group_by == 'week':
            report['breakdown'] = sales.extra(
                {'week': "YEARWEEK(sale_date)"}
            ).values('week').annotate(
                total=Sum('total'),
                count=Count('id'),
                start_date=min('sale_date'),
                end_date=max('sale_date')
            ).order_by('week')
            
            report['breakdown'] = [
                {
                    'week': item['week'],
                    'start_date': item['start_date'].isoformat() if item['start_date'] else None,
                    'end_date': item['end_date'].isoformat() if item['end_date'] else None,
                    'total': float(item['total'] or 0),
                    'count': item['count']
                }
                for item in report['breakdown']
            ]
        
        elif group_by == 'month':
            report['breakdown'] = sales.extra(
                {'month': "DATE_FORMAT(sale_date, '%%Y-%%m')"}
            ).values('month').annotate(
                total=Sum('total'),
                count=Count('id')
            ).order_by('month')
            
            report['breakdown'] = [
                {
                    'month': item['month'],
                    'total': float(item['total'] or 0),
                    'count': item['count']
                }
                for item in report['breakdown']
            ]
        
        # Payment method breakdown
        payment_methods = Payment.objects.filter(
            sale__in=sales
        ).values('payment_method').annotate(
            total=Sum('amount'),
            count=Count('id')
        )
        
        report['payment_methods'] = [
            {
                'method': item['payment_method'],
                'total': float(item['total'] or 0),
                'count': item['count'],
                'percentage': float((item['total'] or 0) / (total_sales['total'] or 1) * 100)
            }
            for item in payment_methods
        ]
        
        # Include detailed sales if requested
        if include_details:
            report['detailed_sales'] = []
            for sale in sales[:100]:  # Limit to 100 for performance
                report['detailed_sales'].append({
                    'sale_id': sale.sale_id,
                    'date': sale.sale_date.isoformat(),
                    'customer': sale.customer.name if sale.customer else 'Walk-in',
                    'cashier': sale.cashier.get_full_name() or sale.cashier.username,
                    'total': float(sale.total),
                    'items_count': sale.items.count(),
                    'payment_status': sale.payment_status
                })
        
        # Hourly sales distribution
        hourly_sales = sales.extra(
            {'hour': "HOUR(sale_date)"}
        ).values('hour').annotate(
            total=Sum('total'),
            count=Count('id')
        ).order_by('hour')
        
        report['hourly_distribution'] = [
            {
                'hour': item['hour'],
                'total': float(item['total'] or 0),
                'count': item['count']
            }
            for item in hourly_sales
        ]
        
        return report
    
    @staticmethod
    def generate_top_products_report(start_date, end_date, limit=20):
        """Generate top selling products report"""
        
        sales_items = SaleItem.objects.filter(
            sale__sale_date__range=(start_date, end_date),
            sale__status='completed'
        )
        
        # Aggregate by product
        top_products = sales_items.values(
            'product_id', 'product_name', 'product_sku'
        ).annotate(
            total_quantity=Sum('quantity'),
            total_revenue=Sum('total'),
            transaction_count=Count('sale', distinct=True),
            average_price=Avg('unit_price')
        ).order_by('-total_revenue')[:limit]
        
        # Get profit margin for each product
        for product in top_products:
            try:
                product_obj = Product.objects.get(id=product['product_id'])
                product['profit_margin'] = float(product_obj.profit_margin)
                product['cost_value'] = float(product_obj.cost_price * product['total_quantity'])
                product['gross_profit'] = float(product['total_revenue'] - product['cost_value'])
            except Product.DoesNotExist:
                product['profit_margin'] = 0
                product['cost_value'] = 0
                product['gross_profit'] = 0
        
        return {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'top_products': [
                {
                    'rank': idx + 1,
                    'product_id': item['product_id'],
                    'name': item['product_name'],
                    'sku': item['product_sku'],
                    'quantity_sold': float(item['total_quantity']),
                    'revenue': float(item['total_revenue']),
                    'transactions': item['transaction_count'],
                    'average_price': float(item['average_price']),
                    'profit_margin': item['profit_margin'],
                    'gross_profit': item['gross_profit']
                }
                for idx, item in enumerate(top_products)
            ]
        }
    
    @staticmethod
    def generate_inventory_report():
        """Generate current inventory status report"""
        
        products = Product.objects.filter(is_active=True)
        
        total_products = products.count()
        total_value = products.aggregate(
            total=Sum(F('stock_quantity') * F('cost_price'))
        )['total'] or Decimal('0')
        
        total_retail_value = products.aggregate(
            total=Sum(F('stock_quantity') * F('retail_price'))
        )['total'] or Decimal('0')
        
        # Products by category
        category_breakdown = Category.objects.annotate(
            product_count=Count('products'),
            stock_value=Sum(F('products__stock_quantity') * F('products__cost_price')),
            stock_quantity=Sum('products__stock_quantity')
        ).filter(product_count__gt=0)
        
        # Low stock and out of stock
        low_stock = products.filter(
            stock_quantity__lte=F('reorder_level'),
            reorder_level__gt=0
        ).count()
        
        out_of_stock = products.filter(stock_quantity=0).count()
        
        # Top value products
        high_value = products.order_by('-stock_value')[:10]
        
        return {
            'summary': {
                'total_products': total_products,
                'total_stock_value': float(total_value),
                'total_retail_value': float(total_retail_value),
                'potential_profit': float(total_retail_value - total_value),
                'low_stock_items': low_stock,
                'out_of_stock_items': out_of_stock,
                'average_stock_value': float(total_value / total_products) if total_products > 0 else 0
            },
            'category_breakdown': [
                {
                    'category': cat.name,
                    'product_count': cat.product_count,
                    'stock_value': float(cat.stock_value or 0),
                    'stock_quantity': float(cat.stock_quantity or 0)
                }
                for cat in category_breakdown
            ],
            'high_value_products': [
                {
                    'name': p.name,
                    'sku': p.sku,
                    'stock': float(p.stock_quantity),
                    'value': float(p.stock_value)
                }
                for p in high_value
            ]
        }
    
    @staticmethod
    def generate_customer_report(start_date, end_date):
        """Generate customer analytics report"""
        
        customers = Customer.objects.filter(is_active=True)
        
        # Customer segments by spending
        high_value = customers.filter(total_spent__gte=50000).count()
        medium_value = customers.filter(total_spent__gte=10000, total_spent__lt=50000).count()
        low_value = customers.filter(total_spent__lt=10000, total_spent__gt=0).count()
        inactive = customers.filter(total_spent=0).count()
        
        # New customers in period
        new_customers = Customer.objects.filter(
            created_at__range=(start_date, end_date)
        ).count()
        
        # Repeat customers (more than 1 purchase)
        repeat_customers = customers.annotate(
            purchase_count=Count('sales')
        ).filter(purchase_count__gt=1).count()
        
        # Top customers
        top_customers = customers.order_by('-total_spent')[:10]
        
        # Loyalty points summary
        total_points = customers.aggregate(total=Sum('loyalty_points'))['total'] or 0
        points_redeemed = Return.objects.filter(
            processed_at__range=(start_date, end_date)
        ).aggregate(total=Sum('loyalty_points_redeemed'))['total'] or 0
        
        return {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_customers': customers.count(),
                'new_customers': new_customers,
                'repeat_customers': repeat_customers,
                'repeat_rate': (repeat_customers / customers.count() * 100) if customers.count() > 0 else 0
            },
            'segments': {
                'high_value': high_value,
                'medium_value': medium_value,
                'low_value': low_value,
                'inactive': inactive
            },
            'loyalty': {
                'total_points_outstanding': float(total_points),
                'points_redeemed_period': float(points_redeemed),
                'points_value': float(total_points)  # 1 point = 1 KES
            },
            'top_customers': [
                {
                    'name': c.name,
                    'phone': c.phone,
                    'total_spent': float(c.total_spent),
                    'loyalty_points': c.loyalty_points,
                    'last_purchase': c.last_purchase_date.isoformat() if c.last_purchase_date else None
                }
                for c in top_customers
            ]
        }
    
    @staticmethod
    def generate_cashier_performance_report(start_date, end_date):
        """Generate cashier performance report"""
        
        cashiers = User.objects.filter(role='cashier', is_active=True)
        
        performance = []
        
        for cashier in cashiers:
            sales = Sale.objects.filter(
                cashier=cashier,
                sale_date__range=(start_date, end_date),
                status='completed'
            )
            
            total_sales = sales.aggregate(total=Sum('total'))['total'] or 0
            transaction_count = sales.count()
            
            # Commission earned
            commission = cashier.calculate_commission(total_sales) if hasattr(cashier, 'calculate_commission') else 0
            
            # Average transaction
            avg_transaction = total_sales / transaction_count if transaction_count > 0 else 0
            
            # Returns processed
            returns_processed = Return.objects.filter(
                processed_by=cashier,
                processed_at__range=(start_date, end_date)
            ).count()
            
            performance.append({
                'cashier_id': cashier.id,
                'name': cashier.get_full_name() or cashier.username,
                'total_sales': float(total_sales),
                'transaction_count': transaction_count,
                'average_transaction': float(avg_transaction),
                'commission_earned': float(commission),
                'returns_processed': returns_processed,
                'products_sold': SaleItem.objects.filter(
                    sale__in=sales
                ).aggregate(total=Sum('quantity'))['total'] or 0
            })
        
        # Sort by total sales
        performance.sort(key=lambda x: x['total_sales'], reverse=True)
        
        # Add rank
        for idx, performer in enumerate(performance):
            performer['rank'] = idx + 1
        
        return {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_cashiers': len(performance),
                'total_sales_all': sum(p['total_sales'] for p in performance),
                'total_transactions': sum(p['transaction_count'] for p in performance),
                'average_per_cashier': sum(p['total_sales'] for p in performance) / len(performance) if performance else 0
            },
            'performance': performance
        }
    
    @staticmethod
    def generate_pdf_report(data, title, company_name="Your Store"):
        """Generate PDF report from data"""
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        
        story = []
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            alignment=1,  # Center
            spaceAfter=20
        )
        story.append(Paragraph(title, title_style))
        
        # Company info
        story.append(Paragraph(company_name, styles['Normal']))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
        story.append(Spacer(1, 10))
        
        # Summary section
        if 'summary' in data:
            story.append(Paragraph("Summary", styles['Heading2']))
            
            summary_data = [[key.replace('_', ' ').title(), f"{value:,.2f}" if isinstance(value, (int, float)) else str(value)]
                           for key, value in data['summary'].items()]
            
            summary_table = Table(summary_data, colWidths=[100, 100])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(summary_table)
            story.append(Spacer(1, 20))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        return buffer
    
    @staticmethod
    def generate_excel_report(data, sheet_name="Report"):
        """Generate Excel report from data"""
        
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Summary sheet
            if 'summary' in data:
                summary_df = pd.DataFrame([data['summary']])
                summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Breakdown sheet
            if 'breakdown' in data:
                breakdown_df = pd.DataFrame(data['breakdown'])
                breakdown_df.to_excel(writer, sheet_name='Breakdown', index=False)
            
            # Top products
            if 'top_products' in data:
                top_products_df = pd.DataFrame(data['top_products'])
                top_products_df.to_excel(writer, sheet_name='Top Products', index=False)
            
            # Add chart (if needed)
            workbook = writer.book
            worksheet = writer.sheets['Summary']
            
            # Add simple bar chart for revenue
            if 'breakdown' in data and data['breakdown']:
                chart = workbook.add_chart({'type': 'column'})
                
                # Get data range
                rows = len(data['breakdown']) + 1
                chart.add_series({
                    'name': 'Daily Revenue',
                    'categories': [sheet_name, 1, 0, rows, 0],
                    'values': [sheet_name, 1, 1, rows, 1],
                })
                
                worksheet.insert_chart('H2', chart)
        
        output.seek(0)
        return output
    
    @staticmethod
    def generate_tax_report(start_date, end_date):
        """Generate tax report for KRA filing"""
        
        sales = Sale.objects.filter(
            sale_date__range=(start_date, end_date),
            status='completed'
        )
        
        # VAT breakdown by rate
        vat_16 = sales.filter(tax_rate=16).aggregate(
            total=Sum('total'),
            tax=Sum('tax_amount')
        )
        
        vat_8 = sales.filter(tax_rate=8).aggregate(
            total=Sum('total'),
            tax=Sum('tax_amount')
        )
        
        vat_0 = sales.filter(tax_rate=0).aggregate(
            total=Sum('total'),
            tax=Sum('tax_amount')
        )
        
        # Exempt sales (for non-VAT items)
        exempt_sales = sales.filter(tax_rate=0).aggregate(total=Sum('total'))['total'] or 0
        
        # Returns in period (negative VAT)
        returns = Return.objects.filter(
            processed_at__range=(start_date, end_date),
            status='completed'
        )
        
        return_vat = returns.aggregate(total=Sum('net_refund'))['total'] or 0
        
        return {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_sales_vat_16': float(vat_16['total'] or 0),
                'vat_16_collected': float(vat_16['tax'] or 0),
                'total_sales_vat_8': float(vat_8['total'] or 0),
                'vat_8_collected': float(vat_8['tax'] or 0),
                'total_sales_vat_0': float(vat_0['total'] or 0),
                'exempt_sales': float(exempt_sales),
                'returns_adjustment': float(return_vat),
                'net_vat_payable': float((vat_16['tax'] or 0) + (vat_8['tax'] or 0) - return_vat)
            },
            'transaction_summary': {
                'total_invoices': sales.count(),
                'total_credit_notes': returns.count(),
                'total_taxable_value': float((vat_16['total'] or 0) + (vat_8['total'] or 0)),
                'total_tax': float((vat_16['tax'] or 0) + (vat_8['tax'] or 0))
            }
        }