from django.core.management.base import BaseCommand

from inventory.models import InventoryAlert
from notifications.models import Notification, NotificationRule, NotificationTemplate
from notifications.utils import create_role_notifications, get_default_in_app_channel


class Command(BaseCommand):
    help = 'Create default notification setup and backfill current admin notifications.'

    def handle(self, *args, **options):
        channel = get_default_in_app_channel()

        templates_created = 0
        rules_created = 0
        notifications_created = 0

        template_specs = [
            {
                'category': 'low_stock',
                'name': 'Low Stock In-App Alert',
                'subject_template': 'Low stock warning',
                'body_template': '{{ product_name }} has {{ stock_quantity }} remaining. Reorder level is {{ reorder_level }}.',
                'available_variables': ['product_name', 'stock_quantity', 'reorder_level'],
            },
            {
                'category': 'sale',
                'name': 'High Value Sale In-App Alert',
                'subject_template': 'High value sale completed',
                'body_template': 'Sale {{ sale_id }} was completed for {{ sale_total }}.',
                'available_variables': ['sale_id', 'sale_total', 'customer_name', 'cashier_name'],
            },
            {
                'category': 'system_alert',
                'name': 'System In-App Alert',
                'subject_template': 'System alert',
                'body_template': '{{ message }}',
                'available_variables': ['message'],
            },
        ]

        templates = {}
        for spec in template_specs:
            template, created = NotificationTemplate.objects.get_or_create(
                category=spec['category'],
                channel=channel,
                defaults={
                    'name': spec['name'],
                    'subject_template': spec['subject_template'],
                    'body_template': spec['body_template'],
                    'available_variables': spec['available_variables'],
                    'is_active': True,
                },
            )
            templates[spec['category']] = template
            templates_created += int(created)

        rule_specs = [
            {
                'name': 'Notify managers when stock is low',
                'event_type': 'low_stock',
                'template': templates['low_stock'],
                'recipient_roles': ['super_admin', 'admin', 'manager', 'inventory_clerk'],
                'conditions': {},
            },
            {
                'name': 'Notify managers when stock is out',
                'event_type': 'out_of_stock',
                'template': templates['low_stock'],
                'recipient_roles': ['super_admin', 'admin', 'manager', 'inventory_clerk'],
                'conditions': {},
            },
            {
                'name': 'Notify managers for high value sales',
                'event_type': 'high_value_sale',
                'template': templates['sale'],
                'recipient_roles': ['super_admin', 'admin', 'manager'],
                'conditions': {'threshold': 50000},
            },
        ]

        for spec in rule_specs:
            _, created = NotificationRule.objects.get_or_create(
                name=spec['name'],
                defaults={
                    'event_type': spec['event_type'],
                    'template': spec['template'],
                    'recipient_roles': spec['recipient_roles'],
                    'conditions': spec['conditions'],
                    'is_active': True,
                },
            )
            rules_created += int(created)

        for alert in InventoryAlert.objects.filter(is_resolved=False).select_related('product'):
            metadata = {'event': alert.alert_type, 'inventory_alert_id': alert.id, 'store': alert.store}
            already_exists = Notification.objects.filter(
                related_product=alert.product,
                metadata__inventory_alert_id=alert.id,
            ).exists()
            if already_exists:
                continue

            created = create_role_notifications(
                title=alert.get_alert_type_display(),
                message=alert.message,
                priority='critical' if alert.priority == 'critical' else 'high',
                related_product=alert.product,
                metadata=metadata,
            )
            notifications_created += len(created)

        self.stdout.write(self.style.SUCCESS(
            f'Created {templates_created} templates, {rules_created} rules, and {notifications_created} notifications.'
        ))
