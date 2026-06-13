from decimal import Decimal

from django.core.management.base import BaseCommand

from inventory.models import InventoryAlert, StockMovement, StoreStock
from products.models import Product
from users.models import User


class Command(BaseCommand):
    help = 'Backfill inventory admin records from existing product stock.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='User id to use as recorded_by for opening stock movements.',
        )

    def handle(self, *args, **options):
        user = self._get_user(options.get('user_id'))
        products = Product.objects.filter(is_active=True)

        store_stocks = 0
        movements = 0
        alerts = 0

        for product in products:
            StoreStock.objects.update_or_create(
                store='Main Warehouse',
                product=product,
                defaults={
                    'quantity': product.stock_quantity,
                    'reorder_level': product.reorder_level,
                },
            )
            store_stocks += 1

            current_stock = Decimal(str(product.stock_quantity or 0))
            if user and current_stock > 0 and not StockMovement.objects.filter(
                product=product,
                reference_id=f'product-{product.pk}',
                reference_type='Product',
                reason='Opening stock from product backfill',
            ).exists():
                StockMovement.objects.create(
                    product=product,
                    movement_type='purchase',
                    quantity=current_stock,
                    stock_before=Decimal('0'),
                    stock_after=current_stock,
                    unit_cost=product.cost_price,
                    reference_id=f'product-{product.pk}',
                    reference_type='Product',
                    reason='Opening stock from product backfill',
                    recorded_by=user,
                    location='Main Warehouse',
                )
                movements += 1

            if product.reorder_level > 0 and product.stock_quantity <= product.reorder_level:
                alert_type = 'out_of_stock' if product.stock_quantity == 0 else 'low_stock'
                _, created = InventoryAlert.objects.get_or_create(
                    alert_type=alert_type,
                    product=product,
                    store='Main Warehouse',
                    is_resolved=False,
                    defaults={
                        'priority': 'critical' if product.stock_quantity == 0 else 'high',
                        'message': f'{product.name} stock is {product.stock_quantity}; reorder level is {product.reorder_level}.',
                        'suggested_action': 'Create a purchase order or adjust stock.',
                    },
                )
                if created:
                    alerts += 1

        if not user:
            self.stdout.write(self.style.WARNING(
                'No user found, so opening stock movements were skipped. '
                'Run again with --user-id after creating a user if you need movement history.'
            ))

        self.stdout.write(self.style.SUCCESS(
            f'Synced {store_stocks} store stock rows, created {movements} opening movements, created {alerts} alerts.'
        ))

    def _get_user(self, user_id):
        if user_id:
            return User.objects.filter(pk=user_id).first()
        return (
            User.objects.filter(is_superuser=True).first()
            or User.objects.filter(is_staff=True).first()
            or User.objects.first()
        )
